"""
token_store.py — In-memory OAuth state for PKCE / state param validation.
State entries expire after 10 minutes and are consumed on use (no replay).
"""

import secrets
import time

_OAUTH_STATE: dict[str, dict] = {}


def create_state(platform: str, **extra) -> str:
    token = secrets.token_urlsafe(32)
    _OAUTH_STATE[token] = {"platform": platform, "expires": time.time() + 600, **extra}
    return token


def consume_state(token: str) -> dict | None:
    entry = _OAUTH_STATE.pop(token, None)
    if entry and entry["expires"] > time.time():
        return entry
    return None
