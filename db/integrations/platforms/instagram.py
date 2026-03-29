"""
instagram.py — Instagram Graph API sync
Uses long-lived access tokens (60 days). Auto-refreshes when < 7 days from expiry.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone

import httpx

GRAPH_BASE = "https://graph.instagram.com"


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def get_auth_url(state: str) -> str:
    app_id = os.getenv("INSTAGRAM_APP_ID", "")
    redirect_uri = os.getenv("INSTAGRAM_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/instagram")
    return (
        f"https://api.instagram.com/oauth/authorize"
        f"?client_id={app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=user_profile,user_media"
        f"&response_type=code"
        f"&state={state}"
    )


async def exchange_code(code: str) -> dict:
    app_id = os.getenv("INSTAGRAM_APP_ID", "")
    app_secret = os.getenv("INSTAGRAM_APP_SECRET", "")
    redirect_uri = os.getenv("INSTAGRAM_REDIRECT_URI", "http://localhost:8000/api/integrations/auth/callback/instagram")

    async with httpx.AsyncClient() as client:
        # Get short-lived token
        r = await client.post(
            "https://api.instagram.com/oauth/access_token",
            data={
                "client_id": app_id,
                "client_secret": app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )
        r.raise_for_status()
        short = r.json()
        short_token = short["access_token"]
        user_id = short["user_id"]

        # Exchange for long-lived token
        r2 = await client.get(
            f"{GRAPH_BASE}/access_token",
            params={
                "grant_type": "ig_exchange_token",
                "client_secret": app_secret,
                "access_token": short_token,
            },
        )
        r2.raise_for_status()
        long = r2.json()
        long_token = long["access_token"]
        expires_in = long.get("expires_in", 5184000)  # default 60 days

        from datetime import timedelta
        expires_at = (datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        # Get username
        r3 = await client.get(
            f"{GRAPH_BASE}/{user_id}",
            params={"fields": "username", "access_token": long_token},
        )
        username = r3.json().get("username", str(user_id)) if r3.status_code == 200 else str(user_id)

        return {
            "access_token": long_token,
            "token_expires_at": expires_at,
            "account_label": f"@{username}",
            "user_id": str(user_id),
        }


async def _refresh_if_needed(access_token: str, expires_at_str: str | None, conn: sqlite3.Connection) -> str:
    if expires_at_str:
        try:
            expires_at = datetime.fromisoformat(expires_at_str)
            days_left = (expires_at - datetime.now(tz=timezone.utc)).days
            if days_left < 7:
                async with httpx.AsyncClient() as client:
                    r = await client.get(
                        f"{GRAPH_BASE}/refresh_access_token",
                        params={"grant_type": "ig_refresh_token", "access_token": access_token},
                    )
                    if r.status_code == 200:
                        data = r.json()
                        new_token = data["access_token"]
                        from datetime import timedelta
                        new_expiry = (datetime.now(tz=timezone.utc) + timedelta(seconds=data.get("expires_in", 5184000))).isoformat()
                        conn.execute(
                            "UPDATE integration_connections SET access_token=?, token_expires_at=?, updated_at=? WHERE platform='instagram'",
                            (new_token, new_expiry, _now()),
                        )
                        conn.commit()
                        return new_token
        except Exception:
            pass
    return access_token


async def sync(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        "SELECT access_token, token_expires_at FROM integration_connections WHERE platform='instagram'"
    ).fetchone()
    if not row or not row[0]:
        return {"synced": 0, "errors": ["Instagram not connected"]}

    token = await _refresh_if_needed(row[0], row[1], conn)
    errors = []
    synced = 0

    async with httpx.AsyncClient() as client:
        # Account metrics
        try:
            r = await client.get(
                f"{GRAPH_BASE}/me",
                params={
                    "fields": "id,username,followers_count,media_count",
                    "access_token": token,
                },
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
            conn.execute(
                """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                   VALUES ('instagram', 'account', NULL, ?, 'snapshot', ?)
                   ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                (json.dumps({
                    "followers": data.get("followers_count"),
                    "media_count": data.get("media_count"),
                    "username": data.get("username"),
                }), _now()[:10]),
            )
            synced += 1
        except Exception as e:
            errors.append(f"Instagram account metrics: {e}")

        # Recent media
        try:
            r = await client.get(
                f"{GRAPH_BASE}/me/media",
                params={
                    "fields": "id,caption,media_type,permalink,timestamp,like_count,comments_count",
                    "limit": 25,
                    "access_token": token,
                },
                timeout=10,
            )
            r.raise_for_status()
            for item in r.json().get("data", []):
                media_id = item["id"]
                caption = (item.get("caption") or "")[:500]
                media_type = item.get("media_type", "POST").lower()
                published_at = item.get("timestamp", _now())

                conn.execute(
                    """INSERT INTO integration_posts
                       (platform, external_id, post_type, caption, url, published_at, synced_at)
                       VALUES ('instagram', ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(platform, external_id) DO UPDATE SET
                         caption=excluded.caption, synced_at=excluded.synced_at""",
                    (media_id, media_type, caption, item.get("permalink"), published_at, _now()),
                )
                conn.execute(
                    """INSERT INTO integration_metrics (platform, metric_type, external_id, data, period, measured_at)
                       VALUES ('instagram', 'post', ?, ?, 'snapshot', ?)
                       ON CONFLICT(platform, metric_type, external_id, measured_at) DO NOTHING""",
                    (media_id, json.dumps({
                        "likes": item.get("like_count"),
                        "comments": item.get("comments_count"),
                        "media_type": item.get("media_type"),
                    }), _now()[:10]),
                )
                synced += 1
        except Exception as e:
            errors.append(f"Instagram media: {e}")

    conn.execute(
        "DELETE FROM integration_posts WHERE platform='instagram' AND published_at < datetime('now', '-90 days')"
    )
    conn.execute(
        "UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE platform='instagram'",
        (_now(), "; ".join(errors) if errors else None, _now()),
    )
    conn.commit()
    return {"synced": synced, "errors": errors}
