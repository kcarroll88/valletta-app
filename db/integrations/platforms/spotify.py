"""
spotify.py — Spotify Client Credentials analytics sync.
Fetches artist followers, popularity, genres, and metadata.
"""

import json
import sqlite3
from datetime import datetime, timezone

import requests

TOKEN_URL  = "https://accounts.spotify.com/api/token"
SEARCH_URL = "https://api.spotify.com/v1/search"
ARTIST_URL = "https://api.spotify.com/v1/artists/{}"


def get_token(client_id: str, client_secret: str) -> str:
    resp = requests.post(
        TOKEN_URL,
        data={"grant_type": "client_credentials"},
        auth=(client_id, client_secret),
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def search_artist(token: str, name: str) -> dict | None:
    """Returns first matching artist object or None."""
    resp = requests.get(
        SEARCH_URL,
        headers={"Authorization": f"Bearer {token}"},
        params={"q": name, "type": "artist", "limit": 1},
        timeout=10,
    )
    resp.raise_for_status()
    items = resp.json().get("artists", {}).get("items", [])
    return items[0] if items else None


def get_artist(token: str, artist_id: str) -> dict:
    resp = requests.get(
        ARTIST_URL.format(artist_id),
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def sync_spotify(conn: sqlite3.Connection):
    row = conn.execute(
        "SELECT artist_id, artist_name, client_id, client_secret FROM analytics_connections WHERE platform='spotify'"
    ).fetchone()
    if not row:
        return
    artist_id, artist_name, client_id, client_secret = row
    if not client_id or not client_secret:
        return
    try:
        token = get_token(client_id, client_secret)
        # If no artist_id stored yet, search by name
        if not artist_id and artist_name:
            artist = search_artist(token, artist_name)
            if artist:
                artist_id = artist["id"]
                conn.execute(
                    "UPDATE analytics_connections SET artist_id=? WHERE platform='spotify'",
                    (artist_id,),
                )
                conn.commit()
        if not artist_id:
            return
        data = get_artist(token, artist_id)
        now = datetime.now(timezone.utc).isoformat()
        metrics = [
            ("followers", data.get("followers", {}).get("total", 0), None),
            ("popularity", data.get("popularity", 0), None),
            ("name", None, data.get("name")),
            ("genres", None, json.dumps(data.get("genres", []))),
            ("image_url", None, (data.get("images") or [{}])[0].get("url")),
            ("spotify_url", None, data.get("external_urls", {}).get("spotify")),
        ]
        for key, val, text in metrics:
            conn.execute(
                """
                INSERT INTO analytics_metrics(platform, metric_key, metric_value, metric_text, recorded_at, raw_json)
                VALUES ('spotify', ?, ?, ?, ?, ?)
                ON CONFLICT(platform, metric_key, recorded_at) DO UPDATE SET
                  metric_value=excluded.metric_value, metric_text=excluded.metric_text
                """,
                (key, val, text, now[:10], json.dumps(data)),
            )
        conn.execute(
            "UPDATE analytics_connections SET last_synced_at=? WHERE platform='spotify'",
            (now,),
        )
        conn.commit()
        print(f"[spotify] synced: {data.get('name')} — {data.get('followers', {}).get('total', 0)} followers")
    except Exception as e:
        print(f"[spotify] sync error: {e}")
