"""
sync.py — Sync orchestrator. Dispatches per-platform sync functions.
"""

import sqlite3

from .platforms import discord, google, instagram, tiktok
from .platforms.spotify import sync_spotify
from .platforms.lastfm import sync_lastfm
from .platforms.youtube_music import sync_youtube


async def sync_platform(platform: str, conn: sqlite3.Connection) -> dict:
    if platform == "google":
        return await google.sync(conn)
    if platform == "discord":
        return await discord.sync(conn)
    if platform == "instagram":
        return await instagram.sync(conn)
    if platform == "tiktok":
        return await tiktok.sync(conn)
    if platform == "square":
        from db.integrations.platforms import square as sq
        return await sq.sync(conn)
    return {"synced": 0, "errors": [f"Unknown platform: {platform}"]}


async def sync_all(conn: sqlite3.Connection) -> list[dict]:
    results = []
    platforms = conn.execute(
        "SELECT platform FROM integration_connections WHERE status='connected'"
    ).fetchall()
    for (platform,) in platforms:
        result = await sync_platform(platform, conn)
        results.append({"platform": platform, **result})

    # Analytics platforms — run synchronously, each isolated so one failure won't block others
    for fn, name in [(sync_spotify, "spotify"), (sync_lastfm, "lastfm"), (sync_youtube, "youtube")]:
        try:
            fn(conn)
        except Exception as e:
            print(f"[sync_all] {name} error: {e}")

    return results
