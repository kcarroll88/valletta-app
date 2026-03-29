#!/usr/bin/env python3
"""
iris_review.py — Iris daily contact audit
Reads all contacts, uses Claude to identify duplicates, missing fields,
and enrichment opportunities. Writes changes back to DB with audit trail.

Usage:
    python3 db/iris_review.py
"""

import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import anthropic
from dotenv import load_dotenv

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR   = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DB_PATH      = SCRIPT_DIR / "valletta.db"

load_dotenv(PROJECT_ROOT / ".env")

# ── Constants ─────────────────────────────────────────────────────────────────

IRIS_SYSTEM = """You are Iris, the Contact Data Steward for Valletta — an independent rock band.

Your job is to audit contact records and return structured JSON decisions about:
1. Duplicate detection — same person or venue listed as separate records
2. Missing critical fields — email, location (city/state), social links
3. Confident field corrections — obviously wrong city names, clearly fixable data

Rules you live by:
- NEVER suggest deleting a contact
- For duplicate pairs: flag both records with a note — do NOT auto-merge, that needs human review
- Be conservative on merges — only flag as duplicate when you are highly confident
- For field corrections: only update a field when you are very confident in the correct value
- Confidence levels: "high" (>90%), "medium" (70-90%), "low" (<70%)
- Only act on "high" confidence corrections; flag but don't update "medium" and "low"

Return a JSON object with this exact structure:
{
  "duplicate_pairs": [
    {
      "id_a": <contact_id>,
      "id_b": <contact_id>,
      "confidence": "high" | "medium" | "low",
      "rationale": "<why you think these are the same person/entity>"
    }
  ],
  "missing_fields": [
    {
      "id": <contact_id>,
      "missing": ["email", "city", "state", "social_links"],
      "note": "<brief context about why this enrichment matters>"
    }
  ],
  "field_corrections": [
    {
      "id": <contact_id>,
      "field": "city" | "state" | "email" | "role" | "company",
      "old_value": "<current value>",
      "new_value": "<corrected value>",
      "confidence": "high" | "medium" | "low",
      "rationale": "<why you're confident in this correction>"
    }
  ],
  "summary": "<2-3 sentence executive summary of this audit cycle>"
}

Only include entries where there is something real to flag. Empty arrays are fine.
Return only valid JSON. No commentary outside the JSON.
"""


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(msg: str) -> None:
    print(f"[{_now_str()}] {msg}", flush=True)


def load_contacts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT id, name, role, company, email, phone, notes, category,
                  outreach_status, tag, city, state, social_links
           FROM contacts
           ORDER BY id ASC"""
    ).fetchall()

    result = []
    for row in rows:
        social_raw = row[12] or "{}"
        try:
            social = json.loads(social_raw) if social_raw else {}
        except Exception:
            social = {}

        result.append({
            "id":             row[0],
            "name":           row[1] or "",
            "role":           row[2] or "",
            "company":        row[3] or "",
            "email":          row[4] or "",
            "phone":          row[5] or "",
            "notes":          row[6] or "",
            "category":       row[7] or "",
            "outreach_status": row[8] or "",
            "tag":            row[9] or "",
            "city":           row[10] or "",
            "state":          row[11] or "",
            "social_links":   social,
        })
    return result


def call_iris(contacts: list[dict]) -> dict:
    """Call Claude as Iris and get structured audit decisions."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        _log("ERROR: ANTHROPIC_API_KEY not set. Aborting.")
        sys.exit(1)

    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")

    prompt = f"""Today's date: {today}

## All Contacts ({len(contacts)} total)
{json.dumps(contacts, indent=2)}

Audit every contact above:
1. Check for duplicates — same person or entity in multiple records
2. Flag records missing critical fields (email, city/state, social_links)
3. Identify any confident field corrections

Be conservative. When in doubt on duplicates, don't flag. Only flag missing fields
for contacts where enrichment would be genuinely useful (skip records that are
clearly placeholder or test entries).

Return your full JSON decisions object now. No commentary outside the JSON.
"""

    client = anthropic.Anthropic(api_key=api_key)

    _log(f"Calling Iris (claude-sonnet-4-6) with {len(contacts)} contacts...")

    with client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        system=IRIS_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        response = stream.get_final_message()

    # Extract text from response (may have thinking block first)
    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        _log("ERROR: No text block in Iris's response.")
        _log(f"Full response: {response}")
        sys.exit(1)

    # Strip markdown code fences if present
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        cleaned = cleaned.strip()

    # Find the outermost JSON object
    start = cleaned.find("{")
    end   = cleaned.rfind("}")
    if start == -1 or end == -1:
        _log(f"ERROR: Could not find JSON object in Iris's response:\n{raw_text[:500]}")
        sys.exit(1)

    json_str = cleaned[start:end + 1]

    try:
        decisions = json.loads(json_str)
    except json.JSONDecodeError as e:
        _log(f"ERROR: JSON parse failed: {e}")
        _log(f"Full raw text:\n{raw_text}")
        sys.exit(1)

    return decisions


def apply_duplicate_flags(conn: sqlite3.Connection, pairs: list[dict]) -> int:
    """Flag duplicate pairs by appending a note to both records. Returns change count."""
    changes = 0
    now     = _now_str()

    for pair in pairs:
        id_a       = pair.get("id_a")
        id_b       = pair.get("id_b")
        confidence = pair.get("confidence", "medium")
        rationale  = pair.get("rationale", "")

        if not id_a or not id_b:
            continue

        # Only act on high-confidence duplicates automatically
        if confidence != "high":
            _log(f"  SKIP duplicate pair #{id_a}/#{ id_b} — confidence={confidence} (flagging skipped, needs manual review)")
            continue

        for contact_id, other_id in [(id_a, id_b), (id_b, id_a)]:
            row = conn.execute(
                "SELECT name, notes FROM contacts WHERE id=?",
                (contact_id,)
            ).fetchone()
            if not row:
                _log(f"  SKIP: contact #{contact_id} not found in DB")
                continue

            name, current_notes = row
            iris_flag = f"[IRIS {now[:10]}: possible duplicate of contact #{other_id} — review needed. {rationale}]"

            # Don't re-flag if already flagged for this pair
            if f"possible duplicate of contact #{other_id}" in (current_notes or ""):
                _log(f"  SKIP duplicate flag on #{contact_id} — already flagged")
                continue

            new_notes = ((current_notes or "") + "\n" + iris_flag).strip()
            try:
                conn.execute(
                    "UPDATE contacts SET notes=? WHERE id=?",
                    (new_notes, contact_id),
                )
                conn.commit()
                changes += 1
                _log(f"  [IRIS] Flagged contact #{contact_id} '{name}': possible duplicate of #{other_id}")
                _log(f"         Log: Updated contact #{contact_id} field notes: <previous> → appended duplicate flag (source: AI analysis)")
            except Exception as e:
                _log(f"  ERROR flagging contact #{contact_id}: {e}")

    return changes


def apply_missing_field_notes(conn: sqlite3.Connection, missing_list: list[dict]) -> int:
    """Add a note to contacts missing critical fields. Returns change count."""
    changes = 0
    now     = _now_str()

    for entry in missing_list:
        contact_id = entry.get("id")
        missing    = entry.get("missing", [])
        note_ctx   = entry.get("note", "")

        if not contact_id or not missing:
            continue

        row = conn.execute(
            "SELECT name, notes FROM contacts WHERE id=?",
            (contact_id,)
        ).fetchone()
        if not row:
            _log(f"  SKIP: contact #{contact_id} not found in DB")
            continue

        name, current_notes = row
        missing_str = ", ".join(missing)
        iris_note   = f"[IRIS {now[:10]}: missing {missing_str} — recommend enriching. {note_ctx}]"

        # Don't re-add if a recent Iris missing-field note already covers the same fields
        if f"missing {missing_str}" in (current_notes or ""):
            _log(f"  SKIP missing-field note on #{contact_id} — already flagged")
            continue

        new_notes = ((current_notes or "") + "\n" + iris_note).strip()
        try:
            conn.execute(
                "UPDATE contacts SET notes=? WHERE id=?",
                (new_notes, contact_id),
            )
            conn.commit()
            changes += 1
            _log(f"  [IRIS] Flagged contact #{contact_id} '{name}': missing {missing_str}")
            _log(f"         Log: Updated contact #{contact_id} field notes: <previous> → appended missing-fields note (source: AI analysis)")
        except Exception as e:
            _log(f"  ERROR adding missing-field note to contact #{contact_id}: {e}")

    return changes


def apply_field_corrections(conn: sqlite3.Connection, corrections: list[dict]) -> int:
    """Apply confident field corrections. Returns change count."""
    changes = 0
    now     = _now_str()

    # Map field names to actual DB column names
    ALLOWED_FIELDS = {"city", "state", "email", "role", "company"}

    for correction in corrections:
        contact_id = correction.get("id")
        field      = correction.get("field", "")
        old_value  = correction.get("old_value", "")
        new_value  = correction.get("new_value", "")
        confidence = correction.get("confidence", "low")
        rationale  = correction.get("rationale", "")

        if not contact_id or field not in ALLOWED_FIELDS or not new_value:
            _log(f"  SKIP correction on #{contact_id} — invalid field '{field}' or missing values")
            continue

        # Only apply high-confidence corrections automatically
        if confidence != "high":
            _log(f"  SKIP correction on #{contact_id} field '{field}' — confidence={confidence}")
            continue

        row = conn.execute(
            f"SELECT name, {field}, notes FROM contacts WHERE id=?",
            (contact_id,)
        ).fetchone()
        if not row:
            _log(f"  SKIP: contact #{contact_id} not found in DB")
            continue

        name, current_val, current_notes = row

        # Verify old_value matches (sanity check)
        if current_val and current_val.strip() != old_value.strip():
            _log(f"  SKIP correction on #{contact_id} field '{field}' — current value '{current_val}' doesn't match expected '{old_value}'")
            continue

        # Append correction log to notes
        iris_correction_note = (
            f"[IRIS {now[:10]}: corrected {field}: '{old_value}' → '{new_value}'. "
            f"Confidence: {confidence}. {rationale}]"
        )
        new_notes = ((current_notes or "") + "\n" + iris_correction_note).strip()

        try:
            conn.execute(
                f"UPDATE contacts SET {field}=?, notes=? WHERE id=?",
                (new_value, new_notes, contact_id),
            )
            conn.commit()
            changes += 1
            _log(f"  [IRIS] Updated contact #{contact_id} '{name}' field {field}: '{old_value}' → '{new_value}'")
            _log(f"         Log: Updated contact #{contact_id} field {field}: {old_value} → {new_value} (source: AI analysis, confidence: {confidence})")
        except Exception as e:
            _log(f"  ERROR correcting contact #{contact_id} field '{field}': {e}")

    return changes


def main():
    _log("=" * 60)
    _log("Iris Review — starting daily contact audit")
    _log("=" * 60)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        contacts = load_contacts(conn)
        _log(f"Loaded {len(contacts)} contacts from DB")

        if not contacts:
            _log("No contacts found. Exiting.")
            return

        decisions = call_iris(contacts)

        summary = decisions.get("summary", "")
        if summary:
            _log(f"\nIris's Summary: {summary}\n")

        duplicate_pairs = decisions.get("duplicate_pairs", [])
        missing_fields  = decisions.get("missing_fields", [])
        corrections     = decisions.get("field_corrections", [])

        _log(
            f"Processing: {len(duplicate_pairs)} duplicate pair(s), "
            f"{len(missing_fields)} missing-field flag(s), "
            f"{len(corrections)} field correction(s)..."
        )

        dup_changes     = apply_duplicate_flags(conn, duplicate_pairs)
        missing_changes = apply_missing_field_notes(conn, missing_fields)
        correction_changes = apply_field_corrections(conn, corrections)

        total = dup_changes + missing_changes + correction_changes
        _log(
            f"\nDone. {dup_changes} duplicate flag(s), "
            f"{missing_changes} missing-field note(s), "
            f"{correction_changes} field correction(s). "
            f"Total: {total} DB write(s)."
        )

    finally:
        conn.close()

    _log("=" * 60)
    _log("Iris Review — complete")
    _log("=" * 60)


if __name__ == "__main__":
    main()
