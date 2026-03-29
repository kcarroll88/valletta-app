#!/usr/bin/env python3
"""
index_files.py — Valletta file indexer
Maintained by Rex

Walks the project folder and upserts every file into the files table.
Incremental: re-running updates changed files and adds new ones.
Run from any directory; locates project root via its own path.

Usage:
    python3 db/index_files.py
    python3 db/index_files.py --dry-run
"""

import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH      = PROJECT_ROOT / "db" / "valletta.db"
SCHEMA_PATH  = PROJECT_ROOT / "db" / "schema.sql"

# Folders to skip entirely
SKIP_DIRS = {"team", "db", ".git", "__pycache__", ".DS_Store"}

# Category mapping: top-level folder name → (category, subcategory)
# Root-level files that belong to the system/team, not to media categories
SYSTEM_FILES = {"CLAUDE.md", "STRUCTURE.md"}

CATEGORY_MAP = {
    "Music": {
        "default":          ("Music", None),
        "Masters":          ("Music", "Masters"),
        "Pre-Production":   ("Music", "Pre-Production"),
        "Drum Tracks":      ("Music", "Drum Tracks"),
        "Bounces":          ("Music", "Bounces"),
        "Studio Sessions":  ("Music", "Studio Sessions"),
        "Loose Tracks":     ("Music", "Loose Tracks"),
    },
    "Videos": {
        "default":          ("Videos", None),
        "Music Videos":     ("Videos", "Music Videos"),
        "Promos":           ("Videos", "Promos"),
    },
    "Audio Clips":   {"default": ("Audio Clips", None)},
    "Photos":        {
        "default":          ("Photos", None),
        "Live Shows":       ("Photos", "Live Shows"),
        "Screenshots":      ("Photos", "Screenshots"),
    },
    "Assets":        {
        "default":          ("Assets", None),
        "Branding":         ("Assets", "Branding"),
        "Video Assets":     ("Assets", "Video Assets"),
    },
    "PR":            {
        "default":          ("PR", None),
        "Press Kit":        ("PR", "Press Kit"),
        "Contracts":        ("PR", "Contracts"),
    },
    "Social Media":  {"default": ("Social Media", None)},
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def init_db(conn: sqlite3.Connection) -> None:
    with open(SCHEMA_PATH, "r") as f:
        full_sql = f.read()

    # Separate ALTER TABLE statements (which are non-idempotent in SQLite)
    # from the rest of the schema so we can handle them gracefully.
    alter_lines = []
    other_lines = []
    for line in full_sql.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("ALTER TABLE"):
            alter_lines.append(stripped)
        else:
            other_lines.append(line)

    # Run all non-ALTER statements via executescript (handles multi-line CREATE TABLE)
    conn.executescript("\n".join(other_lines))

    # Run each ALTER TABLE individually, ignoring duplicate-column errors
    for stmt in alter_lines:
        try:
            conn.execute(stmt)
            conn.commit()
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                pass
            else:
                raise

    conn.commit()


def classify(rel_path: Path) -> tuple[str | None, str | None]:
    """Return (category, subcategory) for a relative file path."""
    parts = rel_path.parts
    if not parts:
        return None, None
    # Root-level system files
    if len(parts) == 1 and parts[0] in SYSTEM_FILES:
        return "System", None
    top = parts[0]
    if top not in CATEGORY_MAP:
        return None, None
    mapping = CATEGORY_MAP[top]
    # Check second-level folder if present
    if len(parts) > 2:
        second = parts[1]
        if second in mapping:
            return mapping[second]
    return mapping["default"]


def ts(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


def now_ts() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def iter_files(root: Path):
    """Yield (absolute_path, relative_path) for all project files."""
    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skipped directories in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fname in filenames:
            if fname.startswith("."):
                continue
            abs_path = Path(dirpath) / fname
            rel_path = abs_path.relative_to(root)
            yield abs_path, rel_path


def upsert_file(cursor: sqlite3.Cursor, abs_path: Path, rel_path: Path) -> str:
    """Insert or update a file record. Returns 'added' | 'updated' | 'unchanged'."""
    stat = abs_path.stat()
    modified_at = ts(stat.st_mtime)
    size_bytes  = stat.st_size
    filepath    = rel_path.as_posix()
    filename    = abs_path.name
    extension   = abs_path.suffix.lstrip(".").lower() or None
    category, subcategory = classify(rel_path)

    # Check existing record
    row = cursor.execute(
        "SELECT id, modified_at, size_bytes FROM files WHERE filepath = ?",
        (filepath,)
    ).fetchone()

    indexed_at = now_ts()

    if row is None:
        cursor.execute(
            """
            INSERT INTO files
                (filename, filepath, extension, category, subcategory,
                 size_bytes, modified_at, indexed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (filename, filepath, extension, category, subcategory,
             size_bytes, modified_at, indexed_at),
        )
        return "added"

    file_id, existing_modified, existing_size = row
    if existing_modified != modified_at or existing_size != size_bytes:
        cursor.execute(
            """
            UPDATE files
            SET filename=?, extension=?, category=?, subcategory=?,
                size_bytes=?, modified_at=?, indexed_at=?
            WHERE id=?
            """,
            (filename, extension, category, subcategory,
             size_bytes, modified_at, indexed_at, file_id),
        )
        return "updated"

    return "unchanged"


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Index Valletta project files into SQLite.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be indexed without writing.")
    args = parser.parse_args()

    if args.dry_run:
        print("DRY RUN — no changes will be written.\n")
        total = 0
        for abs_path, rel_path in iter_files(PROJECT_ROOT):
            cat, subcat = classify(rel_path)
            print(f"  {rel_path}  [{cat or '?'} / {subcat or '-'}]")
            total += 1
        print(f"\n{total} files found.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    init_db(conn)
    cursor = conn.cursor()

    counts = {"added": 0, "updated": 0, "unchanged": 0}
    for abs_path, rel_path in iter_files(PROJECT_ROOT):
        result = upsert_file(cursor, abs_path, rel_path)
        counts[result] += 1

    conn.commit()
    conn.close()

    total = sum(counts.values())
    print(
        f"Indexed {total} files — "
        f"{counts['added']} added, "
        f"{counts['updated']} updated, "
        f"{counts['unchanged']} unchanged."
    )
    print(f"Database: {DB_PATH}")


if __name__ == "__main__":
    main()
