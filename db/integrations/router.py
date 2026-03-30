"""
router.py — FastAPI APIRouter for all /api/integrations/* endpoints.
Included in api.py with prefix="/api/integrations".
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from .platforms import discord as discord_platform
from .platforms import google as google_platform
from .platforms import instagram as instagram_platform
from .platforms import tiktok as tiktok_platform
from .platforms import square as square_platform
from . import sync as sync_module
from .token_store import create_state, consume_state

router = APIRouter()

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "db" / "valletta.db"
FRONTEND_URL = "http://localhost:5173"

ALL_PLATFORMS = ["google", "discord", "instagram", "tiktok", "square"]

SQUARE_REDIRECT_URI = os.getenv("SQUARE_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/square")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _require_auth(authorization: Optional[str]):
    """Re-uses the same auth check as api.py — imported lazily to avoid circular imports."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    # Delegate to api.py's canonical implementation (handles both in-memory and DB sessions)
    from db.api import _require_auth as _api_require_auth
    _api_require_auth(authorization)


def _ensure_platforms(conn: sqlite3.Connection):
    """Insert default rows for all platforms if they don't exist."""
    for p in ALL_PLATFORMS:
        conn.execute(
            "INSERT OR IGNORE INTO integration_connections (platform, status, updated_at) VALUES (?, 'disconnected', ?)",
            (p, _now()),
        )
    conn.commit()


# ── Status ──────────────────────────────────────────────────────────────────

@router.get("/status")
def status(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        _ensure_platforms(conn)
        rows = conn.execute(
            "SELECT platform, status, account_label, last_sync_at, last_error FROM integration_connections ORDER BY platform"
        ).fetchall()
    return [dict(r) for r in rows]


# ── OAuth start ──────────────────────────────────────────────────────────────

@router.get("/auth/start/google")
def auth_start_google(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    from pathlib import Path as P
    import os
    creds_path = P(PROJECT_ROOT) / os.getenv("GOOGLE_CREDENTIALS_FILE", "db/integrations/google_credentials.json")
    if not creds_path.exists():
        raise HTTPException(400, f"Google credentials file not found at {creds_path}. Download it from Google Cloud Console.")
    state = create_state("google")
    url, code_verifier = google_platform.get_auth_url(state)
    # Store verifier with the state so the callback can complete the PKCE exchange
    from .token_store import _OAUTH_STATE
    if state in _OAUTH_STATE:
        _OAUTH_STATE[state]["code_verifier"] = code_verifier
    return {"url": url}


@router.get("/auth/start/instagram")
def auth_start_instagram(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    import os
    if not os.getenv("INSTAGRAM_APP_ID"):
        raise HTTPException(400, "INSTAGRAM_APP_ID not set in .env")
    state = create_state("instagram")
    url = instagram_platform.get_auth_url(state)
    return {"url": url}


@router.get("/auth/start/tiktok")
def auth_start_tiktok(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    import os
    if not os.getenv("TIKTOK_CLIENT_KEY"):
        raise HTTPException(400, "TIKTOK_CLIENT_KEY not set in .env")
    state = create_state("tiktok")
    url, verifier = tiktok_platform.get_auth_url(state)
    # Store verifier in a separate state entry keyed by state token
    # The state token is embedded in the URL; we need to store verifier against it
    # Re-create with verifier included
    import secrets as sec
    from .token_store import _OAUTH_STATE
    # Find and update the entry we just created
    for k, v in _OAUTH_STATE.items():
        if v.get("platform") == "tiktok" and "verifier" not in v:
            v["verifier"] = verifier
            break
    return {"url": url}


# ── OAuth callbacks ──────────────────────────────────────────────────────────

@router.get("/auth/callback/google")
async def auth_callback_google(code: str = Query(...), state: str = Query(...)):
    entry = consume_state(state)
    if not entry or entry.get("platform") != "google":
        return RedirectResponse(f"{FRONTEND_URL}/?error=google&reason=invalid_state")
    try:
        tokens = google_platform.exchange_code(code, code_verifier=entry.get("code_verifier"))
        with get_db() as conn:
            _ensure_platforms(conn)
            # Get account email
            conn.execute(
                """UPDATE integration_connections SET
                   status='connected', access_token=?, refresh_token=?,
                   token_expires_at=?, token_scope=?, connected_at=?, updated_at=?
                   WHERE platform='google'""",
                (tokens["access_token"], tokens["refresh_token"],
                 tokens["token_expires_at"], tokens["token_scope"],
                 _now(), _now()),
            )
            conn.commit()
            # Get email label
            try:
                email = google_platform.get_account_email(conn)
                if email:
                    conn.execute(
                        "UPDATE integration_connections SET account_label=? WHERE platform='google'",
                        (email,),
                    )
                    conn.commit()
            except Exception:
                pass
        return RedirectResponse(f"{FRONTEND_URL}/?connected=google")
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/?error=google&reason={str(e)[:100]}")


@router.get("/auth/callback/instagram")
async def auth_callback_instagram(code: str = Query(...), state: str = Query(...)):
    entry = consume_state(state)
    if not entry or entry.get("platform") != "instagram":
        return RedirectResponse(f"{FRONTEND_URL}/?error=instagram&reason=invalid_state")
    try:
        tokens = await instagram_platform.exchange_code(code)
        with get_db() as conn:
            _ensure_platforms(conn)
            conn.execute(
                """UPDATE integration_connections SET
                   status='connected', access_token=?, token_expires_at=?,
                   account_label=?, connected_at=?, updated_at=?
                   WHERE platform='instagram'""",
                (tokens["access_token"], tokens["token_expires_at"],
                 tokens["account_label"], _now(), _now()),
            )
            conn.commit()
        return RedirectResponse(f"{FRONTEND_URL}/?connected=instagram")
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/?error=instagram&reason={str(e)[:100]}")


@router.get("/auth/callback/tiktok")
async def auth_callback_tiktok(code: str = Query(...), state: str = Query(...)):
    entry = consume_state(state)
    if not entry or entry.get("platform") != "tiktok":
        return RedirectResponse(f"{FRONTEND_URL}/?error=tiktok&reason=invalid_state")
    verifier = entry.get("verifier", "")
    try:
        tokens = await tiktok_platform.exchange_code(code, verifier)
        with get_db() as conn:
            _ensure_platforms(conn)
            conn.execute(
                """UPDATE integration_connections SET
                   status='connected', access_token=?, refresh_token=?,
                   token_expires_at=?, connected_at=?, updated_at=?
                   WHERE platform='tiktok'""",
                (tokens["access_token"], tokens.get("refresh_token"),
                 tokens["token_expires_at"], _now(), _now()),
            )
            conn.commit()
        return RedirectResponse(f"{FRONTEND_URL}/?connected=tiktok")
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/?error=tiktok&reason={str(e)[:100]}")


@router.get("/auth/start/square")
def auth_start_square(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    import os as _os
    if not _os.getenv("SQUARE_APP_ID"):
        raise HTTPException(400, "SQUARE_APP_ID not set in .env")
    state = create_state("square")
    url = square_platform.get_auth_url(state)
    return {"url": url}


@router.get("/auth/callback/square")
def auth_callback_square(code: str = Query(...), state: str = Query(...)):
    entry = consume_state(state)
    if not entry or entry.get("platform") != "square":
        return RedirectResponse(f"{FRONTEND_URL}/?error=square&reason=invalid_state")
    try:
        tokens = square_platform.exchange_code(code)
        with get_db() as conn:
            _ensure_platforms(conn)
            conn.execute(
                """UPDATE integration_connections SET
                   status='connected', access_token=?, refresh_token=?, token_expires_at=?,
                   account_label=?, token_scope=?, connected_at=?, updated_at=?
                   WHERE platform='square'""",
                (tokens["access_token"], tokens.get("refresh_token"),
                 tokens.get("token_expires_at"), tokens["account_label"],
                 tokens.get("token_scope"), _now(), _now()),
            )
            conn.commit()
        return RedirectResponse(f"{FRONTEND_URL}/?connected=square")
    except Exception as e:
        return RedirectResponse(f"{FRONTEND_URL}/?error=square&reason={str(e)[:100]}")


# ── Discord direct connect ───────────────────────────────────────────────────

class DiscordConnectBody(BaseModel):
    bot_token: str
    server_id: str


@router.post("/auth/discord")
async def auth_discord(body: DiscordConnectBody, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    result = await discord_platform.test_connection(body.bot_token, body.server_id)
    if not result["ok"]:
        raise HTTPException(400, f"Discord connection failed: {result.get('error')}")

    # Store "bot_token|server_id" in access_token column
    combined = f"{body.bot_token}|{body.server_id}"
    with get_db() as conn:
        _ensure_platforms(conn)
        conn.execute(
            """UPDATE integration_connections SET
               status='connected', access_token=?, account_label=?, connected_at=?, updated_at=?
               WHERE platform='discord'""",
            (combined, result["label"], _now(), _now()),
        )
        conn.commit()
    return {"status": "connected", "account_label": result["label"]}


# ── Disconnect ───────────────────────────────────────────────────────────────

@router.delete("/auth/{platform}")
def disconnect(platform: str, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    if platform not in ALL_PLATFORMS:
        raise HTTPException(400, f"Unknown platform: {platform}")
    with get_db() as conn:
        conn.execute(
            """UPDATE integration_connections SET
               status='disconnected', access_token=NULL, refresh_token=NULL,
               token_expires_at=NULL, account_label=NULL, last_sync_at=NULL,
               last_error=NULL, connected_at=NULL, updated_at=?
               WHERE platform=?""",
            (_now(), platform),
        )
        conn.commit()
    return {"status": "disconnected"}


# ── Sync ─────────────────────────────────────────────────────────────────────

@router.post("/sync/{platform}")
async def sync_one(platform: str, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    if platform not in ALL_PLATFORMS:
        raise HTTPException(400, f"Unknown platform: {platform}")
    with get_db() as conn:
        result = await sync_module.sync_platform(platform, conn)
    return {"platform": platform, **result}


@router.post("/sync/all")
async def sync_all_endpoint(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        results = await sync_module.sync_all(conn)
    return results


# ── Data preview ─────────────────────────────────────────────────────────────

@router.get("/data/messages")
def data_messages(
    platform: str = Query(...),
    limit: int = Query(10, le=50),
    channel: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    clauses = ["platform = ?"]
    params: list = [platform]
    if channel:
        clauses.append("channel = ?")
        params.append(channel)
    sql = f"SELECT * FROM integration_messages WHERE {' AND '.join(clauses)} ORDER BY received_at DESC LIMIT ?"
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


@router.get("/data/posts")
def data_posts(
    platform: str = Query(...),
    limit: int = Query(10, le=50),
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM integration_posts WHERE platform=? ORDER BY published_at DESC LIMIT ?",
            (platform, limit),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/data/metrics")
def data_metrics(
    platform: str = Query(...),
    metric_type: str = Query("account"),
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM integration_metrics WHERE platform=? AND metric_type=? ORDER BY measured_at DESC LIMIT 5",
            (platform, metric_type),
        ).fetchall()
    return [dict(r) for r in rows]
