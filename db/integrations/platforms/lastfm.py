"""
lastfm.py — Last.fm API analytics sync.
Fetches artist listeners, playcount, bio, and metadata.
"""

import json
import sqlite3
from datetime import datetime, timezone

import requests

BASE = "https://ws.audioscrobbler.com/2.0/"


def sync_lastfm(conn: sqlite3.Connection):
    row = conn.execute(
        "SELECT artist_name, api_key FROM analytics_connections WHERE platform='lastfm'"
    ).fetchone()
    if not row:
        return
    artist_name, api_key = row
    if not api_key or not artist_name:
        return
    try:
        resp = requests.get(
            BASE,
            params={
                "method": "artist.getinfo",
                "artist": artist_name,
                "api_key": api_key,
                "format": "json",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("artist", {})
        stats = data.get("stats", {})
        now = datetime.now(timezone.utc).isoformat()
        metrics = [
            ("listeners", int(stats.get("listeners", 0)), None),
            ("playcount", int(stats.get("playcount", 0)), None),
            ("name", None, data.get("name")),
            ("url", None, data.get("url")),
            ("bio", None, (data.get("bio") or {}).get("summary", "")[:500]),
        ]
        for key, val, text in metrics:
            conn.execute(
                """
                INSERT INTO analytics_metrics(platform, metric_key, metric_value, metric_text, recorded_at, raw_json)
                VALUES ('lastfm', ?, ?, ?, ?, ?)
                ON CONFLICT(platform, metric_key, recorded_at) DO UPDATE SET
                  metric_value=excluded.metric_value, metric_text=excluded.metric_text
                """,
                (key, val, text, now[:10], json.dumps(data)),
            )
        conn.execute(
            "UPDATE analytics_connections SET last_synced_at=? WHERE platform='lastfm'",
            (now,),
        )
        conn.commit()
        print(f"[lastfm] synced: {data.get('name')} — {stats.get('listeners', '?')} listeners")
    except Exception as e:
        print(f"[lastfm] sync error: {e}")
