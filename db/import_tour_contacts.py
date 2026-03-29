import sqlite3, re
from pathlib import Path

DB = Path(__file__).parent / "valletta.db"
CONTACTS_FILE = Path(__file__).parent / "tour_contacts.txt"

# Skip obvious automated/system senders
SKIP_DOMAINS = {"google.com", "gmail.com", "instagram.com", "facebook.com", "dropbox.com",
                "youtube.com", "chatgpt.com", "openai.com", "apple.com", "icloud.com",
                "linkedin.com", "twitter.com", "x.com", "tiktok.com", "spotify.com"}

SKIP_NAMES = {"google", "instagram", "youtube", "dropbox", "facebook", "chatgpt",
              "apple", "linkedin", "twitter", "tiktok", "spotify", "no-reply", "noreply"}

def guess_tag(name, email, context):
    text = f"{name} {email} {context}".lower()
    if any(w in text for w in ["venue", "club", "bar", "hall", "theatre", "theater", "house", "room", "lounge", "live"]):
        return "Venue"
    if any(w in text for w in ["promot", "present", "production", "productions", "booking", "booker"]):
        return "Promoter"
    if any(w in text for w in ["label", "records", "music group"]):
        return "Label"
    if any(w in text for w in ["press", "pr ", "publicist", "media", "journalist"]):
        return "Press"
    if any(w in text for w in ["legal", "lawyer", "law", "attorney"]):
        return "Legal"
    if any(w in text for w in ["manager", "management"]):
        return "Manager"
    return "Other"

conn = sqlite3.connect(str(DB))
conn.row_factory = sqlite3.Row
added = skipped = 0

with open(CONTACTS_FILE, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("Name |") or line.startswith("---") or line.startswith("="):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 2:
            continue
        name = parts[0]
        email = parts[1] if len(parts) > 1 else ""
        context = parts[2] if len(parts) > 2 else ""

        if not name or name.lower() in ("unknown", "none", ""):
            skipped += 1
            continue

        # Skip system/automated senders
        domain = email.split("@")[-1].lower() if "@" in email else ""
        if domain in SKIP_DOMAINS or any(s in name.lower() for s in SKIP_NAMES):
            print(f"  skip (system): {name}")
            skipped += 1
            continue

        # Skip if already exists
        existing = conn.execute(
            "SELECT id FROM contacts WHERE LOWER(name)=LOWER(?) OR (email != '' AND email != 'NULL' AND email=?)",
            (name, email)
        ).fetchone()
        if existing:
            print(f"  skip (dup): {name}")
            skipped += 1
            continue

        tag = guess_tag(name, email, context)
        notes = f"Tour contact. Context: {context}" if context else "Tour contact from email export."
        conn.execute("""
            INSERT INTO contacts (name, email, tag, category, notes, created_at)
            VALUES (?, ?, ?, 'other', ?, datetime('now'))
        """, (name, email, tag, notes))
        added += 1
        print(f"  + {name} ({tag}) — {email}")

conn.commit()
conn.close()
print(f"\nDone. Added: {added}, Skipped: {skipped}")
