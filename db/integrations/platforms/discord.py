"""
discord.py — Discord bot token REST sync (no OAuth)
Reads messages from all text channels in the configured server.
"""

import json
import sqlite3
from datetime import datetime, timezone

import httpx

DISCORD_API = "https://discord.com/api/v10"


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _snowflake_to_dt(snowflake: str) -> str:
    """Convert Discord snowflake ID to ISO 8601 datetime."""
    ts_ms = (int(snowflake) >> 22) + 1420070400000
    return datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()


async def test_connection(bot_token: str, server_id: str) -> dict:
    """Validate bot token and server ID. Returns {'ok': bool, 'label': str, 'error': str}."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{DISCORD_API}/guilds/{server_id}",
            headers={"Authorization": f"Bot {bot_token}"},
            timeout=10,
        )
        if r.status_code == 200:
            guild = r.json()
            return {"ok": True, "label": guild.get("name", server_id)}
        return {"ok": False, "label": None, "error": f"HTTP {r.status_code}: {r.text[:200]}"}


async def sync(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        "SELECT access_token, account_label FROM integration_connections WHERE platform='discord'"
    ).fetchone()
    if not row or not row[0]:
        return {"synced": 0, "errors": ["Discord not connected"]}

    # access_token stores "bot_token|server_id"
    try:
        bot_token, server_id = row[0].split("|", 1)
    except ValueError:
        return {"synced": 0, "errors": ["Discord credentials malformed"]}

    errors = []
    synced = 0
    headers = {"Authorization": f"Bot {bot_token}"}

    # Cutoff: 14 days ago as a snowflake (approximate)
    cutoff_dt = datetime.now(tz=timezone.utc).timestamp() - 14 * 86400
    cutoff_snowflake = str(int((cutoff_dt * 1000 - 1420070400000) * 4194304))

    async with httpx.AsyncClient() as client:
        # List channels
        r = await client.get(f"{DISCORD_API}/guilds/{server_id}/channels", headers=headers, timeout=10)
        if r.status_code != 200:
            return {"synced": 0, "errors": [f"Could not list channels: HTTP {r.status_code}"]}

        channels = [c for c in r.json() if c.get("type") == 0]  # type 0 = text channel

        for channel in channels:
            ch_id = channel["id"]
            ch_name = channel.get("name", ch_id)

            try:
                msgs_r = await client.get(
                    f"{DISCORD_API}/channels/{ch_id}/messages",
                    headers=headers,
                    params={"limit": 50, "after": cutoff_snowflake},
                    timeout=10,
                )
                if msgs_r.status_code == 403:
                    continue  # bot lacks permission for this channel
                if msgs_r.status_code != 200:
                    errors.append(f"#{ch_name}: HTTP {msgs_r.status_code}")
                    continue

                for msg in msgs_r.json():
                    if msg.get("type") != 0:  # only regular messages
                        continue
                    author = msg.get("author", {})
                    sender = f"{author.get('username', 'unknown')}#{author.get('discriminator', '0')}"
                    content = msg.get("content", "")[:500]
                    msg_id = msg["id"]
                    received_at = _snowflake_to_dt(msg_id)

                    conn.execute(
                        """INSERT INTO integration_messages
                           (platform, external_id, channel, sender, subject, body_preview, url, received_at, synced_at)
                           VALUES ('discord', ?, ?, ?, NULL, ?, ?, ?, ?)
                           ON CONFLICT(platform, external_id) DO UPDATE SET synced_at=excluded.synced_at""",
                        (msg_id, ch_name, sender, content,
                         f"https://discord.com/channels/{server_id}/{ch_id}/{msg_id}",
                         received_at, _now()),
                    )
                    synced += 1
            except Exception as e:
                errors.append(f"#{ch_name}: {e}")

    # Retention
    conn.execute(
        "DELETE FROM integration_messages WHERE platform='discord' AND received_at < datetime('now', '-90 days')"
    )
    conn.execute(
        "UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE platform='discord'",
        (_now(), "; ".join(errors) if errors else None, _now()),
    )
    conn.commit()
    return {"synced": synced, "errors": errors}
