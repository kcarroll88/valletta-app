"""
One-time seed script: imports Biz Strat companies as Sources and
V 2026 roadmap items as Tasks + Calendar Events.
Run from project root: python db/seed_roadmap.py
"""
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "valletta.db"

def now_ts():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    ts = now_ts()

    # ── Biz Strat Sources ────────────────────────────────────────────────────
    sources = [
        # Marketing
        ("Hold Tight",                "https://www.holdtight.co/about",        "Marketing outreach", "Marketing agency for artists"),
        ("Sick Set Media",            "https://sicksetmedia.com/",              "Marketing outreach", "Music marketing agency"),
        ("Suricate Music",            "https://www.suricatemusic.com/",         "Marketing outreach", "Music marketing agency"),
        ("Planetary Group",           "https://www.planetarygroup.com/",        "Marketing outreach", "Independent music marketing"),
        ("BlackStar Agency (Alt/Pop)","https://blackstaragency.com/clients/",   "Marketing outreach", "Alt/Pop focused marketing agency"),
        ("ViewManiac Agency (Alt/Pop)","https://viewmaniac.com/aboutus/",       "Marketing outreach", "Alt/Pop focused marketing agency"),
        # Management
        ("Gold Theory (Metal)",       "https://www.goldtheoryartists.com",      "Management search",  "Metal artist management company"),
        ("5B Artists (Metal)",        "https://5bam.com/",                      "Management search",  "Metal focused artist management"),
        ("Velvet Hammer (Alt/Pop)",   "https://www.velvethammer.net/",          "Management search",  "Alt/Pop artist management"),
        ("Q Prime (Alt/Pop)",         "https://qprime.com/",                    "Management search",  "Major Alt/Pop artist management"),
        ("Distilled Entertainment",   "https://www.distilledentertainment.com/","Management search",  "Alt/Pop management and booking"),
        ("Mythology Live (Alt/Pop)",  "https://mythology-live.com/",            "Management search",  "Alt/Pop management and booking"),
        # Booking
        ("Cobra Agency",              "https://www.cobra-agency.net/",          "Booking outreach",   "Independent booking agency"),
        ("Doomstar Booking",          "https://doomstarbookings.com/",          "Booking outreach",   "Booking agency"),
        ("Wasserman",                 "https://www.teamwass.com/",              "Booking outreach",   "Major booking agency"),
        # PR
        ("Purple Sage PR",            "https://purplesagepr.com/",              "PR campaign",        "Music PR company"),
        ("Starlight PR",              "https://starlightpr1.com/",              "PR campaign",        "Music PR company"),
    ]

    inserted_sources = 0
    for title, url, used_for, description in sources:
        existing = conn.execute("SELECT id FROM sources WHERE url = ?", (url,)).fetchone()
        if existing:
            print(f"  [skip] Source already exists: {title}")
            continue
        conn.execute(
            "INSERT INTO sources (title, url, source_type, description, used_for, accessed_at, created_at) VALUES (?,?,?,?,?,?,?)",
            (title, url, "service", description, used_for, ts[:10], ts),
        )
        inserted_sources += 1

    # ── 2026 Roadmap Tasks ───────────────────────────────────────────────────
    # (title, start_date, due_date, roadmap_category, description, priority)
    tasks = [
        ("Writing",               "2026-01-01", "2026-12-31", "writing",   "Ongoing songwriting throughout 2026",            "medium"),
        ("JV Babies",             "2026-01-01", "2026-12-31", "other",     "JV Babies project — ongoing",                    "medium"),
        ("Cart Music Shoot",      "2026-04-01", "2026-04-30", "recording", "Record at Cart Music. Cover or new single?",     "high"),
        ("2 Songs Recording",     "2026-05-01", "2026-05-31", "recording", "Record 2 songs for upcoming releases",           "high"),
        ("1st Single Release",    "2026-06-01", "2026-06-30", "release",   "Release the 1st single",                        "high"),
        ("1st Single PR Campaign","2026-07-01", "2026-07-31", "pr",        "PR campaign for 1st single",                    "high"),
        ("Spitting Video Release","2026-08-01", "2026-08-31", "release",   "Release Spitting music video",                  "medium"),
        ("Spitting PR Campaign",  "2026-09-01", "2026-09-30", "pr",        "PR campaign for Spitting video",                "medium"),
        ("2nd Single PR Campaign","2026-10-01", "2026-10-31", "pr",        "PR campaign for 2nd single release",            "high"),
    ]

    inserted_tasks = 0
    for title, start_date, due_date, category, description, priority in tasks:
        existing = conn.execute("SELECT id FROM tasks WHERE title = ? AND roadmap_category = ?", (title, category)).fetchone()
        if existing:
            print(f"  [skip] Task already exists: {title}")
            continue
        conn.execute(
            "INSERT INTO tasks (title, description, status, priority, start_date, due_date, roadmap_category, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (title, description, "todo", priority, start_date, due_date, category, ts, ts),
        )
        inserted_tasks += 1

    # ── 2026 Show Events ─────────────────────────────────────────────────────
    # (title, start_dt, location)
    shows = [
        ("LowHeaven Run",  "2026-04-01T18:00:00", ""),
        ("Moynoq Run",     "2026-05-01T18:00:00", ""),
        ("Hburg Fest",     "2026-05-15T14:00:00", "Harrisonburg"),
    ]

    inserted_shows = 0
    for title, start_dt, location in shows:
        existing = conn.execute("SELECT id FROM events WHERE title = ? AND start_dt LIKE '2026%'", (title,)).fetchone()
        if existing:
            print(f"  [skip] Event already exists: {title}")
            continue
        conn.execute(
            "INSERT INTO events (title, event_type, start_dt, location, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (title, "show", start_dt, location, ts, ts),
        )
        inserted_shows += 1

    conn.commit()
    conn.close()

    print(f"\nSeed complete:")
    print(f"  Sources inserted: {inserted_sources}")
    print(f"  Roadmap tasks inserted: {inserted_tasks}")
    print(f"  Show events inserted: {inserted_shows}")

if __name__ == "__main__":
    seed()
