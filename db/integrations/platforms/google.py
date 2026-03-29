"""
google.py — Gmail + YouTube sync (shared Google OAuth2 token)
"""

import base64
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import httpx
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/calendar.events",  # write: create/update events
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _credentials_file() -> str:
    path = os.getenv("GOOGLE_CREDENTIALS_FILE", "db/integrations/google_credentials.json")
    return str(PROJECT_ROOT / path)


def _redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/google")


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def get_auth_url(state: str) -> tuple[str, str]:
    """Returns (auth_url, code_verifier). Verifier must be stored and passed to exchange_code."""
    import hashlib, base64, secrets as _secrets
    code_verifier = _secrets.token_urlsafe(96)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    flow = Flow.from_client_secrets_file(
        _credentials_file(),
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
    )
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        state=state,
        prompt="consent",
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    return url, code_verifier


def exchange_code(code: str, code_verifier: str = None) -> dict:
    """Exchange auth code for tokens. code_verifier required when PKCE was used."""
    flow = Flow.from_client_secrets_file(
        _credentials_file(),
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
    )
    # Relax scope checking — Google may return scopes in a different order
    os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
    try:
        flow.fetch_token(code=code, code_verifier=code_verifier)
    finally:
        os.environ.pop("OAUTHLIB_RELAX_TOKEN_SCOPE", None)
    creds = flow.credentials
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_expires_at": creds.expiry.isoformat() if creds.expiry else None,
        "token_scope": " ".join(creds.scopes or []),
    }


def _load_creds(conn: sqlite3.Connection) -> Credentials | None:
    row = conn.execute(
        "SELECT access_token, refresh_token, token_expires_at, token_scope FROM integration_connections WHERE platform = 'google'"
    ).fetchone()
    if not row or not row[0]:
        return None

    creds_file = _credentials_file()
    if not Path(creds_file).exists():
        return None

    with open(creds_file) as f:
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
        scopes=(row[3] or "").split() or SCOPES,
        expiry=expiry,
    )
    return creds


def _refresh_if_needed(creds: Credentials, conn: sqlite3.Connection) -> Credentials:
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        conn.execute(
            "UPDATE integration_connections SET access_token=?, token_expires_at=?, updated_at=? WHERE platform='google'",
            (creds.token, creds.expiry.isoformat() if creds.expiry else None, _now()),
        )
        conn.commit()
    return creds


def get_account_email(conn: sqlite3.Connection) -> str | None:
    creds = _load_creds(conn)
    if not creds:
        return None
    creds = _refresh_if_needed(creds, conn)
    service = build("gmail", "v1", credentials=creds)
    profile = service.users().getProfile(userId="me").execute()
    return profile.get("emailAddress")


def _extract_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    mime_type = payload.get("mimeType", "")
    if mime_type == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    if mime_type == "text/html" and not payload.get("parts"):
        # Fallback to HTML only if no plain text found
        data = payload.get("body", {}).get("data", "")
        if data:
            import re
            html = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            return re.sub(r"<[^>]+>", "", html)  # strip tags for plain text
    for part in payload.get("parts", []):
        result = _extract_body(part)
        if result:
            return result
    return ""


def sync_calendar(conn: sqlite3.Connection, creds) -> tuple[int, list]:
    """Sync Google Calendar primary calendar events into the events table."""
    from googleapiclient.discovery import build as _build
    import json as _json
    synced = 0
    errors = []
    try:
        cal = _build("calendar", "v3", credentials=creds)
        # Fetch events: 60 days back, 180 days forward
        from datetime import datetime, timezone, timedelta
        now = datetime.now(tz=timezone.utc)
        time_min = (now - timedelta(days=60)).isoformat()
        time_max = (now + timedelta(days=180)).isoformat()

        page_token = None
        while True:
            result = cal.events().list(
                calendarId="primary",
                timeMin=time_min,
                timeMax=time_max,
                maxResults=250,
                singleEvents=True,
                orderBy="startTime",
                pageToken=page_token,
            ).execute()

            for item in result.get("items", []):
                g_id = item.get("id")
                if not g_id:
                    continue
                title = item.get("summary", "(No title)")
                description = item.get("description", "")
                location = item.get("location", "")

                # Parse start/end — can be dateTime or date (all-day)
                start_raw = item.get("start", {})
                end_raw   = item.get("end", {})
                start_dt  = start_raw.get("dateTime") or start_raw.get("date")
                end_dt    = end_raw.get("dateTime")   or end_raw.get("date")

                # Skip cancelled events
                if item.get("status") == "cancelled":
                    conn.execute(
                        "DELETE FROM events WHERE google_event_id = ?", (g_id,)
                    )
                    continue

                # UPDATE existing, then INSERT if not present
                # (ON CONFLICT with a separate unique index is not supported in SQLite)
                conn.execute(
                    """UPDATE events SET
                         title=?, start_dt=?, end_dt=?, location=?, description=?, updated_at=?
                       WHERE google_event_id=?""",
                    (title, start_dt, end_dt, location, description, _now(), g_id),
                )
                conn.execute(
                    """INSERT OR IGNORE INTO events
                       (title, event_type, start_dt, end_dt, location, description, recurring, google_event_id, created_at, updated_at)
                       VALUES (?, 'other', ?, ?, ?, ?, 'none', ?, ?, ?)""",
                    (title, start_dt, end_dt, location, description, g_id, _now(), _now()),
                )
                synced += 1

            page_token = result.get("nextPageToken")
            if not page_token:
                break

        conn.commit()
    except Exception as e:
        errors.append(f"Calendar sync: {e}")
    return synced, errors


def sync_drive(conn: sqlite3.Connection, creds) -> tuple[int, list]:
    """Sync Google Drive files into a google_drive_files table."""
    synced = 0
    errors = []
    try:
        from googleapiclient.discovery import build as _build
        drive = _build("drive", "v3", credentials=creds)

        # Fetch files modified in last 180 days, non-trashed
        from datetime import datetime, timezone, timedelta
        cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=180)).isoformat()

        page_token = None
        while True:
            result = drive.files().list(
                q=f"trashed=false and modifiedTime > '{cutoff}'",
                pageSize=200,
                fields="nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,parents,iconLink)",
                pageToken=page_token,
            ).execute()

            for item in result.get("files", []):
                g_id    = item.get("id")
                name    = item.get("name", "")
                mime    = item.get("mimeType", "")
                size    = item.get("size")
                modified = item.get("modifiedTime", _now())
                url     = item.get("webViewLink", "")
                icon    = item.get("iconLink", "")

                # Derive extension from name or mime
                ext = ""
                if "." in name:
                    ext = name.rsplit(".", 1)[-1].lower()
                elif "google-apps" in mime:
                    mime_ext_map = {
                        "application/vnd.google-apps.document":     "gdoc",
                        "application/vnd.google-apps.spreadsheet":  "gsheet",
                        "application/vnd.google-apps.presentation": "gslides",
                        "application/vnd.google-apps.folder":       "folder",
                    }
                    ext = mime_ext_map.get(mime, "gdrive")

                conn.execute(
                    """UPDATE google_drive_files SET
                         name=?, mime_type=?, size_bytes=?, modified_at=?, web_url=?, icon_url=?, extension=?, updated_at=?
                       WHERE google_file_id=?""",
                    (name, mime, size, modified, url, icon, ext, _now(), g_id),
                )
                conn.execute(
                    """INSERT OR IGNORE INTO google_drive_files
                       (google_file_id, name, mime_type, size_bytes, modified_at, web_url, icon_url, extension, pinned, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
                    (g_id, name, mime, size, modified, url, icon, ext, _now(), _now()),
                )
                synced += 1

            page_token = result.get("nextPageToken")
            if not page_token:
                break

        conn.commit()
    except Exception as e:
        errors.append(f"Drive sync: {e}")
    return synced, errors


def sync_finance_sheets(conn: sqlite3.Connection, creds) -> dict:
    """Sync finance/budget Google Sheets into finance_entries and finance_sheets tables."""
    from googleapiclient.discovery import build
    import json, re
    from datetime import datetime

    # Find finance spreadsheets in the DB
    rows = conn.execute(
        "SELECT google_file_id, name FROM google_drive_files "
        "WHERE mime_type='application/vnd.google-apps.spreadsheet' "
        "AND (LOWER(name) LIKE '%finance%' OR LOWER(name) LIKE '%budget%')"
    ).fetchall()

    if not rows:
        return {"synced": 0}

    sheets_svc = build('sheets', 'v4', credentials=creds)
    now = datetime.utcnow().isoformat()
    total_rows = 0

    for file_id, file_name in rows:
        # Detect year from filename
        year_match = re.search(r'20\d{2}', file_name)
        year = int(year_match.group()) if year_match else None

        # Get sheet tabs
        meta = sheets_svc.spreadsheets().get(spreadsheetId=file_id).execute()
        tabs = [s['properties']['title'] for s in meta.get('sheets', [])]

        # Upsert finance_sheets record
        conn.execute(
            "INSERT INTO finance_sheets (google_file_id, name, year, last_synced_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(google_file_id) DO UPDATE SET "
            "name=excluded.name, year=excluded.year, last_synced_at=excluded.last_synced_at",
            (file_id, file_name, year, now)
        )

        for tab in tabs:
            result = sheets_svc.spreadsheets().values().get(
                spreadsheetId=file_id, range=tab
            ).execute()
            values = result.get('values', [])
            if len(values) < 2:
                continue

            headers = [h.strip().lower() for h in values[0]]

            # Try to detect column indices
            def col(names):
                for n in names:
                    for i, h in enumerate(headers):
                        if n in h:
                            return i
                return None

            amt_col = col(['amount', 'total', 'cost', 'revenue', 'income', 'expense'])
            desc_col = col(['description', 'name', 'item', 'note', 'detail'])
            date_col = col(['date'])
            cat_col = col(['category', 'type', 'class'])
            show_col = col(['show', 'venue', 'event', 'gig'])
            budget_col = col(['budget', 'planned'])

            # Detect entry_type from tab name
            tab_lower = tab.lower()
            if any(w in tab_lower for w in ['income', 'revenue', 'earning']):
                default_type = 'income'
            elif any(w in tab_lower for w in ['expense', 'cost', 'spend']):
                default_type = 'expense'
            elif any(w in tab_lower for w in ['show', 'gig', 'venue']):
                default_type = 'show'
            elif any(w in tab_lower for w in ['budget']):
                default_type = 'budget'
            else:
                default_type = 'other'

            for row_idx, row in enumerate(values[1:], start=1):
                def cell(idx):
                    if idx is None or idx >= len(row):
                        return None
                    v = row[idx].strip()
                    return v if v else None

                # Parse amount
                raw_amt = cell(amt_col)
                amount = None
                if raw_amt:
                    cleaned = re.sub(r'[^\d.\-]', '', raw_amt)
                    try:
                        amount = float(cleaned)
                    except ValueError:
                        pass

                if amount is None and raw_amt is None:
                    continue  # skip empty rows

                description = cell(desc_col)
                entry_date = cell(date_col)
                category = cell(cat_col)
                show_name = cell(show_col)

                raw_budget = cell(budget_col)
                budget_amount = None
                if raw_budget:
                    try:
                        budget_amount = float(re.sub(r'[^\d.\-]', '', raw_budget))
                    except ValueError:
                        pass

                # Infer year from date if not from filename
                entry_year = year
                if entry_year is None and entry_date:
                    m = re.search(r'20\d{2}', entry_date)
                    if m:
                        entry_year = int(m.group())
                if entry_year is None:
                    entry_year = 2025  # fallback

                conn.execute(
                    "INSERT INTO finance_entries "
                    "(year, sheet_tab, row_index, entry_type, category, description, "
                    "amount, entry_date, show_name, budget_amount, google_file_id, raw_row, created_at, updated_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) "
                    "ON CONFLICT(google_file_id, sheet_tab, row_index) DO UPDATE SET "
                    "amount=excluded.amount, category=excluded.category, "
                    "description=excluded.description, updated_at=excluded.updated_at",
                    (entry_year, tab, row_idx, default_type, category, description,
                     amount, entry_date, show_name, budget_amount, file_id,
                     json.dumps(row), now, now)
                )
                total_rows += 1

        conn.commit()

    return {"synced": len(rows), "rows": total_rows}


async def sync(conn: sqlite3.Connection) -> dict:
    creds = _load_creds(conn)
    if not creds:
        return {"synced": 0, "errors": ["Google not connected"]}

    creds = _refresh_if_needed(creds, conn)
    errors = []
    synced = 0

    # ── Gmail ──
    try:
        gmail = build("gmail", "v1", credentials=creds)
        result = gmail.users().messages().list(
            userId="me",
            q="newer_than:14d",
            maxResults=50,
        ).execute()
        message_ids = [m["id"] for m in result.get("messages", [])]

        for msg_id in message_ids:
            try:
                msg = gmail.users().messages().get(
                    userId="me",
                    id=msg_id,
                    format="full",
                ).execute()

                headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
                body = _extract_body(msg.get("payload", {}))
                body_preview = (body.strip() or msg.get("snippet", ""))[:2000]
                date_str = headers.get("Date", "")

                # Parse date to ISO
                try:
                    from email.utils import parsedate_to_datetime
                    received_at = parsedate_to_datetime(date_str).isoformat()
                except Exception:
                    received_at = _now()

                conn.execute(
                    """INSERT INTO integration_messages
                       (platform, external_id, channel, sender, subject, body_preview, url, received_at, synced_at)
                       VALUES ('gmail', ?, 'INBOX', ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(platform, external_id) DO UPDATE SET
                         body_preview=excluded.body_preview,
                         synced_at=excluded.synced_at""",
                    (msg_id, headers.get("From", ""), headers.get("Subject", ""),
                     body_preview,
                     f"https://mail.google.com/mail/u/0/#inbox/{msg_id}",
                     received_at, _now()),
                )
                synced += 1
            except Exception as e:
                errors.append(f"Gmail msg {msg_id}: {e}")

        # Retention
        conn.execute(
            "DELETE FROM integration_messages WHERE platform='gmail' AND received_at < datetime('now', '-90 days')"
        )
        conn.commit()
    except Exception as e:
        errors.append(f"Gmail sync: {e}")

    # ── YouTube ──
    try:
        yt = build("youtube", "v3", credentials=creds)

        # Account metrics
        ch = yt.channels().list(part="statistics,snippet", mine=True).execute()
        if ch.get("items"):
            item = ch["items"][0]
            stats = item.get("statistics", {})
            conn.execute(
                """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                   VALUES ('youtube', 'account', NULL, ?, 'snapshot', ?)
                   ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                (json.dumps({
                    "subscribers": stats.get("subscriberCount"),
                    "total_views": stats.get("viewCount"),
                    "video_count": stats.get("videoCount"),
                    "channel_title": item.get("snippet", {}).get("title"),
                }), _now()[:10]),
            )
            synced += 1

        # Recent videos
        search = yt.search().list(
            forMine=True,
            type="video",
            order="date",
            maxResults=20,
            part="snippet",
        ).execute()

        video_ids = [item["id"]["videoId"] for item in search.get("items", []) if item.get("id", {}).get("videoId")]

        if video_ids:
            vids = yt.videos().list(
                part="snippet,statistics",
                id=",".join(video_ids),
            ).execute()

            for vid in vids.get("items", []):
                vid_id = vid["id"]
                snippet = vid.get("snippet", {})
                stats = vid.get("statistics", {})
                caption = (snippet.get("title", "") + " — " + snippet.get("description", ""))[:500]
                published = snippet.get("publishedAt", _now())

                conn.execute(
                    """INSERT INTO integration_posts
                       (platform, external_id, post_type, caption, url, published_at, synced_at)
                       VALUES ('youtube', ?, 'video', ?, ?, ?, ?)
                       ON CONFLICT(platform, external_id) DO UPDATE SET synced_at=excluded.synced_at""",
                    (vid_id, caption,
                     f"https://youtube.com/watch?v={vid_id}",
                     published, _now()),
                )
                conn.execute(
                    """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                       VALUES ('youtube', 'post', ?, ?, 'snapshot', ?)
                       ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                    (vid_id, json.dumps({
                        "views": stats.get("viewCount"),
                        "likes": stats.get("likeCount"),
                        "comments": stats.get("commentCount"),
                        "title": snippet.get("title"),
                    }), _now()[:10]),
                )
                synced += 1

        conn.execute(
            "DELETE FROM integration_posts WHERE platform='youtube' AND published_at < datetime('now', '-90 days')"
        )
        conn.commit()
    except Exception as e:
        errors.append(f"YouTube sync: {e}")

    # ── Google Calendar ──
    cal_synced, cal_errors = sync_calendar(conn, creds)
    synced += cal_synced
    errors.extend(cal_errors)

    # ── Google Drive ──
    drive_synced, drive_errors = sync_drive(conn, creds)
    synced += drive_synced
    errors.extend(drive_errors)

    # ── Finance Sheets ──
    try:
        finance_result = sync_finance_sheets(conn, creds)
        synced += finance_result.get("rows", 0)
    except Exception as e:
        errors.append(f"Finance sheets sync: {e}")

    conn.execute(
        "UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE platform='google'",
        (_now(), "; ".join(errors) if errors else None, _now()),
    )
    conn.commit()
    return {"synced": synced, "errors": errors}
