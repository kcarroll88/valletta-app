#!/usr/bin/env python3
"""
extract_email_contacts.py — Email contact extraction pipeline
Maintained by Rex

Pulls unique senders from Gmail integration data, classifies them via Claude,
and inserts real contacts/businesses into the DB.

Usage:
    python db/extract_email_contacts.py

Or import and call:
    from db.extract_email_contacts import run_extraction
    run_extraction("/path/to/valletta.db")
"""

import json
import os
import re
import sqlite3
from pathlib import Path

import anthropic
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "db" / "valletta.db"

load_dotenv(PROJECT_ROOT / ".env")

BATCH_SIZE = 25
MODEL = "claude-haiku-4-5-20251001"

# ── Pre-filter patterns ───────────────────────────────────────────────────────

JUNK_LOCAL_PARTS = [
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "notifications", "newsletter", "updates", "mailer",
    "bounce", "digest", "alerts", "postmaster", "daemon",
    "automailer", "automated", "auto-reply", "autoreply",
    "unsubscribe", "feedback", "replies", "reply",
]

# "info@" and "support@" can be legit outreach addresses for orgs,
# so we only skip them when combined with known bulk-sending domains
JUNK_DOMAINS = [
    "mailchimp", "sendgrid", "constantcontact", "hubspot",
    "mailgun", "amazonses", "sparkpost", "mandrill",
    "klaviyo", "sailthru", "exacttarget", "marketo",
]

# Domains that are always automated/junk regardless of local part
ALWAYS_JUNK_DOMAINS = [
    "noreply.github.com", "notifications.google.com",
]


def _is_prefilter_junk(email: str) -> bool:
    """Return True if the email address is obviously automated/junk."""
    if not email or "@" not in email:
        return True
    local, domain = email.lower().rsplit("@", 1)

    # Check always-junk full domains
    if domain in ALWAYS_JUNK_DOMAINS:
        return True

    # Check junk local parts (exact match or contains)
    for pattern in JUNK_LOCAL_PARTS:
        if pattern in local:
            return True

    # Check known bulk-sending service domains
    for junk_domain in JUNK_DOMAINS:
        if junk_domain in domain:
            return True

    return False


# ── DB helpers ────────────────────────────────────────────────────────────────

def _get_unique_senders(conn: sqlite3.Connection) -> list[dict]:
    """
    Pull all unique sender email addresses from Gmail messages.
    Returns list of {email, name, subjects}.
    """
    cur = conn.execute(
        """
        SELECT sender, subject
        FROM integration_messages
        WHERE platform = 'gmail'
          AND sender IS NOT NULL
          AND sender != ''
        ORDER BY received_at DESC
        """
    )
    rows = cur.fetchall()

    # Group by extracted email address
    sender_map: dict[str, dict] = {}
    for sender_raw, subject in rows:
        email, name = _parse_sender(sender_raw)
        if not email:
            continue
        email_lower = email.lower().strip()
        if email_lower not in sender_map:
            sender_map[email_lower] = {
                "email": email_lower,
                "name": name or "",
                "subjects": [],
            }
        if subject and len(sender_map[email_lower]["subjects"]) < 5:
            sender_map[email_lower]["subjects"].append(subject)

    return list(sender_map.values())


def _parse_sender(sender_raw: str) -> tuple[str, str]:
    """
    Parse a sender string into (email, name).
    Handles formats:
      - "Name <email@example.com>"
      - "email@example.com"
    """
    if not sender_raw:
        return "", ""
    sender_raw = sender_raw.strip()
    # Try "Name <email>" format
    match = re.match(r'^(.*?)\s*<([^>]+)>\s*$', sender_raw)
    if match:
        name = match.group(1).strip().strip('"')
        email = match.group(2).strip()
        return email, name
    # Bare email address
    if "@" in sender_raw:
        return sender_raw.strip(), ""
    return "", ""


def _get_existing_contact_emails(conn: sqlite3.Connection) -> set[str]:
    cur = conn.execute("SELECT LOWER(email) FROM contacts WHERE email IS NOT NULL")
    return {row[0] for row in cur.fetchall()}


def _get_existing_source_titles(conn: sqlite3.Connection) -> set[str]:
    cur = conn.execute("SELECT LOWER(title) FROM sources WHERE title IS NOT NULL")
    return {row[0] for row in cur.fetchall()}


def role_to_tag(role: str, contact_type: str) -> str:
    """Map a contact's role string and type to a UI tag value."""
    role_lower = role.lower() if role else ''
    if contact_type == 'band':
        return 'Band'
    if any(w in role_lower for w in ['venue', 'club', 'theater', 'theatre', 'hall', 'bar', 'festival']):
        return 'Venue'
    if any(w in role_lower for w in ['booking', 'agent', 'agency']):
        return 'Booking'
    if any(w in role_lower for w in ['pr ', 'publicist', 'public relations']):
        return 'PR'
    if any(w in role_lower for w in ['press', 'journalist', 'blog', 'magazine', 'media', 'writer']):
        return 'Press'
    if any(w in role_lower for w in ['label', 'records', 'recording']):
        return 'Label'
    if any(w in role_lower for w in ['manag']):
        return 'Management'
    if any(w in role_lower for w in ['collaborat', 'artist', 'musician', 'producer']):
        return 'Collaborator'
    return 'Other'


def _insert_contact(conn: sqlite3.Connection, item: dict) -> bool:
    """Insert a person or band into contacts. Returns True if inserted."""
    notes = item.get("role", "")
    contact_type = item.get("type", "person")
    if contact_type == "band":
        notes = f"Band/Artist — {notes}" if notes else "Band/Artist"

    tag = role_to_tag(item.get("role", ""), contact_type)

    conn.execute(
        """
        INSERT INTO contacts (name, email, role, notes, category, outreach_status, tag)
        VALUES (?, ?, ?, ?, 'other', 'not_contacted', ?)
        """,
        (
            item.get("name") or item.get("email", ""),
            item.get("email", "").lower(),
            item.get("role", ""),
            notes,
            tag,
        ),
    )
    return True


def _insert_source(conn: sqlite3.Connection, item: dict) -> bool:
    """Insert a business into sources. Returns True if inserted."""
    conn.execute(
        """
        INSERT INTO sources (title, source_type, used_for, description, created_at)
        VALUES (?, 'service', ?, ?, datetime('now'))
        """,
        (
            item.get("name") or item.get("email", ""),
            item.get("used_for", ""),
            f"Email contact: {item.get('email', '')} — {item.get('role', '')}",
        ),
    )
    return True


# ── Claude classification ─────────────────────────────────────────────────────

CLASSIFICATION_PROMPT = """\
You are helping a band (Valletta) organize their email contacts.

For each contact below, classify them as one of:
- "person" — an individual human (booking agent, venue contact, journalist, collaborator, fan, etc.)
- "band" — another band or artist (for collaboration/networking)
- "business" — a company, venue, label, agency, publication, PR firm, or other organization relevant to music industry outreach
- "junk" — newsletter, subscription service, automated sender, irrelevant marketing, or anything not worth tracking

Also extract:
- A clean display name (fix "firstname_lastname@..." → "Firstname Lastname" etc.)
- Their likely role/category (e.g. "Venue", "Booking Agent", "Music Blog", "Record Label", "PR Firm", "Band", "Journalist", "Collaborator")
- For businesses: a brief used_for note (e.g. "Booking outreach", "PR outreach", "Label outreach")

IMPORTANT: Only mark as "business" if it's a real music-industry-relevant organization worth outreach. Generic SaaS tools, utilities, and irrelevant companies should be "junk".

Return a JSON array (no markdown, no commentary — raw JSON only). Each item:
{
  "email": "original@email.com",
  "type": "person|band|business|junk",
  "name": "Clean Display Name",
  "role": "Their role",
  "used_for": "only for businesses — outreach category"
}

Contacts to classify:
"""


def _classify_batch(client: anthropic.Anthropic, batch: list[dict]) -> list[dict]:
    """Send a batch of contacts to Claude for classification. Returns classified items."""
    contacts_json = json.dumps(
        [{"email": c["email"], "name": c["name"], "subjects": c["subjects"]} for c in batch],
        indent=2
    )
    prompt = CLASSIFICATION_PROMPT + contacts_json

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        classified = json.loads(raw)
        return classified if isinstance(classified, list) else []

    except json.JSONDecodeError as e:
        print(f"  [warn] JSON parse error in batch: {e}")
        return []
    except anthropic.APIError as e:
        print(f"  [warn] Claude API error in batch: {e}")
        return []
    except Exception as e:
        print(f"  [warn] Unexpected error in batch: {e}")
        return []


# ── Main pipeline ─────────────────────────────────────────────────────────────

def run_extraction(db_path: str | Path = DEFAULT_DB_PATH) -> dict:
    """
    Run the full email contact extraction pipeline.
    Idempotent — safe to run multiple times.

    Returns a summary dict with counts.
    """
    db_path = Path(db_path)
    api_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not api_key or api_key == "your-api-key-here":
        raise RuntimeError("ANTHROPIC_API_KEY not configured. Add it to your .env file.")

    client = anthropic.Anthropic(api_key=api_key)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    try:
        # ── Step 1: Collect unique senders ────────────────────────────────────
        print("Scanning Gmail messages...")
        all_senders = _get_unique_senders(conn)
        total_emails_scanned = conn.execute(
            "SELECT COUNT(*) FROM integration_messages WHERE platform='gmail'"
        ).fetchone()[0]

        print(f"  Found {len(all_senders)} unique senders from {total_emails_scanned} Gmail messages")

        # ── Step 2: Pre-filter obvious junk ──────────────────────────────────
        to_classify = []
        prefiltered = 0
        for sender in all_senders:
            if _is_prefilter_junk(sender["email"]):
                prefiltered += 1
            else:
                to_classify.append(sender)

        print(f"  Pre-filtered {prefiltered} automated/junk addresses")
        print(f"  Sending {len(to_classify)} contacts to Claude for classification...")

        # ── Step 3: Load existing data to avoid duplicates ───────────────────
        existing_emails = _get_existing_contact_emails(conn)
        existing_sources = _get_existing_source_titles(conn)

        # ── Step 4: Classify in batches ───────────────────────────────────────
        all_classified: list[dict] = []
        for i in range(0, len(to_classify), BATCH_SIZE):
            batch = to_classify[i : i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(to_classify) + BATCH_SIZE - 1) // BATCH_SIZE
            print(f"  Classifying batch {batch_num}/{total_batches} ({len(batch)} contacts)...")
            classified = _classify_batch(client, batch)
            all_classified.extend(classified)

        # ── Step 5: Insert results ────────────────────────────────────────────
        people_bands_added = 0
        businesses_added = 0
        junk_skipped = 0
        already_existed = 0

        for item in all_classified:
            contact_type = item.get("type", "junk").lower()
            email = (item.get("email") or "").lower().strip()

            if contact_type == "junk":
                junk_skipped += 1
                continue

            if contact_type in ("person", "band"):
                if email in existing_emails:
                    already_existed += 1
                    continue
                if not email:
                    junk_skipped += 1
                    continue
                _insert_contact(conn, item)
                existing_emails.add(email)
                people_bands_added += 1

            elif contact_type == "business":
                name_lower = (item.get("name") or "").lower().strip()
                if not name_lower:
                    junk_skipped += 1
                    continue
                if name_lower in existing_sources:
                    already_existed += 1
                    continue
                _insert_source(conn, item)
                existing_sources.add(name_lower)
                businesses_added += 1

        conn.commit()

        # ── Step 6: Print summary ─────────────────────────────────────────────
        summary = {
            "emails_scanned": total_emails_scanned,
            "unique_senders": len(all_senders),
            "prefiltered": prefiltered,
            "sent_to_claude": len(to_classify),
            "people_bands_added": people_bands_added,
            "businesses_added": businesses_added,
            "junk_skipped": junk_skipped,
            "already_existed": already_existed,
        }

        print()
        print("Email Contact Extraction Complete")
        print("==================================")
        print(f"Emails scanned:              {summary['emails_scanned']}")
        print(f"Unique senders:              {summary['unique_senders']}")
        print(f"Pre-filtered (automated):    {summary['prefiltered']}")
        print(f"Sent to Claude:              {summary['sent_to_claude']}")
        print(f"  → People/Bands added:      {summary['people_bands_added']}")
        print(f"  → Businesses added:        {summary['businesses_added']}")
        print(f"  → Junk skipped:            {summary['junk_skipped']}")
        print(f"Already existed (skipped):   {summary['already_existed']}")

        return summary

    finally:
        conn.close()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_extraction(DEFAULT_DB_PATH)
