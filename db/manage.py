#!/usr/bin/env python3
"""
manage.py — Valletta calendar, task, source & sync CLI
Maintained by Rex

Commands:
    event add     Add a calendar event
    event list    List upcoming events
    event show    Show a single event by ID

    task add      Add a task
    task list     List tasks (filter by status/assignee)
    task update   Update task status or priority
    task show     Show a single task by ID

    file search   Search indexed files by name, category, or extension
    file list     List files with optional filters

    source add    Catalogue a source (web page, tool, document, etc.)
    source list   List catalogued sources
    source show   Show a single source by ID

    milo report   Show files with no category — needs Milo's attention

Run: python3 db/manage.py <command> [options]
     python3 db/manage.py --help
"""

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH      = PROJECT_ROOT / "db" / "valletta.db"


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_conn() -> sqlite3.Connection:
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        print("Run: python3 db/index_files.py  to initialise.")
        sys.exit(1)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_ts() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def fmt_row(row: sqlite3.Row) -> str:
    return "  " + "  ".join(f"{k}: {row[k]}" for k in row.keys() if row[k] is not None)


# ── Event commands ────────────────────────────────────────────────────────────

def event_add(args) -> None:
    conn = get_conn()
    ts = now_ts()
    cur = conn.execute(
        """
        INSERT INTO events (title, event_type, start_dt, end_dt, location, description, recurring, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (args.title, args.type, args.start, args.end, args.location, args.description,
         args.recurring or "none", ts, ts),
    )
    conn.commit()
    print(f"Event added (id={cur.lastrowid}): {args.title} on {args.start}")
    conn.close()


def event_list(args) -> None:
    conn = get_conn()
    query = "SELECT id, title, event_type, start_dt, end_dt, location FROM events"
    params = []
    if args.type:
        query += " WHERE event_type = ?"
        params.append(args.type)
    query += " ORDER BY start_dt"
    if args.limit:
        query += f" LIMIT {int(args.limit)}"
    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No events found.")
    for r in rows:
        print(f"[{r['id']}] {r['start_dt'][:16]}  {r['event_type'] or '':12}  {r['title']}"
              + (f"  @ {r['location']}" if r['location'] else ""))
    conn.close()


def event_show(args) -> None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (args.id,)).fetchone()
    if not row:
        print(f"No event with id={args.id}")
    else:
        for k in row.keys():
            if row[k] is not None:
                print(f"  {k:15} {row[k]}")
    conn.close()


# ── Task commands ─────────────────────────────────────────────────────────────

def task_add(args) -> None:
    conn = get_conn()
    ts = now_ts()
    cur = conn.execute(
        """
        INSERT INTO tasks (title, description, status, priority, due_date, assignee, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (args.title, args.description, args.status or "todo", args.priority or "medium",
         args.due, args.assignee, ts, ts),
    )
    conn.commit()
    print(f"Task added (id={cur.lastrowid}): {args.title}")
    conn.close()


def task_list(args) -> None:
    conn = get_conn()
    clauses, params = [], []
    if args.status:
        clauses.append("status = ?"); params.append(args.status)
    if args.assignee:
        clauses.append("assignee = ?"); params.append(args.assignee)
    if args.priority:
        clauses.append("priority = ?"); params.append(args.priority)
    query = "SELECT id, title, status, priority, due_date, assignee FROM tasks"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date"
    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No tasks found.")
    for r in rows:
        due = f"  due {r['due_date']}" if r['due_date'] else ""
        who = f"  → {r['assignee']}" if r['assignee'] else ""
        print(f"[{r['id']}] [{r['priority']:6}] [{r['status']:11}]  {r['title']}{due}{who}")
    conn.close()


def task_update(args) -> None:
    conn = get_conn()
    row = conn.execute("SELECT id FROM tasks WHERE id = ?", (args.id,)).fetchone()
    if not row:
        print(f"No task with id={args.id}")
        conn.close()
        return
    updates, params = [], []
    if args.status:
        updates.append("status = ?"); params.append(args.status)
    if args.priority:
        updates.append("priority = ?"); params.append(args.priority)
    if args.due:
        updates.append("due_date = ?"); params.append(args.due)
    if args.assignee:
        updates.append("assignee = ?"); params.append(args.assignee)
    if not updates:
        print("Nothing to update. Specify --status, --priority, --due, or --assignee.")
        conn.close()
        return
    updates.append("updated_at = ?"); params.append(now_ts())
    params.append(args.id)
    conn.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    print(f"Task {args.id} updated.")
    conn.close()


def task_show(args) -> None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (args.id,)).fetchone()
    if not row:
        print(f"No task with id={args.id}")
    else:
        for k in row.keys():
            if row[k] is not None:
                print(f"  {k:15} {row[k]}")
    conn.close()


# ── File commands ─────────────────────────────────────────────────────────────

def file_search(args) -> None:
    conn = get_conn()
    clauses, params = [], []
    if args.name:
        clauses.append("filename LIKE ?"); params.append(f"%{args.name}%")
    if args.category:
        clauses.append("category = ?"); params.append(args.category)
    if args.ext:
        clauses.append("extension = ?"); params.append(args.ext.lstrip(".").lower())
    query = "SELECT id, filepath, category, subcategory, size_bytes FROM files"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY filepath LIMIT 100"
    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No files found.")
    for r in rows:
        size = f"  {r['size_bytes']:,}b" if r['size_bytes'] else ""
        cat  = f"  [{r['category'] or '?'}/{r['subcategory'] or '-'}]"
        print(f"[{r['id']:4}]{cat}  {r['filepath']}{size}")
    conn.close()


def milo_report(args) -> None:
    """Show files the indexer couldn't categorise — Milo needs to route them."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, filepath FROM files WHERE category IS NULL ORDER BY filepath"
    ).fetchall()
    if not rows:
        print("All files are categorised. Milo's structure is fully in sync.")
    else:
        print(f"{len(rows)} uncategorised file(s) — route to Milo:\n")
        for r in rows:
            print(f"  [{r['id']:4}]  {r['filepath']}")
    conn.close()


def file_list(args) -> None:
    conn = get_conn()
    clauses, params = [], []
    if args.category:
        clauses.append("category = ?"); params.append(args.category)
    if args.subcategory:
        clauses.append("subcategory = ?"); params.append(args.subcategory)
    query = "SELECT id, filepath, category, subcategory FROM files"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY filepath"
    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No files found.")
    for r in rows:
        print(f"[{r['id']:4}]  {r['filepath']}")
    conn.close()


# ── Source commands ───────────────────────────────────────────────────────────

def source_add(args) -> None:
    conn = get_conn()
    ts = now_ts()
    cur = conn.execute(
        """
        INSERT INTO sources (title, url, source_type, description, used_by, used_for, accessed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (args.title, args.url, args.type or "other", args.description,
         args.used_by, args.used_for, args.accessed or ts[:10], ts),
    )
    conn.commit()
    print(f"Source catalogued (id={cur.lastrowid}): {args.title}")
    conn.close()


def source_list(args) -> None:
    conn = get_conn()
    clauses, params = [], []
    if args.type:
        clauses.append("source_type = ?"); params.append(args.type)
    if args.used_by:
        clauses.append("used_by = ?"); params.append(args.used_by)
    query = "SELECT id, title, source_type, used_by, used_for, url FROM sources"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    rows = conn.execute(query, params).fetchall()
    if not rows:
        print("No sources catalogued yet.")
    for r in rows:
        url_hint = f"  {r['url']}" if r['url'] else ""
        who = f"  (by {r['used_by']})" if r['used_by'] else ""
        ctx = f"  for: {r['used_for']}" if r['used_for'] else ""
        print(f"[{r['id']:3}] [{r['source_type']:10}]  {r['title']}{who}{ctx}{url_hint}")
    conn.close()


def source_show(args) -> None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM sources WHERE id = ?", (args.id,)).fetchone()
    if not row:
        print(f"No source with id={args.id}")
    else:
        for k in row.keys():
            if row[k] is not None:
                print(f"  {k:15} {row[k]}")
    conn.close()


# ── CLI wiring ────────────────────────────────────────────────────────────────

def main() -> None:
    p = argparse.ArgumentParser(description="Valletta project manager")
    sub = p.add_subparsers(dest="resource", required=True)

    # ── event ──────────────────────────────────────
    ep = sub.add_parser("event")
    esub = ep.add_subparsers(dest="action", required=True)

    ea = esub.add_parser("add")
    ea.add_argument("title")
    ea.add_argument("start", help="Start datetime, e.g. 2026-04-01T20:00")
    ea.add_argument("--end",         default=None)
    ea.add_argument("--type",        default=None,
                    choices=["show","rehearsal","recording","press","deadline","meeting","other"])
    ea.add_argument("--location",    default=None)
    ea.add_argument("--description", default=None)
    ea.add_argument("--recurring",   default="none",
                    choices=["none","daily","weekly","monthly"])

    el = esub.add_parser("list")
    el.add_argument("--type",  default=None)
    el.add_argument("--limit", default=None, type=int)

    es = esub.add_parser("show")
    es.add_argument("id", type=int)

    # ── task ───────────────────────────────────────
    tp = sub.add_parser("task")
    tsub = tp.add_subparsers(dest="action", required=True)

    ta = tsub.add_parser("add")
    ta.add_argument("title")
    ta.add_argument("--description", default=None)
    ta.add_argument("--status",   default="todo",   choices=["todo","in_progress","done","blocked"])
    ta.add_argument("--priority", default="medium", choices=["low","medium","high"])
    ta.add_argument("--due",      default=None, help="Due date, e.g. 2026-04-15")
    ta.add_argument("--assignee", default=None)

    tl = tsub.add_parser("list")
    tl.add_argument("--status",   default=None)
    tl.add_argument("--assignee", default=None)
    tl.add_argument("--priority", default=None)

    tu = tsub.add_parser("update")
    tu.add_argument("id", type=int)
    tu.add_argument("--status",   default=None, choices=["todo","in_progress","done","blocked"])
    tu.add_argument("--priority", default=None, choices=["low","medium","high"])
    tu.add_argument("--due",      default=None)
    tu.add_argument("--assignee", default=None)

    tsh = tsub.add_parser("show")
    tsh.add_argument("id", type=int)

    # ── file ───────────────────────────────────────
    fp = sub.add_parser("file")
    fsub = fp.add_subparsers(dest="action", required=True)

    fsr = fsub.add_parser("search")
    fsr.add_argument("--name",     default=None, help="Filename substring")
    fsr.add_argument("--category", default=None)
    fsr.add_argument("--ext",      default=None, help="Extension, e.g. mp3")

    fls = fsub.add_parser("list")
    fls.add_argument("--category",    default=None)
    fls.add_argument("--subcategory", default=None)

    # ── source ─────────────────────────────────────
    sp = sub.add_parser("source")
    ssub = sp.add_subparsers(dest="action", required=True)

    sa = ssub.add_parser("add")
    sa.add_argument("title")
    sa.add_argument("--url",         default=None)
    sa.add_argument("--type",        default="other",
                    choices=["web","document","tool","service","contact","other"])
    sa.add_argument("--description", default=None)
    sa.add_argument("--used-by",     dest="used_by",  default=None)
    sa.add_argument("--used-for",    dest="used_for", default=None)
    sa.add_argument("--accessed",    default=None, help="Date accessed, e.g. 2026-03-26")

    sl = ssub.add_parser("list")
    sl.add_argument("--type",    default=None)
    sl.add_argument("--used-by", dest="used_by", default=None)

    ssh = ssub.add_parser("show")
    ssh.add_argument("id", type=int)

    # ── milo ───────────────────────────────────────
    mp = sub.add_parser("milo")
    msub = mp.add_subparsers(dest="action", required=True)
    msub.add_parser("report")

    args = p.parse_args()

    dispatch = {
        ("event",  "add"):    event_add,
        ("event",  "list"):   event_list,
        ("event",  "show"):   event_show,
        ("task",   "add"):    task_add,
        ("task",   "list"):   task_list,
        ("task",   "update"): task_update,
        ("task",   "show"):   task_show,
        ("file",   "search"): file_search,
        ("file",   "list"):   file_list,
        ("source", "add"):    source_add,
        ("source", "list"):   source_list,
        ("source", "show"):   source_show,
        ("milo",   "report"): milo_report,
    }
    fn = dispatch.get((args.resource, args.action))
    if fn:
        fn(args)
    else:
        p.print_help()


if __name__ == "__main__":
    main()
