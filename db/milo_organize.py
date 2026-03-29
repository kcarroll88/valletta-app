#!/usr/bin/env python3
"""
milo_organize.py — Milo's daily Drive file organization pass.
Reads the current folder structure, finds unorganized files,
and assigns them to the right folder using Claude.
Never deletes folders or moves already-organized files.
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

# ── System prompt ─────────────────────────────────────────────────────────────

MILO_SYSTEM = """You are Milo, the Librarian for Valletta, an independent rock band.
Your job is to assign unorganized Google Drive files to the correct folder in the band's filing system.

You will receive:
1. The current folder structure (id + name for each folder)
2. A list of unorganized files (id, name, mime_type)

Return a JSON array — one entry per file — with this exact structure:
[
  {
    "file_id": <integer>,
    "folder_id": <integer>,
    "new_folder_name": null,
    "parent_folder_id": null,
    "reasoning": "<one sentence>"
  },
  ...
]

Rules:
- Every file must get a folder_id assignment.
- If a file clearly belongs in a logical subcategory that does NOT exist yet, set:
    "new_folder_name": "The Subcategory Name",
    "parent_folder_id": <id of parent folder>
  and leave "folder_id" as null — Milo will create the subfolder and use its new ID.
- If a file is truly ambiguous, assign it to the Uncategorized folder.
- Google Drive folder entries (mime_type = application/vnd.google-apps.folder) should go to Uncategorized unless clearly categorized.
- Do NOT return any commentary outside the JSON array.

Folder guidance:
- Contracts & Legal: contracts, legal docs, agreements, NDAs
- Press & EPK: EPK docs, press releases, interview docs, bios
- Music & Recordings: audio files (mp3, wav, m4a), recording sessions, lyrics docs
- Finance: spreadsheets tracking money, income/expense records
- Tour & Shows: show/gig spreadsheets, stage plots, tour routing, setlists, venue files
- Art & Design: images, photos, PSD/AI design files, merch mockups, logos, thumbnails
- Band Admin: internal admin docs, meeting notes, band info spreadsheets, misc
- Uncategorized: anything ambiguous
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(msg: str) -> None:
    print(f"[{_now_str()}] {msg}", flush=True)


# ── DB helpers ────────────────────────────────────────────────────────────────

def migrate_google_drive_files(conn: sqlite3.Connection) -> int:
    """
    Copy any records from google_drive_files that aren't yet in drive_files.
    Maps field names as needed. Returns count of rows inserted.
    """
    rows = conn.execute(
        """SELECT g.google_file_id, g.name, g.mime_type, g.extension,
                  g.size_bytes, g.modified_at, g.web_url, g.icon_url, g.created_at
           FROM google_drive_files g
           WHERE NOT EXISTS (
               SELECT 1 FROM drive_files d WHERE d.drive_id = g.google_file_id
           )"""
    ).fetchall()

    if not rows:
        return 0

    now = _now_str()
    conn.executemany(
        """INSERT INTO drive_files
               (drive_id, name, mime_type, drive_url, thumbnail_url,
                size_bytes, modified_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (r[0], r[1], r[2], r[6], r[7],
             r[4], r[5], r[8] or now, now)
            for r in rows
        ],
    )
    conn.commit()
    return len(rows)


def load_folders(conn: sqlite3.Connection) -> dict[int, dict]:
    """Return {id: {name, parent_id, sort_order}} from drive_folders."""
    rows = conn.execute(
        "SELECT id, name, parent_id, sort_order FROM drive_folders ORDER BY sort_order"
    ).fetchall()
    return {
        r[0]: {"id": r[0], "name": r[1], "parent_id": r[2], "sort_order": r[3]}
        for r in rows
    }


def find_uncategorized_id(folders: dict[int, dict]) -> int:
    """Return the id of the Uncategorized folder (case-insensitive match)."""
    for fid, f in folders.items():
        if f["name"].lower() == "uncategorized":
            return fid
    raise RuntimeError("No 'Uncategorized' folder found in drive_folders. Cannot continue.")


def load_unorganized_files(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, name, mime_type FROM drive_files WHERE folder_id IS NULL ORDER BY id"
    ).fetchall()
    return [{"id": r[0], "name": r[1], "mime_type": r[2] or ""} for r in rows]


# ── Claude call ───────────────────────────────────────────────────────────────

def call_milo(folders: dict[int, dict], files: list[dict]) -> list[dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        _log("ERROR: ANTHROPIC_API_KEY not set. Aborting.")
        sys.exit(1)

    folder_list = [
        {"id": f["id"], "name": f["name"], "parent_id": f["parent_id"]}
        for f in folders.values()
    ]

    prompt = f"""## Current Folder Structure ({len(folder_list)} folders)
{json.dumps(folder_list, indent=2)}

## Unorganized Files ({len(files)} files)
{json.dumps(files, indent=2)}

Assign every file above to the correct folder. Return only the JSON array.
"""

    client = anthropic.Anthropic(api_key=api_key)

    _log(f"Calling Milo (claude-haiku-4-5-20251001) with {len(files)} unorganized files...")

    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=4000,
        system=MILO_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        response = stream.get_final_message()

    # Extract text block (thinking block may come first)
    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        _log("ERROR: No text block in Milo's response.")
        _log(f"Full response: {response}")
        sys.exit(1)

    # Strip markdown fences if present
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        cleaned = cleaned.strip()

    # Extract outermost JSON array
    start = cleaned.find("[")
    end   = cleaned.rfind("]")
    if start == -1 or end == -1:
        _log(f"ERROR: Could not find JSON array in Milo's response:\n{raw_text[:500]}")
        sys.exit(1)

    json_str = cleaned[start:end + 1]

    try:
        decisions = json.loads(json_str)
    except json.JSONDecodeError as e:
        _log(f"ERROR: JSON parse failed: {e}\nRaw text:\n{raw_text[:500]}")
        sys.exit(1)

    return decisions


# ── Apply decisions ───────────────────────────────────────────────────────────

def apply_decisions(
    conn: sqlite3.Connection,
    decisions: list[dict],
    folders: dict[int, dict],
    uncategorized_id: int,
) -> tuple[int, int]:
    """
    Apply Milo's folder assignments.
    Returns (files_organized, new_folders_created).
    """
    files_organized  = 0
    new_folders_created = 0
    now = _now_str()

    # Track newly created folder names → id so we don't double-create
    created_folders: dict[str, int] = {}

    # Refresh folders reference as we create new ones
    current_folders = dict(folders)

    for d in decisions:
        file_id         = d.get("file_id")
        folder_id       = d.get("folder_id")
        new_folder_name = d.get("new_folder_name")
        parent_folder_id = d.get("parent_folder_id")
        reasoning       = d.get("reasoning", "")

        if file_id is None:
            _log(f"  SKIP: decision missing file_id: {d}")
            continue

        # Fetch file name and current folder_id for logging and guard
        row = conn.execute("SELECT name, folder_id FROM drive_files WHERE id=?", (file_id,)).fetchone()
        if not row:
            _log(f"  SKIP: drive_files id={file_id} not found")
            continue
        file_name = row[0]

        # Never overwrite a manually-set folder_id
        if row[1] is not None:
            _log(f"  SKIP: \"{file_name}\" already has folder_id={row[1]} — not overwriting")
            continue

        # Handle new subfolder creation
        if new_folder_name and not folder_id:
            cache_key = f"{parent_folder_id}::{new_folder_name}"
            if cache_key in created_folders:
                folder_id = created_folders[cache_key]
            else:
                # Check if folder already exists (from a previous run)
                existing = conn.execute(
                    "SELECT id FROM drive_folders WHERE name=? AND (parent_id=? OR (parent_id IS NULL AND ?=0))",
                    (new_folder_name, parent_folder_id, parent_folder_id or 0),
                ).fetchone()
                if existing:
                    folder_id = existing[0]
                    _log(f"  REUSE existing subfolder '{new_folder_name}' (id={folder_id})")
                else:
                    # Determine sort order: max + 1 among siblings, or 50 default
                    sort_row = conn.execute(
                        "SELECT MAX(sort_order) FROM drive_folders WHERE parent_id IS ?",
                        (parent_folder_id,)
                    ).fetchone()
                    new_sort = (sort_row[0] or 0) + 1

                    cursor = conn.execute(
                        "INSERT INTO drive_folders (name, parent_id, sort_order) VALUES (?, ?, ?)",
                        (new_folder_name, parent_folder_id, new_sort),
                    )
                    folder_id = cursor.lastrowid
                    conn.commit()
                    new_folders_created += 1
                    created_folders[cache_key] = folder_id
                    current_folders[folder_id] = {
                        "id": folder_id, "name": new_folder_name,
                        "parent_id": parent_folder_id, "sort_order": new_sort,
                    }
                    _log(f"  CREATED subfolder '{new_folder_name}' (id={folder_id})")

        # Validate folder_id
        if not folder_id or folder_id not in current_folders:
            _log(f"  WARN: invalid folder_id={folder_id} for '{file_name}' — routing to Uncategorized")
            folder_id = uncategorized_id

        # Resolve folder name for display
        folder_name = current_folders.get(folder_id, {}).get("name", f"id={folder_id}")

        # Assign file
        try:
            conn.execute(
                "UPDATE drive_files SET folder_id=?, updated_at=? WHERE id=?",
                (folder_id, now, file_id),
            )
            conn.commit()
            files_organized += 1
            _log(f'  [MILO] Assigned "{file_name}" → "{folder_name}"')
        except Exception as e:
            _log(f"  ERROR assigning file id={file_id}: {e}")

    return files_organized, new_folders_created


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    _log("=" * 60)
    _log("Milo Organize — starting daily organization pass")
    _log("=" * 60)

    conn = sqlite3.connect(DB_PATH)

    try:
        # Step 1: Migrate google_drive_files → drive_files if needed
        migrated = migrate_google_drive_files(conn)
        if migrated > 0:
            _log(f"Migrated {migrated} records from google_drive_files → drive_files")
        else:
            _log("No migration needed (drive_files already up to date)")

        # Step 2: Load folder structure
        folders = load_folders(conn)
        uncategorized_id = find_uncategorized_id(folders)
        _log(f"Loaded {len(folders)} folders (Uncategorized id={uncategorized_id})")

        # Step 3: Find unorganized files
        unorganized = load_unorganized_files(conn)
        _log(f"Found {len(unorganized)} unorganized file(s)")

        if not unorganized:
            _log("All files organized. Nothing to do.")
            return

        # Step 4: Call Claude
        decisions = call_milo(folders, unorganized)
        _log(f"Received {len(decisions)} decision(s) from Claude")

        # Step 5: Apply decisions
        files_organized, new_folders = apply_decisions(
            conn, decisions, folders, uncategorized_id
        )

        _log("=" * 60)
        _log(f"Done. {files_organized} files organized, {new_folders} new folders created.")
        _log("=" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
