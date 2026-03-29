"""
google_calendar.py — Push events from Valletta into Google Calendar.

Uses the same OAuth token stored in integration_connections (platform='google').
Requires the token to have the calendar.events scope. If the current token only
has calendar.readonly, the user must re-authorize via Integrations → Google.
"""

import json
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "db" / "valletta.db"


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _credentials_file() -> str:
    import os
    path = os.getenv("GOOGLE_CREDENTIALS_FILE", "db/integrations/google_credentials.json")
    return str(PROJECT_ROOT / path)


def _load_creds(conn: sqlite3.Connection) -> Credentials | None:
    row = conn.execute(
        "SELECT access_token, refresh_token, token_expires_at, token_scope "
        "FROM integration_connections WHERE platform = 'google'"
    ).fetchone()
    if not row or not row[0]:
        return None

    creds_path = Path(_credentials_file())
    if not creds_path.exists():
        return None

    with open(creds_path) as f:
        client_info = json.load(f)
    web = client_info.get("web") or client_info.get("installed", {})

    expiry = None
    if row[2]:
        try:
            expiry = datetime.fromisoformat(row[2])
        except Exception:
            pass

    creds = Credentials(
        token=row[0],
        refresh_token=row[1],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=web.get("client_id"),
        client_secret=web.get("client_secret"),
        scopes=(row[3] or "").split() or [],
        expiry=expiry,
    )
    return creds


def _refresh_and_save(creds: Credentials, conn: sqlite3.Connection) -> Credentials:
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        conn.execute(
            "UPDATE integration_connections SET access_token=?, token_expires_at=?, updated_at=? "
            "WHERE platform='google'",
            (creds.token, creds.expiry.isoformat() if creds.expiry else None, _now()),
        )
        conn.commit()
    return creds


def _build_gcal_body(event_data: dict) -> dict:
    """Convert a Valletta event dict into a Google Calendar event body."""
    title = event_data.get("title", "Untitled Event")
    start_dt = event_data.get("start_dt") or ""
    end_dt = event_data.get("end_dt") or ""
    location = event_data.get("location") or ""
    description = event_data.get("description") or ""

    description_full = description
    if description_full:
        description_full += "\n\n"
    description_full += "Added via Valletta Command Center"

    # Detect whether start_dt is a date-only (YYYY-MM-DD) or datetime
    is_date_only = len(start_dt) == 10 and "T" not in start_dt

    if is_date_only:
        # All-day event
        start_obj = {"date": start_dt}
        if end_dt and len(end_dt) == 10:
            # Google Calendar end date for all-day is exclusive (next day)
            from datetime import date
            try:
                end_d = date.fromisoformat(end_dt)
                # bump by 1 day so the event spans correctly
                end_exclusive = (end_d + timedelta(days=1)).isoformat()
                end_obj = {"date": end_exclusive}
            except Exception:
                end_obj = {"date": end_dt}
        else:
            # No end date — make it a single all-day event (end = start + 1 day)
            try:
                from datetime import date
                start_d = date.fromisoformat(start_dt)
                end_obj = {"date": (start_d + timedelta(days=1)).isoformat()}
            except Exception:
                end_obj = {"date": start_dt}
    else:
        # Timed event — normalize to RFC3339
        # Accept "YYYY-MM-DDTHH:MM" (no seconds, no tz) or full ISO
        def _to_rfc3339(dt_str: str) -> str:
            if not dt_str:
                return dt_str
            # If no timezone offset or Z, assume local time and append Z for UTC
            if dt_str.endswith("Z") or "+" in dt_str[10:] or "-" in dt_str[16:]:
                return dt_str  # already has tz
            # Add :00 seconds if missing
            if len(dt_str) == 16:  # YYYY-MM-DDTHH:MM
                dt_str += ":00"
            return dt_str + "Z"

        start_obj = {"dateTime": _to_rfc3339(start_dt), "timeZone": "UTC"}
        if end_dt:
            end_obj = {"dateTime": _to_rfc3339(end_dt), "timeZone": "UTC"}
        else:
            # Default to 1 hour after start
            try:
                # Parse start and add 1 hour
                clean = start_dt.rstrip("Z").replace("+00:00", "")
                if len(clean) == 16:
                    clean += ":00"
                start_parsed = datetime.fromisoformat(clean).replace(tzinfo=timezone.utc)
                end_parsed = start_parsed + timedelta(hours=1)
                end_obj = {"dateTime": end_parsed.isoformat(), "timeZone": "UTC"}
            except Exception:
                end_obj = {"dateTime": _to_rfc3339(start_dt), "timeZone": "UTC"}

    body: dict = {
        "summary": title,
        "start": start_obj,
        "end": end_obj,
        "description": description_full,
    }
    if location:
        body["location"] = location

    return body


def create_google_calendar_event(event_data: dict) -> str | None:
    """
    Push a Valletta event to Google Calendar.

    Args:
        event_data: dict with keys: title, start_dt, end_dt, location, description

    Returns:
        Google Calendar event ID (str) on success, None on failure.

    Raises:
        RuntimeError if Google is not connected or token lacks write scope.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        creds = _load_creds(conn)
        if not creds:
            raise RuntimeError("Google is not connected. Connect via Integrations settings.")

        # Check scope — need calendar.events (write), not just calendar.readonly.
        # Use exact set membership to avoid "calendar.readonly" matching "calendar".
        scope_set = set(creds.scopes or [])
        write_scopes = {
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar",
        }
        if not scope_set.intersection(write_scopes):
            raise RuntimeError(
                "Google token has read-only Calendar scope. "
                "Re-authorize via Integrations → Google to grant calendar.events write access."
            )

        creds = _refresh_and_save(creds, conn)
        service = build("calendar", "v3", credentials=creds)

        body = _build_gcal_body(event_data)
        result = service.events().insert(calendarId="primary", body=body).execute()
        google_event_id = result.get("id")
        return google_event_id

    finally:
        conn.close()


def update_valletta_event_with_gcal_id(valletta_event_id: int, google_event_id: str) -> None:
    """Store the Google Calendar event ID back into the events table."""
    conn = sqlite3.connect(str(DB_PATH))
    try:
        conn.execute(
            "UPDATE events SET google_event_id=?, updated_at=? WHERE id=?",
            (google_event_id, _now(), valletta_event_id),
        )
        conn.commit()
    finally:
        conn.close()


def update_google_calendar_event(google_event_id: str, event_data: dict) -> bool:
    """
    Update an existing Google Calendar event.

    Args:
        google_event_id: The Google Calendar event ID to update.
        event_data: dict with keys: title, start_dt, end_dt, location, description

    Returns:
        True on success, False on failure.

    Raises:
        RuntimeError if Google is not connected or token lacks write scope.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        creds = _load_creds(conn)
        if not creds:
            raise RuntimeError("Google is not connected. Connect via Integrations settings.")

        scope_set = set(creds.scopes or [])
        write_scopes = {
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar",
        }
        if not scope_set.intersection(write_scopes):
            raise RuntimeError(
                "Google token has read-only Calendar scope. "
                "Re-authorize via Integrations → Google to grant calendar.events write access."
            )

        creds = _refresh_and_save(creds, conn)
        service = build("calendar", "v3", credentials=creds)

        body = _build_gcal_body(event_data)
        service.events().update(calendarId="primary", eventId=google_event_id, body=body).execute()
        return True

    finally:
        conn.close()


def delete_google_calendar_event(google_event_id: str) -> bool:
    """
    Delete an event from Google Calendar.

    Args:
        google_event_id: The Google Calendar event ID to delete.

    Returns:
        True on success, False on failure.

    Raises:
        RuntimeError if Google is not connected or token lacks write scope.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        creds = _load_creds(conn)
        if not creds:
            raise RuntimeError("Google is not connected. Connect via Integrations settings.")

        scope_set = set(creds.scopes or [])
        write_scopes = {
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar",
        }
        if not scope_set.intersection(write_scopes):
            raise RuntimeError(
                "Google token has read-only Calendar scope. "
                "Re-authorize via Integrations → Google to grant calendar.events write access."
            )

        creds = _refresh_and_save(creds, conn)
        service = build("calendar", "v3", credentials=creds)

        service.events().delete(calendarId="primary", eventId=google_event_id).execute()
        return True

    finally:
        conn.close()
