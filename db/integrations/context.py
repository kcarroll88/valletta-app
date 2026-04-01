"""
context.py — Builds the live context block injected into team member system prompts.
Includes both integration data (Gmail, Discord, social) and relevant project files.
Returns an empty string if no data exists.
"""

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

_CONTEXT_CACHE: dict = {}  # {member: {"text": str, "built_at": float}}
CONTEXT_CACHE_TTL = 1800  # 30 minutes

# Which file categories/keywords are relevant to each team member.
# Each entry: list of dicts with 'categories' (DB category values) and/or
# 'name_keywords' (matched against filename, case-insensitive).
FILES_CONFIG: dict[str, list[dict]] = {
    "quinn": [
        {"categories": ["PR"], "name_keywords": []},
        {"categories": [], "name_keywords": ["contract", "agreement", "deal", "legal", "license", "terms"]},
    ],
    "felix": [
        {"categories": ["PR"], "name_keywords": []},
        {"categories": [], "name_keywords": ["contract", "agreement", "deal", "plan", "budget"]},
    ],
    "nina": [
        {"categories": ["PR"], "name_keywords": ["press", "kit", "bio", "release"]},
    ],
    "eli": [
        {"categories": ["PR"], "name_keywords": ["sync", "license", "agreement", "contract"]},
    ],
    "marco": [
        {"categories": ["PR"], "name_keywords": ["venue", "booking", "contract", "agreement", "show"]},
    ],
    "cass": [
        {"categories": ["Social Media"], "name_keywords": []},
    ],
    "priya": [
        {"categories": ["Social Media"], "name_keywords": ["campaign", "marketing", "plan"]},
    ],
    "tara": [
        {"categories": ["PR"], "name_keywords": []},
        {"categories": [], "name_keywords": ["task", "plan", "budget", "roadmap"]},
    ],
    "iris": [
        {"categories": ["PR"], "name_keywords": []},
        {"categories": [], "name_keywords": ["contact", "roster", "directory"]},
    ],
}

# Token budget: max chars per file, max total chars across all files
MAX_CHARS_PER_FILE = 8000
MAX_CHARS_TOTAL    = 16000

# Which platforms + keywords are relevant to each team member
MEMBER_CONFIG = {
    "felix": {
        "gmail":     {"limit": 10, "keywords": []},
        "discord":   {"limit": 10},
        "youtube":   {"limit": 3},
        "instagram": {"limit": 3},
        "tiktok":    {"limit": 3},
        "analytics": {"limit": 1},
        "calendar":  {"limit": 30},
        "inventory": {},
    },
    "nina": {
        "gmail":     {"limit": 10, "keywords": ["press", "feature", "interview", "review", "media", "journalist"]},
        "instagram": {"limit": 5},
        "youtube":   {"limit": 3},
    },
    "cass": {
        "instagram": {"limit": 10},
        "tiktok":    {"limit": 10},
        "youtube":   {"limit": 5},
    },
    "marco": {
        "discord":   {"limit": 20},
        "gmail":     {"limit": 10, "keywords": ["booking", "show", "venue", "festival", "gig", "tour", "support slot"]},
        "calendar":  {"limit": 30},
    },
    "priya": {
        "instagram": {"limit": 5},
        "tiktok":    {"limit": 5},
        "youtube":   {"limit": 5},
    },
    "eli": {
        "gmail": {"limit": 10, "keywords": ["sync", "license", "licensing", "placement", "supervisor", "music library", "royalt"]},
    },
    "dot": {
        "gmail":     {"limit": 10, "keywords": []},
        "youtube":   {"limit": 5},
        "discord":   {"limit": 10},
        "instagram": {"limit": 5},
        "tiktok":    {"limit": 5},
    },
    "scout": {
        "discord": {"limit": 50},
        "ideas":   {"limit": 20},
    },
    "finn": {
        "finance":   {"limit": 1},
        "calendar":  {"limit": 20},
        "drive":     {"limit": 10},
        "analytics": {"limit": 1},
    },
    "tara": {
        "calendar": {"limit": 30},
        "ideas":    {"limit": 30},
    },
    "iris": {
        "calendar": {"limit": 10},
    },
}


def _connected_platforms(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT platform FROM integration_connections WHERE status='connected'"
    ).fetchall()
    connected = set()
    for (p,) in rows:
        if p == "google":
            connected.add("gmail")
            connected.add("youtube")
        else:
            connected.add(p)
    return connected


def _relative_time(iso_str: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(tz=timezone.utc) - dt
        days = delta.days
        if days == 0:
            hours = delta.seconds // 3600
            return f"{hours}h ago" if hours > 0 else "just now"
        if days == 1:
            return "yesterday"
        return f"{days} days ago"
    except Exception:
        return iso_str[:10]


def _gmail_block(conn: sqlite3.Connection, limit: int, keywords: list[str]) -> str | None:
    rows = conn.execute(
        "SELECT sender, subject, received_at, body_preview FROM integration_messages WHERE platform='gmail' ORDER BY received_at DESC LIMIT ?",
        (limit * 3,),  # fetch extra for keyword filtering
    ).fetchall()
    if not rows:
        return None

    filtered = []
    for sender, subject, received_at, body_preview in rows:
        if keywords:
            subj_lower = (subject or "").lower()
            send_lower = (sender or "").lower()
            if not any(kw in subj_lower or kw in send_lower for kw in keywords):
                continue
        filtered.append((sender, subject, received_at, body_preview))
        if len(filtered) >= limit:
            break

    # Fall back to unfiltered if keywords reduced to zero
    if not filtered and keywords:
        filtered = [(r[0], r[1], r[2], r[3]) for r in rows[:limit]]

    if not filtered:
        return None

    lines = [f"[GMAIL — {len(filtered)} recent messages]"]
    for sender, subject, received_at, body_preview in filtered:
        subj = (subject or "(no subject)")[:80]
        send = (sender or "unknown")[:50]
        date_label = _relative_time(received_at)
        lines.append(f"  From: {send}")
        lines.append(f"  Subject: {subj}")
        lines.append(f"  Date: {date_label}")
        body = (body_preview or "").strip()
        if body:
            preview = body[:500]
            if len(body) > 500:
                preview += "\n  [...]"
            lines.append("  ---")
            for body_line in preview.splitlines():
                lines.append(f"  {body_line}")
        lines.append("")
    # Remove trailing blank line
    if lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _discord_block(conn: sqlite3.Connection, limit: int) -> str | None:
    rows = conn.execute(
        "SELECT channel, sender, body_preview, received_at FROM integration_messages WHERE platform='discord' ORDER BY received_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    if not rows:
        return None
    lines = [f"[DISCORD — {len(rows)} recent messages]"]
    for channel, sender, body, received_at in rows:
        text = (body or "")[:100].replace("\n", " ")
        lines.append(f"  - #{channel} | {sender}: {text} ({_relative_time(received_at)})")
    return "\n".join(lines)


def _ideas_block(conn: sqlite3.Connection, limit: int) -> str | None:
    rows = conn.execute(
        "SELECT title, status, source_channel FROM ideas ORDER BY created_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    if not rows:
        return None
    lines = [f"[IDEAS BACKLOG — {len(rows)} recent ideas]"]
    for title, status, source_channel in rows:
        channel_str = f" (from #{source_channel})" if source_channel else ""
        lines.append(f"  - [{status}] {title}{channel_str}")
    return "\n".join(lines)


def _calendar_block(conn: sqlite3.Connection, days_ahead: int = 30, days_behind: int = 14) -> str | None:
    rows = conn.execute(
        """SELECT title, event_type, start_dt, end_dt, location, description
           FROM events
           WHERE start_dt >= datetime('now', ? || ' days')
             AND start_dt <= datetime('now', '+' || ? || ' days')
           ORDER BY start_dt ASC
           LIMIT 30""",
        (f"-{days_behind}", days_ahead),
    ).fetchall()
    if not rows:
        return None
    lines = [f"[CALENDAR — {len(rows)} upcoming/recent events]"]
    for title, event_type, start_dt, end_dt, location, description in rows:
        dt = None
        try:
            dt = datetime.fromisoformat(start_dt)
            day_name = dt.strftime("%A")
            date_str = f"{day_name}, {dt.strftime('%b')} {dt.day}, {dt.year}"
            if dt.hour or dt.minute:
                hour = dt.strftime("%I").lstrip("0") or "12"
                date_str += f" at {hour}:{dt.strftime('%M')} {dt.strftime('%p')}"
        except Exception:
            date_str = start_dt[:10] if start_dt else ""
        end_str = ""
        if end_dt and dt is not None:
            try:
                edt = datetime.fromisoformat(end_dt)
                if edt.date() != dt.date():
                    end_str = f" → {edt.strftime('%A')}, {edt.strftime('%b')} {edt.day}"
            except Exception:
                pass
        loc_str = f" @ {location}" if location else ""
        desc_str = f" — {description[:200]}" if description else ""
        lines.append(f"  [{event_type}] {title}: {date_str}{end_str}{loc_str}{desc_str}")
    return "\n".join(lines)


def _youtube_block(conn: sqlite3.Connection, limit: int) -> str | None:
    # Account metrics
    metric_row = conn.execute(
        "SELECT data FROM integration_metrics WHERE platform='youtube' AND metric_type='account' ORDER BY measured_at DESC LIMIT 1"
    ).fetchone()

    # Recent posts
    posts = conn.execute(
        """SELECT p.external_id, p.caption, p.published_at, m.data
           FROM integration_posts p
           LEFT JOIN integration_metrics m ON m.platform='youtube' AND m.metric_type='post' AND m.external_id=p.external_id
           WHERE p.platform='youtube'
           ORDER BY p.published_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()

    if not metric_row and not posts:
        return None

    lines = []
    if metric_row:
        try:
            stats = json.loads(metric_row[0])
            subs = stats.get("subscribers", "?")
            views = stats.get("total_views", "?")
            lines.append(f"[YOUTUBE — Subscribers: {subs} | Total views: {views}]")
        except Exception:
            lines.append("[YOUTUBE]")
    else:
        lines.append("[YOUTUBE]")

    for _, caption, published_at, metrics_json in posts:
        title = caption[:70] if caption else "(untitled)"
        stats_str = ""
        if metrics_json:
            try:
                m = json.loads(metrics_json)
                stats_str = f" — {m.get('views','?')} views, {m.get('likes','?')} likes"
            except Exception:
                pass
        lines.append(f"  - \"{title}\"{stats_str} ({_relative_time(published_at)})")

    return "\n".join(lines)


def _instagram_block(conn: sqlite3.Connection, limit: int) -> str | None:
    metric_row = conn.execute(
        "SELECT data FROM integration_metrics WHERE platform='instagram' AND metric_type='account' ORDER BY measured_at DESC LIMIT 1"
    ).fetchone()

    posts = conn.execute(
        """SELECT p.external_id, p.post_type, p.caption, p.published_at, m.data
           FROM integration_posts p
           LEFT JOIN integration_metrics m ON m.platform='instagram' AND m.metric_type='post' AND m.external_id=p.external_id
           WHERE p.platform='instagram'
           ORDER BY p.published_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()

    if not metric_row and not posts:
        return None

    lines = []
    if metric_row:
        try:
            stats = json.loads(metric_row[0])
            followers = stats.get("followers", "?")
            lines.append(f"[INSTAGRAM — Followers: {followers}]")
        except Exception:
            lines.append("[INSTAGRAM]")
    else:
        lines.append("[INSTAGRAM]")

    for _, post_type, caption, published_at, metrics_json in posts:
        text = (caption or "")[:70]
        stats_str = ""
        if metrics_json:
            try:
                m = json.loads(metrics_json)
                stats_str = f" — {m.get('likes','?')} likes, {m.get('comments','?')} comments"
            except Exception:
                pass
        lines.append(f"  - [{post_type}] {text}{stats_str} ({_relative_time(published_at)})")

    return "\n".join(lines)


def _tiktok_block(conn: sqlite3.Connection, limit: int) -> str | None:
    metric_row = conn.execute(
        "SELECT data FROM integration_metrics WHERE platform='tiktok' AND metric_type='account' ORDER BY measured_at DESC LIMIT 1"
    ).fetchone()

    posts = conn.execute(
        """SELECT p.external_id, p.caption, p.published_at, m.data
           FROM integration_posts p
           LEFT JOIN integration_metrics m ON m.platform='tiktok' AND m.metric_type='post' AND m.external_id=p.external_id
           WHERE p.platform='tiktok'
           ORDER BY p.published_at DESC LIMIT ?""",
        (limit,),
    ).fetchall()

    if not metric_row and not posts:
        return None

    lines = []
    if metric_row:
        try:
            stats = json.loads(metric_row[0])
            followers = stats.get("followers", "?")
            lines.append(f"[TIKTOK — Followers: {followers}]")
        except Exception:
            lines.append("[TIKTOK]")
    else:
        lines.append("[TIKTOK]")

    for _, caption, published_at, metrics_json in posts:
        text = (caption or "")[:70]
        stats_str = ""
        if metrics_json:
            try:
                m = json.loads(metrics_json)
                stats_str = f" — {m.get('views','?')} views, {m.get('likes','?')} likes"
            except Exception:
                pass
        lines.append(f"  - {text}{stats_str} ({_relative_time(published_at)})")

    return "\n".join(lines)


def _analytics_block(conn, cfg):
    limit = cfg.get("limit", 1)
    rows = conn.execute("""
        SELECT platform, metric_key, metric_value, metric_text, recorded_at
        FROM analytics_metrics
        ORDER BY recorded_at DESC, platform
    """).fetchall()
    if not rows:
        return ""
    lines = ["## Analytics"]
    by_platform = {}
    for r in rows:
        p = r[0]
        if p not in by_platform:
            by_platform[p] = []
        by_platform[p].append(r)
    for platform, metrics in by_platform.items():
        lines.append(f"\n### {platform.title()}")
        seen = set()
        for r in metrics:
            if r[1] in seen:
                continue
            seen.add(r[1])
            val = r[2] if r[2] is not None else r[3]
            lines.append(f"- {r[1]}: {val}")
    return "\n".join(lines)


def _finance_block(conn, limit=1):
    """Current year finance summary for Finn's context."""
    from datetime import datetime
    year = datetime.now().year
    try:
        entries = conn.execute(
            "SELECT entry_type, category, amount, sheet_tab FROM finance_entries WHERE year=? AND amount IS NOT NULL",
            (year,)
        ).fetchall()

        if not entries:
            # Try previous year
            year -= 1
            entries = conn.execute(
                "SELECT entry_type, category, amount, sheet_tab FROM finance_entries WHERE year=? AND amount IS NOT NULL",
                (year,)
            ).fetchall()

        if not entries:
            return f"[Finance] No finance data synced yet for {year}."

        income = sum(e[2] for e in entries if e[2] and e[2] > 0)
        expenses = sum(abs(e[2]) for e in entries if e[2] and e[2] < 0)
        # also count positive entries that are expenses by type
        from collections import defaultdict
        by_cat = defaultdict(float)
        for e in entries:
            cat = e[1] or e[3] or 'Other'
            by_cat[cat] += abs(e[2] or 0)

        sheet = conn.execute(
            "SELECT last_synced_at FROM finance_sheets WHERE year=? LIMIT 1", (year,)
        ).fetchone()
        synced = sheet[0][:10] if sheet else 'unknown'

        top_cats = sorted(by_cat.items(), key=lambda x: -x[1])[:5]
        cats_str = ', '.join(f"{c}: ${a:,.0f}" for c, a in top_cats)

        total = sum(abs(e[2] or 0) for e in entries)

        lines = [
            f"[Finance {year}] {len(entries)} entries, total activity: ${total:,.0f}",
            f"Top categories: {cats_str}",
            f"Last synced: {synced}",
        ]
        return '\n'.join(lines)
    except Exception as e:
        return f"[Finance] Error loading finance data: {e}"


def _inventory_block(conn: sqlite3.Connection) -> str | None:
    """Return a concise inventory summary from Square catalog + inventory tables."""
    try:
        rows = conn.execute(
            """SELECT ci.name, COALESCE(SUM(si.quantity), 0) AS qty
               FROM square_catalog_items ci
               LEFT JOIN square_inventory si ON si.catalog_item_id = ci.square_id
                   AND si.state = 'IN_STOCK'
               GROUP BY ci.square_id, ci.name
               ORDER BY qty ASC"""
        ).fetchall()
    except Exception:
        return None
    if not rows:
        return None

    out_of_stock = [(name, qty) for name, qty in rows if qty <= 0]
    in_stock = [(name, qty) for name, qty in rows if qty > 0]

    lines = [f"[INVENTORY — {len(rows)} item(s), {len(out_of_stock)} out of stock]"]
    # Show in-stock items sorted lowest-qty first (most at risk)
    for name, qty in in_stock[:12]:
        lines.append(f"  {name}: {int(qty)}")
    if out_of_stock:
        oos_names = ", ".join(name for name, _ in out_of_stock[:8])
        if len(out_of_stock) > 8:
            oos_names += f" (+{len(out_of_stock) - 8} more)"
        lines.append(f"  OUT OF STOCK: {oos_names}")
    return "\n".join(lines)


def _shows_block(conn: sqlite3.Connection, days_ahead: int = 30) -> str | None:
    """Return upcoming shows within the next N days from the shows table."""
    try:
        rows = conn.execute(
            """SELECT show_date, venue, city, state, status, notes
               FROM shows
               WHERE show_date >= date('now')
                 AND show_date <= date('now', ? || ' days')
               ORDER BY show_date ASC""",
            (f"+{days_ahead}",),
        ).fetchall()
    except Exception:
        return None
    if not rows:
        return None
    lines = [f"[SHOWS — next {days_ahead} days, {len(rows)} show(s)]"]
    for show_date, venue, city, state, status, notes in rows:
        location_parts = [p for p in [venue, city, state] if p]
        location_str = ", ".join(location_parts) if location_parts else "(TBD)"
        status_str = f" — {status}" if status else ""
        notes_str = f" ({notes[:80]})" if notes else ""
        lines.append(f"  {show_date}: {location_str}{status_str}{notes_str}")
    return "\n".join(lines)


def _files_block(member: str, conn: sqlite3.Connection, message: str) -> str | None:
    """
    Find files relevant to this team member and inject their text content.
    Uses FILES_CONFIG to determine which categories/keywords apply per member,
    then boosts files whose names match keywords in the user's message.
    """
    from .file_reader import extract_text

    file_rules = FILES_CONFIG.get(member)
    if not file_rules:
        return None

    msg_lower = message.lower()

    # Collect matching file rows from DB
    seen_ids: set[int] = set()
    candidates: list[tuple[int, str, str, str]] = []  # (id, filename, filepath, extension)

    for rule in file_rules:
        cats = rule.get("categories", [])
        kws  = rule.get("name_keywords", [])

        clauses, params = [], []
        if cats:
            placeholders = ",".join("?" * len(cats))
            clauses.append(f"category IN ({placeholders})")
            params.extend(cats)
        if kws:
            kw_clauses = " OR ".join("lower(filename) LIKE ?" for _ in kws)
            clauses.append(f"({kw_clauses})")
            params.extend(f"%{kw}%" for kw in kws)

        if not clauses:
            continue

        sql = f"SELECT id, filename, filepath, extension, COALESCE(subcategory,''), COALESCE(notes,'') FROM files WHERE {' OR '.join(clauses)}"
        for row in conn.execute(sql, params).fetchall():
            if row[0] not in seen_ids:
                seen_ids.add(row[0])
                candidates.append(row)

    if not candidates:
        return None

    # Sort: files whose name contains words from the user's message come first
    def relevance_score(row):
        searchable = f"{row[1]} {row[4]} {row[5]}".lower()
        return sum(1 for word in msg_lower.split() if len(word) > 3 and word in searchable)

    candidates.sort(key=relevance_score, reverse=True)

    # Extract text, respecting budget
    file_blocks = []
    total_chars = 0

    for file_id, filename, filepath, extension, _sub, _notes in candidates:
        if total_chars >= MAX_CHARS_TOTAL:
            # Budget spent — just list remaining filenames
            file_blocks.append(f"  [also available: {filename}]")
            continue

        full_path = PROJECT_ROOT / filepath
        if not full_path.exists():
            continue

        remaining = MAX_CHARS_TOTAL - total_chars
        per_file_limit = min(MAX_CHARS_PER_FILE, remaining)
        text = extract_text(full_path, max_chars=per_file_limit)

        if text:
            total_chars += len(text)
            # Truncation notice if we hit the per-file cap
            truncated = len(text) >= per_file_limit
            suffix = f"\n  [... truncated at {per_file_limit} chars]" if truncated else ""
            file_blocks.append(f"  === {filename} ===\n{text}{suffix}")
        else:
            # Can't extract text — note the file exists
            file_blocks.append(f"  [file exists but not text-readable: {filename} (.{extension})]")

    if not file_blocks:
        return None

    lines = [f"[PROJECT FILES — {len(candidates)} relevant file(s)]"]
    lines.extend(file_blocks)
    return "\n".join(lines)


def build_integration_context(member: str, conn: sqlite3.Connection, message: str = "") -> str:
    now = time.time()
    cached = _CONTEXT_CACHE.get(member)
    if cached and (now - cached["built_at"]) < CONTEXT_CACHE_TTL:
        return cached["text"]

    blocks = []

    # ── Integration data (Gmail, Discord, social) ──────────────────────────
    config = MEMBER_CONFIG.get(member)
    if config:
        connected = _connected_platforms(conn)
        for platform, opts in config.items():
            # ideas, finance, analytics, calendar, drive, and inventory are stored locally — no connection required
            if platform not in ("ideas", "finance", "analytics", "calendar", "drive", "inventory") and platform not in connected:
                continue
            block = None
            if platform == "gmail":
                block = _gmail_block(conn, opts.get("limit", 10), opts.get("keywords", []))
            elif platform == "discord":
                block = _discord_block(conn, opts.get("limit", 10))
            elif platform == "youtube":
                block = _youtube_block(conn, opts.get("limit", 3))
            elif platform == "instagram":
                block = _instagram_block(conn, opts.get("limit", 5))
            elif platform == "tiktok":
                block = _tiktok_block(conn, opts.get("limit", 5))
            elif platform == "ideas":
                block = _ideas_block(conn, opts.get("limit", 20))
            elif platform == "finance":
                block = _finance_block(conn, **opts)
            elif platform == "analytics":
                result = _analytics_block(conn, opts)
                block = result if result else None
            elif platform == "calendar":
                block = _calendar_block(conn, days_ahead=30, days_behind=14)
            elif platform == "inventory":
                block = _inventory_block(conn)
            if block:
                blocks.append(block)

    # ── Calendar (fallback for members not in MEMBER_CONFIG) ───────────────
    if not config or "calendar" not in config:
        cal_block = _calendar_block(conn, days_ahead=30)
        if cal_block:
            blocks.append(cal_block)

    # ── Shows (next 30 days — all team members) ────────────────────────────────
    shows_block = _shows_block(conn, days_ahead=30)
    if shows_block:
        blocks.append(shows_block)

    # ── Project files ──────────────────────────────────────────────────────
    files_block = _files_block(member, conn, message)
    if files_block:
        blocks.append(files_block)

    if not blocks:
        _CONTEXT_CACHE[member] = {"text": "", "built_at": now}
        return ""

    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
    result = (
        f"--- LIVE CONTEXT (as of {now_str}) ---\n"
        + "\n\n".join(blocks)
        + "\n--- END LIVE CONTEXT ---"
    )
    _CONTEXT_CACHE[member] = {"text": result, "built_at": now}
    return result
