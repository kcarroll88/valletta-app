#!/usr/bin/env python3
"""Generate a structured tour briefing from tour_emails.txt using Claude."""

import os, sqlite3, json, re
from pathlib import Path
from datetime import datetime

import anthropic

PROJECT_ROOT = Path(__file__).parent.parent
EMAILS_FILE = Path(__file__).parent / "tour_emails.txt"
OUTPUT_FILE = Path(__file__).parent / "tour_briefing.txt"
DB_PATH = Path(__file__).parent / "valletta.db"

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

def read_email_chunks(filepath: Path, chunk_size: int = 80) -> list[str]:
    """Split tour_emails.txt into chunks of N emails each."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    # Split on the === dividers
    emails = [e.strip() for e in content.split("=" * 80) if e.strip()]
    chunks = []
    for i in range(0, len(emails), chunk_size):
        chunks.append("\n\n" + "="*80 + "\n\n".join(emails[i:i+chunk_size]))
    return chunks

def extract_from_chunk(chunk: str, chunk_num: int, total: int) -> dict:
    """Ask Claude to extract structured info from a batch of emails."""
    print(f"  Processing chunk {chunk_num}/{total}...")
    resp = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": f"""You are analyzing emails for the band Valletta to extract tour information.

Extract from these emails:
1. CONFIRMED SHOWS: Any confirmed/booked show dates (date, venue name, city/state, guarantee amount if mentioned)
2. PENDING SHOWS: Unconfirmed but in-discussion bookings
3. KEY CONTACTS: Bookers, promoters, venue contacts (name, email, venue/company)
4. ACTION ITEMS: Anything still needing follow-up
5. NOTES: Press coverage, requirements, important context

Return ONLY valid JSON:
{{
  "confirmed_shows": [{{"date": "", "venue": "", "city_state": "", "guarantee": "", "notes": ""}}],
  "pending_shows": [{{"date_approx": "", "venue": "", "city_state": "", "notes": ""}}],
  "contacts": [{{"name": "", "email": "", "company": "", "role": ""}}],
  "action_items": [""],
  "notes": [""]
}}

Skip Gmail system emails, security alerts, and irrelevant non-tour content.
If nothing relevant found, return empty arrays.

EMAILS:
{chunk[:40000]}"""}]
    )
    text = resp.content[0].text.strip()
    # Strip markdown fences if present
    text = re.sub(r'^```[a-z]*\n?', '', text)
    text = re.sub(r'\n?```$', '', text.strip())
    try:
        return json.loads(text)
    except Exception as e:
        print(f"    Warning: JSON parse error in chunk {chunk_num}: {e}")
        return {"confirmed_shows": [], "pending_shows": [], "contacts": [], "action_items": [], "notes": []}

def synthesize_briefing(all_data: list[dict]) -> str:
    """Merge all chunk results and produce final briefing document."""
    confirmed = []
    pending = []
    contacts = []
    action_items = []
    notes = []

    seen_shows = set()
    seen_contacts = set()
    seen_actions = set()

    for chunk in all_data:
        for show in chunk.get("confirmed_shows", []):
            key = f"{show.get('date','')}-{show.get('venue','')}"
            if key not in seen_shows and (show.get('date') or show.get('venue')):
                seen_shows.add(key)
                confirmed.append(show)
        for show in chunk.get("pending_shows", []):
            key = f"{show.get('date_approx','')}-{show.get('venue','')}"
            if key not in seen_shows and (show.get('date_approx') or show.get('venue')):
                seen_shows.add(key)
                pending.append(show)
        for c in chunk.get("contacts", []):
            key = c.get('email', c.get('name', ''))
            if key and key not in seen_contacts:
                seen_contacts.add(key)
                contacts.append(c)
        for item in chunk.get("action_items", []):
            if item and item not in seen_actions:
                seen_actions.add(item)
                action_items.append(item)
        for note in chunk.get("notes", []):
            if note and note not in notes:
                notes.append(note)

    now = datetime.now().strftime("%Y-%m-%d")
    lines = [f"VALLETTA — TOUR BRIEFING", f"Generated: {now}", ""]

    lines.append("== CONFIRMED SHOWS ==")
    if confirmed:
        for s in sorted(confirmed, key=lambda x: x.get('date', '')):
            line = f"{s.get('date','TBD')} | {s.get('venue','?')} | {s.get('city_state','')}"
            if s.get('guarantee'): line += f" | {s['guarantee']}"
            if s.get('notes'): line += f" | {s['notes']}"
            lines.append(line)
    else:
        lines.append("(none confirmed)")
    lines.append("")

    lines.append("== PENDING / IN DISCUSSION ==")
    if pending:
        for s in pending:
            line = f"{s.get('date_approx','TBD')} | {s.get('venue','?')} | {s.get('city_state','')}"
            if s.get('notes'): line += f" | {s['notes']}"
            lines.append(line)
    else:
        lines.append("(none pending)")
    lines.append("")

    lines.append("== KEY CONTACTS ==")
    if contacts:
        for c in contacts:
            line = f"{c.get('name','?')} | {c.get('email','')} | {c.get('company','')} | {c.get('role','')}"
            lines.append(line)
    else:
        lines.append("(none extracted)")
    lines.append("")

    lines.append("== ACTION ITEMS ==")
    for item in action_items:
        lines.append(f"- {item}")
    if not action_items:
        lines.append("(none)")
    lines.append("")

    lines.append("== NOTES ==")
    for note in notes[:15]:  # cap at 15 notes
        lines.append(f"- {note}")
    if not notes:
        lines.append("(none)")

    return "\n".join(lines)

def main():
    print("Reading tour emails...")
    chunks = read_email_chunks(EMAILS_FILE, chunk_size=80)
    print(f"Split into {len(chunks)} chunks")

    all_data = []
    for i, chunk in enumerate(chunks, 1):
        data = extract_from_chunk(chunk, i, len(chunks))
        all_data.append(data)

    print("Synthesizing briefing...")
    briefing = synthesize_briefing(all_data)

    OUTPUT_FILE.write_text(briefing, encoding="utf-8")
    print(f"Written to {OUTPUT_FILE} ({len(briefing)} chars)")
    print("\n--- BRIEFING PREVIEW ---")
    print(briefing[:2000])

    # Index in files table
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Check exact schema before inserting
    schema = conn.execute("PRAGMA table_info(files)").fetchall()
    col_names = [r['name'] for r in schema]
    print(f"\nfiles table columns: {col_names}")

    # Build insert using only columns that exist
    size = OUTPUT_FILE.stat().st_size
    existing = conn.execute("SELECT id FROM files WHERE filename='tour_briefing.txt'").fetchone()
    if existing:
        conn.execute("DELETE FROM files WHERE filename='tour_briefing.txt'")

    now_iso = datetime.now().isoformat()
    insert_data = {
        'filename': 'tour_briefing.txt',
        'filepath': 'db/tour_briefing.txt',
        'extension': '.txt',
        'size_bytes': size,
        'indexed_at': now_iso,  # NOT NULL — always include
    }
    # Add optional columns if they exist
    if 'category' in col_names: insert_data['category'] = 'PR'
    if 'subcategory' in col_names: insert_data['subcategory'] = 'Tour'
    if 'notes' in col_names: insert_data['notes'] = 'Tour briefing: confirmed shows, contacts, action items.'
    if 'created_at' in col_names: insert_data['created_at'] = now_iso
    if 'modified_at' in col_names: insert_data['modified_at'] = now_iso

    cols = ', '.join(insert_data.keys())
    placeholders = ', '.join(['?'] * len(insert_data))
    conn.execute(f"INSERT INTO files ({cols}) VALUES ({placeholders})", list(insert_data.values()))
    conn.commit()
    print("Indexed in files table.")

    # Create calendar events from confirmed shows
    event_schema = conn.execute("PRAGMA table_info(events)").fetchall()
    event_cols = [r['name'] for r in event_schema]
    print(f"events table columns: {event_cols}")

    events_created = 0
    tasks_created = 0

    # Final Claude call to get structured show/task data
    resp2 = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": f"""From this tour briefing, extract shows and action items as JSON.

{briefing}

Return ONLY valid JSON:
{{
  "shows": [{{"title": "Show @ VenueName", "date": "YYYY-MM-DD or null", "location": "City, ST", "description": "context"}}],
  "tasks": [{{"title": "action item description"}}]
}}"""}]
    )
    text2 = resp2.content[0].text.strip()
    text2 = re.sub(r'^```[a-z]*\n?', '', text2)
    text2 = re.sub(r'\n?```$', '', text2.strip())
    try:
        structured = json.loads(text2)

        now_iso = datetime.now().isoformat()

        for show in structured.get("shows", []):
            if not show.get("title"): continue
            # events table requires start_dt (ISO 8601 datetime), created_at, updated_at
            raw_date = show.get("date") or datetime.now().strftime('%Y-%m-%d')
            # Ensure it looks like a full ISO datetime
            if raw_date and len(raw_date) == 10:
                start_dt = raw_date + "T20:00:00"
            else:
                start_dt = raw_date

            ed = {
                'title': show['title'],
                'start_dt': start_dt,
                'location': show.get('location', ''),
                'description': show.get('description', ''),
                'event_type': 'show',
                'recurring': 'none',
                'created_at': now_iso,
                'updated_at': now_iso,
            }

            existing_event = conn.execute(
                "SELECT id FROM events WHERE title=?", (ed['title'],)
            ).fetchone()
            if not existing_event:
                ecols = ', '.join(ed.keys())
                eplaceholders = ', '.join(['?'] * len(ed))
                conn.execute(f"INSERT INTO events ({ecols}) VALUES ({eplaceholders})", list(ed.values()))
                events_created += 1

        task_schema = conn.execute("PRAGMA table_info(tasks)").fetchall()
        task_cols = [r['name'] for r in task_schema]
        for task in structured.get("tasks", []):
            if not task.get("title"): continue
            # tasks table requires status (NOT NULL), priority (NOT NULL), created_at, updated_at
            td = {
                'title': task['title'],
                'status': 'todo',
                'priority': 'medium',
                'created_at': now_iso,
                'updated_at': now_iso,
            }
            if 'roadmap_category' in task_cols: td['roadmap_category'] = 'Touring'
            if 'assignee' in task_cols: td['assignee'] = 'marco'

            existing_task = conn.execute(
                "SELECT id FROM tasks WHERE title=?", (td['title'],)
            ).fetchone()
            if not existing_task:
                tcols = ', '.join(td.keys())
                tplaceholders = ', '.join(['?'] * len(td))
                conn.execute(f"INSERT INTO tasks ({tcols}) VALUES ({tplaceholders})", list(td.values()))
                tasks_created += 1

        conn.commit()
        print(f"Created {events_created} calendar events, {tasks_created} tasks.")
    except Exception as e:
        print(f"Structured data extraction error: {e}")
        import traceback
        traceback.print_exc()

    conn.close()
    print("\nDone.")

if __name__ == "__main__":
    main()
