"""
tiktok.py — TikTok for Developers API sync
Uses OAuth2 with PKCE. Access tokens: 24h. Refresh tokens: 365 days.
"""

import base64
import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import httpx

TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/"
TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/"
TIKTOK_API_BASE = "https://open.tiktokapis.com/v2"


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _generate_pkce() -> tuple[str, str]:
    """Returns (code_verifier, code_challenge)."""
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def get_auth_url(state: str) -> tuple[str, str]:
    """Returns (auth_url, code_verifier). Store verifier in state."""
    client_key = os.getenv("TIKTOK_CLIENT_KEY", "")
    redirect_uri = os.getenv("TIKTOK_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/tiktok")
    verifier, challenge = _generate_pkce()
    url = (
        f"{TIKTOK_AUTH_BASE}"
        f"?client_key={client_key}"
        f"&scope=user.info.basic,video.list"
        f"&response_type=code"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
    )
    return url, verifier


async def exchange_code(code: str, code_verifier: str) -> dict:
    client_key = os.getenv("TIKTOK_CLIENT_KEY", "")
    client_secret = os.getenv("TIKTOK_CLIENT_SECRET", "")
    redirect_uri = os.getenv("TIKTOK_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/tiktok")

    async with httpx.AsyncClient() as client:
        r = await client.post(
            TIKTOK_TOKEN_URL,
            data={
                "client_key": client_key,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        data = r.json().get("data", r.json())
        expires_at = (datetime.now(tz=timezone.utc) + timedelta(seconds=data.get("expires_in", 86400))).isoformat()
        refresh_expires_at = (datetime.now(tz=timezone.utc) + timedelta(seconds=data.get("refresh_expires_in", 31536000))).isoformat()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "token_expires_at": expires_at,
            "refresh_expires_at": refresh_expires_at,
            "open_id": data.get("open_id"),
        }


async def _refresh_if_needed(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        "SELECT access_token, refresh_token, token_expires_at FROM integration_connections WHERE platform='tiktok'"
    ).fetchone()
    if not row or not row[0]:
        return None

    access_token, refresh_token, expires_at_str = row
    try:
        expires_at = datetime.fromisoformat(expires_at_str)
        if (expires_at - datetime.now(tz=timezone.utc)).total_seconds() < 3600:
            # Refresh
            client_key = os.getenv("TIKTOK_CLIENT_KEY", "")
            client_secret = os.getenv("TIKTOK_CLIENT_SECRET", "")
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    TIKTOK_TOKEN_URL,
                    data={
                        "client_key": client_key,
                        "client_secret": client_secret,
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                if r.status_code == 200:
                    data = r.json().get("data", r.json())
                    new_token = data["access_token"]
                    new_expiry = (datetime.now(tz=timezone.utc) + timedelta(seconds=data.get("expires_in", 86400))).isoformat()
                    conn.execute(
                        "UPDATE integration_connections SET access_token=?, token_expires_at=?, updated_at=? WHERE platform='tiktok'",
                        (new_token, new_expiry, _now()),
                    )
                    conn.commit()
                    return new_token
    except Exception:
        pass
    return access_token


async def sync(conn: sqlite3.Connection) -> dict:
    token = await _refresh_if_needed(conn)
    if not token:
        return {"synced": 0, "errors": ["TikTok not connected"]}

    errors = []
    synced = 0
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        # User info
        try:
            r = await client.get(
                f"{TIKTOK_API_BASE}/user/info/",
                params={"fields": "follower_count,following_count,likes_count,video_count"},
                headers=headers,
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json().get("data", {}).get("user", {})
                conn.execute(
                    """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                       VALUES ('tiktok', 'account', NULL, ?, 'snapshot', ?)
                       ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                    (json.dumps({
                        "followers": data.get("follower_count"),
                        "following": data.get("following_count"),
                        "likes": data.get("likes_count"),
                        "video_count": data.get("video_count"),
                    }), _now()[:10]),
                )
                synced += 1
        except Exception as e:
            errors.append(f"TikTok user info: {e}")

        # Recent videos
        try:
            r = await client.post(
                f"{TIKTOK_API_BASE}/video/list/",
                json={"max_count": 20},
                headers={**headers, "Content-Type": "application/json"},
                params={"fields": "id,title,video_description,create_time,like_count,comment_count,view_count,share_count,duration,cover_image_url,share_url"},
                timeout=10,
            )
            if r.status_code == 200:
                videos = r.json().get("data", {}).get("videos", [])
                for vid in videos:
                    vid_id = vid.get("id", "")
                    caption = (vid.get("title") or vid.get("video_description") or "")[:500]
                    published_at = datetime.fromtimestamp(vid.get("create_time", 0), tz=timezone.utc).isoformat()

                    conn.execute(
                        """INSERT INTO integration_posts
                           (platform, external_id, post_type, caption, url, thumbnail_url, published_at, synced_at)
                           VALUES ('tiktok', ?, 'video', ?, ?, ?, ?, ?)
                           ON CONFLICT(platform, external_id) DO UPDATE SET
                             caption=excluded.caption, synced_at=excluded.synced_at""",
                        (vid_id, caption, vid.get("share_url"), vid.get("cover_image_url"),
                         published_at, _now()),
                    )
                    conn.execute(
                        """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                           VALUES ('tiktok', 'post', ?, ?, 'snapshot', ?)
                           ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                        (vid_id, json.dumps({
                            "views": vid.get("view_count"),
                            "likes": vid.get("like_count"),
                            "comments": vid.get("comment_count"),
                            "shares": vid.get("share_count"),
                            "title": vid.get("title"),
                        }), _now()[:10]),
                    )
                    synced += 1
        except Exception as e:
            errors.append(f"TikTok videos: {e}")

    conn.execute(
        "DELETE FROM integration_posts WHERE platform='tiktok' AND published_at < datetime('now', '-90 days')"
    )
    conn.execute(
        "UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE platform='tiktok'",
        (_now(), "; ".join(errors) if errors else None, _now()),
    )
    conn.commit()
    return {"synced": synced, "errors": errors}
