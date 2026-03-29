"""
youtube_music.py — YouTube Data API v3 analytics sync.
Fetches channel subscribers, views, video count, and metadata.
"""

import json
import sqlite3
from datetime import datetime, timezone

import requests

CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
SEARCH_URL   = "https://www.googleapis.com/youtube/v3/search"


def sync_youtube(conn: sqlite3.Connection):
    row = conn.execute(
        "SELECT artist_id, artist_name, api_key FROM analytics_connections WHERE platform='youtube'"
    ).fetchone()
    if not row:
        return
    channel_id, artist_name, api_key = row
    if not api_key:
        return
    try:
        # If no channel_id, search for channel by artist name
        if not channel_id and artist_name:
            resp = requests.get(
                SEARCH_URL,
                params={
                    "part": "snippet",
                    "q": artist_name,
                    "type": "channel",
                    "maxResults": 1,
                    "key": api_key,
                },
                timeout=10,
            )
            resp.raise_for_status()
            items = resp.json().get("items", [])
            if items:
                channel_id = items[0]["id"]["channelId"]
                conn.execute(
                    "UPDATE analytics_connections SET artist_id=? WHERE platform='youtube'",
                    (channel_id,),
                )
                conn.commit()
        if not channel_id:
            return
        resp = requests.get(
            CHANNELS_URL,
            params={
                "part": "statistics,snippet,brandingSettings",
                "id": channel_id,
                "key": api_key,
            },
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return
        data = items[0]
        stats = data.get("statistics", {})
        snippet = data.get("snippet", {})
        now = datetime.now(timezone.utc).isoformat()
        metrics = [
            ("subscribers", int(stats.get("subscriberCount", 0)), None),
            ("views", int(stats.get("viewCount", 0)), None),
            ("videos", int(stats.get("videoCount", 0)), None),
            ("name", None, snippet.get("title")),
            ("description", None, snippet.get("description", "")[:300]),
            ("thumbnail", None, snippet.get("thumbnails", {}).get("high", {}).get("url")),
            ("channel_url", None, f"https://youtube.com/channel/{channel_id}"),
        ]
        for key, val, text in metrics:
            conn.execute(
                """
                INSERT INTO analytics_metrics(platform, metric_key, metric_value, metric_text, recorded_at, raw_json)
                VALUES ('youtube', ?, ?, ?, ?, ?)
                ON CONFLICT(platform, metric_key, recorded_at) DO UPDATE SET
                  metric_value=excluded.metric_value, metric_text=excluded.metric_text
                """,
                (key, val, text, now[:10], json.dumps(stats)),
            )
        conn.execute(
            "UPDATE analytics_connections SET last_synced_at=? WHERE platform='youtube'",
            (now,),
        )
        conn.commit()
        print(f"[youtube] synced: {snippet.get('title')} — {stats.get('subscriberCount', '?')} subs")
    except Exception as e:
        print(f"[youtube] sync error: {e}")
