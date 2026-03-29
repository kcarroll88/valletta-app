#!/usr/bin/env python3
"""
tara_review.py — Tara's hourly task and idea review script.
Run on a schedule (hourly via launchd). Reads all open tasks and ideas,
scores ideas with ICE framework, promotes qualifying ideas to tasks,
and updates task priorities.

Usage:
    python3 db/tara_review.py
"""

import json
import os
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

# Values for created_by that are NOT human-created records
AI_CREATORS = {"system", "ai", "felix_bot", "tara", None, ""}

TARA_SYSTEM = """You are Tara, Task Master & Executive Project Reviewer for Valletta, an independent rock band.

Your job is to review all open tasks and ideas, apply your ICE framework, and return structured JSON decisions.

ICE Scoring (each 1-5):
- Impact: How much does this move the band forward?
- Confidence: How actionable is this right now?
- Effort: Inverse — low effort = high score (5 = quick win, 1 = huge effort)
- ICE Average ≥ 3.0 → idea qualifies for promotion to task
- Fast-track override: hard deadlines, explicit human creative intent, or team escalation

Priority Definitions:
- critical: due within 7 days OR blocking another task
- high: due within 30 days OR high strategic impact
- medium: no deadline, moderate impact
- low: exploratory, no urgency

Human Record Protection:
- If created_by is NOT in [null, 'system', 'ai', 'felix_bot', 'tara'], the record was created by a human.
- For human records: NEVER delete. You may update priority or description (to add notes), but flag the change.
- For AI/system records: may update any field, but do not delete unless explicitly instructed.

Return a JSON object with this exact structure:
{
  "ideas_decisions": [
    {
      "id": <idea_id>,
      "action": "promote" | "update_notes" | "no_change",
      "ice_impact": <1-5>,
      "ice_confidence": <1-5>,
      "ice_effort": <1-5>,
      "ice_average": <float>,
      "reasoning": "<1-2 sentences>",
      "new_task_title": "<title if promoting>",
      "new_task_priority": "critical" | "high" | "medium" | "low",
      "new_task_due_date": "<YYYY-MM-DD or null>",
      "new_task_description": "<description explaining why promoted and what to do>",
      "updated_description": "<updated idea description with assessment notes, only if action=update_notes>"
    }
  ],
  "tasks_decisions": [
    {
      "id": <task_id>,
      "action": "update_priority" | "update_description" | "update_both" | "no_change",
      "new_priority": "critical" | "high" | "medium" | "low",
      "reasoning": "<1-2 sentences>",
      "description_note": "<note to append to description, max 150 chars>",
      "is_human_record": <true|false>
    }
  ],
  "summary": "<2-3 sentence executive summary of this review cycle>"
}

Today's date is provided in the prompt. Be decisive. No hedging. If something scores, it scores. If a task priority is wrong, correct it.
"""


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _log(msg: str) -> None:
    print(f"[{_now_str()}] {msg}", flush=True)


def _is_human_record(created_by: str | None) -> bool:
    """Return True if this record was created by a human (not AI/system)."""
    if created_by is None:
        return False
    return created_by.strip().lower() not in {"system", "ai", "felix_bot", "tara", ""}


def load_open_ideas(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT id, title, description, category, status, created_at
           FROM ideas
           WHERE status NOT IN ('done', 'archived')
           ORDER BY created_at ASC"""
    ).fetchall()
    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "title": row[1],
            "description": row[2] or "",
            "category": row[3] or "other",
            "status": row[4],
            "created_at": row[5],
            "created_by": None,  # ideas table has no created_by — treat as AI/open
        })
    return result


def load_open_tasks(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """SELECT id, title, description, status, priority, due_date, assignee, created_at
           FROM tasks
           WHERE status NOT IN ('done')
           ORDER BY priority DESC, due_date ASC NULLS LAST"""
    ).fetchall()
    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "title": row[1],
            "description": row[2] or "",
            "status": row[3],
            "priority": row[4],
            "due_date": row[5],
            "assignee": row[6],
            "created_at": row[7],
            "created_by": None,  # tasks table has no created_by — treat as AI/system
        })
    return result


def call_tara(ideas: list[dict], tasks: list[dict]) -> dict:
    """Call Claude as Tara and get structured review decisions."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        _log("ERROR: ANTHROPIC_API_KEY not set. Aborting.")
        sys.exit(1)

    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")

    prompt = f"""Today's date: {today}

## Open Ideas ({len(ideas)} total — status != done/archived)
{json.dumps(ideas, indent=2)}

## Open Tasks ({len(tasks)} total — status != done)
{json.dumps(tasks, indent=2)}

Review every item above. Apply ICE scoring to all ideas. Assess all tasks for priority accuracy.
Return your full JSON decisions object now. No commentary outside the JSON.
"""

    client = anthropic.Anthropic(api_key=api_key)

    _log(f"Calling Tara (claude-sonnet-4-6) with {len(ideas)} ideas, {len(tasks)} tasks...")

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8000,
        system=TARA_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    # Extract text from response (may have thinking block first)
    raw_text = ""
    for block in response.content:
        if block.type == "text":
            raw_text = block.text
            break

    if not raw_text:
        _log("ERROR: No text block in Tara's response.")
        _log(f"Full response: {response}")
        sys.exit(1)

    # Strip markdown code fences if present
    import re
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        # Remove opening fence (```json or ```)
        cleaned = re.sub(r"^```[a-z]*\n?", "", cleaned)
        # Remove closing fence
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        cleaned = cleaned.strip()

    # Find the outermost JSON object
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        _log(f"ERROR: Could not find JSON object in Tara's response:\n{raw_text[:500]}")
        sys.exit(1)

    json_str = cleaned[start:end+1]

    try:
        decisions = json.loads(json_str)
    except json.JSONDecodeError as e:
        _log(f"ERROR: JSON parse failed: {e}")
        _log(f"Attempting to recover truncated JSON...")
        # Try to recover partial JSON by truncating at the last complete entry
        # Find the last complete tasks_decisions entry
        try:
            # Build partial recovery: strip the trailing incomplete entry
            last_complete = json_str.rfind('    }')
            if last_complete > 0:
                partial = json_str[:last_complete + 5]
                # Close open arrays/objects
                partial = partial.rstrip(',\n ')
                # Count unclosed brackets
                opens_sq = partial.count('[') - partial.count(']')
                opens_cu = partial.count('{') - partial.count('}')
                for _ in range(opens_sq):
                    partial += ']'
                for _ in range(opens_cu):
                    partial += '}'
                # Add summary if missing
                if '"summary"' not in partial:
                    partial = partial.rstrip('}') + ', "summary": "Review truncated — partial results applied."}'
                decisions = json.loads(partial)
                _log("Partial JSON recovery succeeded.")
            else:
                _log(f"Full raw text:\n{raw_text}")
                sys.exit(1)
        except Exception as e2:
            _log(f"Recovery failed: {e2}\nFull raw text:\n{raw_text}")
            sys.exit(1)

    return decisions


def apply_idea_decisions(conn: sqlite3.Connection, decisions: list[dict]) -> int:
    """Apply Tara's idea decisions. Returns count of changes made."""
    changes = 0
    now = _now_str()

    for d in decisions:
        idea_id = d.get("id")
        action = d.get("action", "no_change")

        if action == "no_change":
            continue

        if action == "promote":
            title        = d.get("new_task_title") or d.get("title", f"Promoted idea #{idea_id}")
            priority     = d.get("new_task_priority", "medium")
            due_date     = d.get("new_task_due_date") or None
            description  = d.get("new_task_description", "")
            ice_avg      = d.get("ice_average", 0)
            reasoning    = d.get("reasoning", "")

            tara_note = (
                f"[Tara promoted from idea #{idea_id} on {now[:10]}] "
                f"ICE: {ice_avg:.1f}. {reasoning}"
            )
            full_description = f"{description}\n\n{tara_note}".strip()

            try:
                cursor = conn.execute(
                    """INSERT INTO tasks (title, description, status, priority, due_date, assignee, created_at, updated_at)
                       VALUES (?, ?, 'todo', ?, ?, 'tara', ?, ?)""",
                    (title, full_description, priority, due_date, now, now),
                )
                new_task_id = cursor.lastrowid

                # Link idea to new task and archive it
                conn.execute(
                    "UPDATE ideas SET status='archived', task_id=? WHERE id=?",
                    (new_task_id, idea_id),
                )
                conn.commit()
                changes += 1
                _log(f"  PROMOTED idea #{idea_id} '{title}' -> task #{new_task_id} (priority: {priority}, ICE: {ice_avg:.1f})")
            except Exception as e:
                _log(f"  ERROR promoting idea #{idea_id}: {e}")

        elif action == "update_notes":
            updated_desc = d.get("updated_description", "")
            if updated_desc:
                try:
                    conn.execute(
                        "UPDATE ideas SET description=? WHERE id=?",
                        (updated_desc, idea_id),
                    )
                    conn.commit()
                    changes += 1
                    _log(f"  UPDATED notes on idea #{idea_id}")
                except Exception as e:
                    _log(f"  ERROR updating idea #{idea_id}: {e}")

    return changes


def apply_task_decisions(conn: sqlite3.Connection, decisions: list[dict]) -> int:
    """Apply Tara's task decisions. Returns count of changes made."""
    changes = 0
    now = _now_str()

    for d in decisions:
        task_id   = d.get("id")
        action    = d.get("action", "no_change")
        is_human  = d.get("is_human_record", False)

        if action == "no_change":
            continue

        # Fetch current task
        row = conn.execute(
            "SELECT title, priority, description FROM tasks WHERE id=?",
            (task_id,)
        ).fetchone()
        if not row:
            _log(f"  SKIP: task #{task_id} not found in DB")
            continue

        current_title, current_priority, current_description = row
        new_priority  = d.get("new_priority", current_priority)
        note          = d.get("description_note", "")
        reasoning     = d.get("reasoning", "")

        # For human records: only allow priority and description/note updates, never delete
        if is_human:
            _log(f"  HUMAN RECORD task #{task_id} '{current_title}' — proceeding with care (priority/notes only)")

        priority_changed = (action in ("update_priority", "update_both")) and new_priority != current_priority
        note_added       = (action in ("update_description", "update_both")) and note

        if not priority_changed and not note_added:
            continue

        # Build new description
        new_description = current_description or ""
        if note_added:
            tara_note = f"\n[Tara {now[:10]}: {note}]"
            new_description = (new_description + tara_note).strip()

        try:
            if priority_changed and note_added:
                conn.execute(
                    "UPDATE tasks SET priority=?, description=?, updated_at=? WHERE id=?",
                    (new_priority, new_description, now, task_id),
                )
                _log(f"  UPDATED task #{task_id} '{current_title}': priority {current_priority}->{new_priority}, added note")
            elif priority_changed:
                conn.execute(
                    "UPDATE tasks SET priority=?, updated_at=? WHERE id=?",
                    (new_priority, now, task_id),
                )
                _log(f"  UPDATED task #{task_id} '{current_title}': priority {current_priority}->{new_priority} ({reasoning[:60]})")
            else:
                conn.execute(
                    "UPDATE tasks SET description=?, updated_at=? WHERE id=?",
                    (new_description, now, task_id),
                )
                _log(f"  UPDATED task #{task_id} '{current_title}': added note")
            conn.commit()
            changes += 1
        except Exception as e:
            _log(f"  ERROR updating task #{task_id}: {e}")

    return changes


def _ensure_scheduler_state_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scheduler_state (
            key TEXT PRIMARY KEY,
            last_run_at TEXT,
            last_data_hash TEXT
        )
    """)
    conn.commit()


def _check_tara_skip(conn: sqlite3.Connection) -> bool:
    """Return True if nothing has changed since Tara's last run (skip the API call)."""
    row_tasks = conn.execute(
        "SELECT MAX(updated_at) FROM tasks WHERE status NOT IN ('done','dismissed')"
    ).fetchone()
    row_ideas = conn.execute(
        "SELECT MAX(updated_at) FROM ideas WHERE status NOT IN ('done','dismissed')"
    ).fetchone()

    ts_tasks = row_tasks[0] if row_tasks else None
    ts_ideas = row_ideas[0] if row_ideas else None

    # Most recent change across both tables
    latest_change = max(
        (t for t in (ts_tasks, ts_ideas) if t is not None),
        default=None,
    )

    state = conn.execute(
        "SELECT last_run_at FROM scheduler_state WHERE key='tara'"
    ).fetchone()
    last_run_at = state[0] if state else None

    if last_run_at and latest_change and latest_change <= last_run_at:
        return True
    return False


def _update_tara_state(conn: sqlite3.Connection) -> None:
    now = _now_str()
    conn.execute(
        """INSERT INTO scheduler_state (key, last_run_at, last_data_hash)
           VALUES ('tara', ?, NULL)
           ON CONFLICT(key) DO UPDATE SET last_run_at=excluded.last_run_at""",
        (now,),
    )
    conn.commit()


def main():
    _log("=" * 60)
    _log("Tara Review — starting hourly audit")
    _log("=" * 60)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    try:
        _ensure_scheduler_state_table(conn)

        if _check_tara_skip(conn):
            _log("No changes since last run — skipping API call")
            return

        ideas = load_open_ideas(conn)
        tasks = load_open_tasks(conn)

        _log(f"Loaded {len(ideas)} open ideas, {len(tasks)} open tasks")

        if not ideas and not tasks:
            _log("Nothing to review. Exiting.")
            return

        decisions = call_tara(ideas, tasks)

        summary = decisions.get("summary", "")
        if summary:
            _log(f"\nTara's Summary: {summary}\n")

        idea_decisions = decisions.get("ideas_decisions", [])
        task_decisions = decisions.get("tasks_decisions", [])

        _log(f"Processing {len(idea_decisions)} idea decisions, {len(task_decisions)} task decisions...")

        idea_changes = apply_idea_decisions(conn, idea_decisions)
        task_changes = apply_task_decisions(conn, task_decisions)

        total = idea_changes + task_changes
        _log(f"\nDone. {idea_changes} idea change(s), {task_changes} task change(s). Total: {total} DB writes.")

        _update_tara_state(conn)
        _log("Scheduler state updated.")

    finally:
        conn.close()

    _log("=" * 60)
    _log("Tara Review — complete")
    _log("=" * 60)


if __name__ == "__main__":
    main()
