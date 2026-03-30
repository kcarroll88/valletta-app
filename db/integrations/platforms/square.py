"""Square integration — OAuth + catalog/inventory/orders sync."""
import os
import json
import secrets
import hashlib
import base64
from datetime import datetime, timezone

SQUARE_APP_ID     = os.getenv("SQUARE_APP_ID", "")
SQUARE_APP_SECRET = os.getenv("SQUARE_APP_SECRET", "")
SQUARE_ENV        = os.getenv("SQUARE_ENV", "production")   # production | sandbox

BASE_URL     = "https://connect.squareup.com" if SQUARE_ENV == "production" else "https://connect.squareupsandbox.com"
AUTH_URL     = f"{BASE_URL}/oauth2/authorize"
TOKEN_URL    = f"{BASE_URL}/oauth2/token"
REVOKE_URL   = f"{BASE_URL}/oauth2/revoke"

SCOPES = "ITEMS_READ INVENTORY_READ ORDERS_READ MERCHANT_PROFILE_READ"


def get_auth_url(state: str) -> str:
    params = {
        "client_id":     SQUARE_APP_ID,
        "scope":         SCOPES,
        "session":       "false",
        "state":         state,
        "redirect_uri":  os.getenv("SQUARE_REDIRECT_URI", ""),
    }
    from urllib.parse import urlencode
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    import httpx
    resp = httpx.post(TOKEN_URL, json={
        "client_id":     SQUARE_APP_ID,
        "client_secret": SQUARE_APP_SECRET,
        "code":          code,
        "grant_type":    "authorization_code",
        "redirect_uri":  os.getenv("SQUARE_REDIRECT_URI", ""),
    }, headers={"Square-Version": "2024-01-18", "Content-Type": "application/json"})
    resp.raise_for_status()
    data = resp.json()
    if "access_token" not in data:
        raise ValueError(f"Square token exchange failed: {data}")
    expires = data.get("expires_at")  # ISO 8601
    merchant_id = data.get("merchant_id", "")
    return {
        "access_token":    data["access_token"],
        "refresh_token":   data.get("refresh_token"),
        "token_expires_at": expires,
        "account_label":   merchant_id,
        "token_scope":     data.get("scope", SCOPES),
    }


def refresh_token(conn) -> str | None:
    """Refresh Square access token if expired or close to expiry."""
    row = conn.execute(
        "SELECT access_token, refresh_token, token_expires_at FROM integration_connections WHERE platform='square'"
    ).fetchone()
    if not row or not row["refresh_token"]:
        return None
    import httpx
    resp = httpx.post(TOKEN_URL, json={
        "client_id":     SQUARE_APP_ID,
        "client_secret": SQUARE_APP_SECRET,
        "grant_type":    "refresh_token",
        "refresh_token": row["refresh_token"],
    }, headers={"Square-Version": "2024-01-18", "Content-Type": "application/json"})
    if resp.status_code != 200:
        return None
    data = resp.json()
    new_token = data.get("access_token")
    if new_token:
        from db.integrations.router import _now
        conn.execute(
            "UPDATE integration_connections SET access_token=?, token_expires_at=?, updated_at=? WHERE platform='square'",
            (new_token, data.get("expires_at"), _now())
        )
        conn.commit()
    return new_token


async def sync(conn) -> dict:
    """Sync catalog items, inventory counts, and recent orders from Square."""
    row = conn.execute(
        "SELECT access_token, token_expires_at FROM integration_connections WHERE platform='square'"
    ).fetchone()
    if not row or not row["access_token"]:
        return {"synced": 0, "errors": ["Not connected"]}

    token = row["access_token"]
    errors = []
    synced = 0

    try:
        from square import Square
        client = Square(token=token, environment=SQUARE_ENV)

        # ── Catalog items ───────────────────────────────────────────────
        try:
            cursor = None
            while True:
                kwargs = {"types": "ITEM"}
                if cursor:
                    kwargs["cursor"] = cursor
                result = client.catalog.list_catalog(**kwargs)
                if result.errors:
                    errors.append(f"Catalog: {result.errors}")
                    break
                for obj in (result.objects or []):
                    item_data = obj.item_data or {}
                    variations = item_data.variations or []
                    for var in variations:
                        var_data = var.item_variation_data or {}
                        price = None
                        if var_data.price_money:
                            price = var_data.price_money.amount
                        conn.execute(
                            """INSERT INTO square_catalog_items (square_id, name, description, sku, price_cents, updated_at)
                               VALUES (?,?,?,?,?,?)
                               ON CONFLICT(square_id) DO UPDATE SET
                               name=excluded.name, description=excluded.description,
                               sku=excluded.sku, price_cents=excluded.price_cents, updated_at=excluded.updated_at""",
                            (var.id, f"{item_data.name or ''} — {var_data.name or 'Default'}".strip(" —"),
                             item_data.description, var_data.sku, price,
                             datetime.now(timezone.utc).isoformat())
                        )
                        synced += 1
                cursor = result.cursor
                if not cursor:
                    break
        except Exception as e:
            errors.append(f"Catalog sync: {e}")

        # ── Inventory counts ────────────────────────────────────────────
        try:
            items = conn.execute("SELECT square_id FROM square_catalog_items").fetchall()
            item_ids = [r["square_id"] for r in items]
            if item_ids:
                result = client.inventory.batch_retrieve_inventory_counts(
                    body={"catalog_object_ids": item_ids[:500]}
                )
                if result.errors:
                    errors.append(f"Inventory: {result.errors}")
                else:
                    for count in (result.counts or []):
                        conn.execute(
                            """INSERT INTO square_inventory (catalog_item_id, location_id, quantity, state, calculated_at, updated_at)
                               VALUES (?,?,?,?,?,?)
                               ON CONFLICT(catalog_item_id, location_id) DO UPDATE SET
                               quantity=excluded.quantity, state=excluded.state,
                               calculated_at=excluded.calculated_at, updated_at=excluded.updated_at""",
                            (count.catalog_object_id, count.location_id,
                             float(count.quantity or 0), count.state,
                             count.calculated_at,
                             datetime.now(timezone.utc).isoformat())
                        )
        except Exception as e:
            errors.append(f"Inventory sync: {e}")

        # ── Recent orders (last 90 days) ────────────────────────────────
        try:
            from datetime import timedelta
            cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
            result = client.orders.search_orders(body={
                "query": {
                    "filter": {
                        "date_time_filter": {
                            "created_at": {"start_at": cutoff}
                        }
                    },
                    "sort": {"sort_field": "CREATED_AT", "sort_order": "DESC"}
                },
                "limit": 500,
                "return_entries": False,
            })
            if result.errors:
                errors.append(f"Orders: {result.errors}")
            else:
                for order in (result.orders or []):
                    total = order.total_money.amount if order.total_money else None
                    items_count = len(order.line_items or [])
                    cust_name = None
                    if order.fulfillments:
                        f = order.fulfillments[0]
                        ftype = f.type
                        fstate = f.state
                        if f.shipment_details and f.shipment_details.recipient:
                            cust_name = f.shipment_details.recipient.display_name
                        elif f.pickup_details and f.pickup_details.recipient:
                            cust_name = f.pickup_details.recipient.display_name
                    else:
                        ftype = fstate = None
                    conn.execute(
                        """INSERT INTO square_orders (square_id, location_id, state, total_cents,
                           item_count, customer_name, fulfillment_type, fulfillment_state, created_at, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(square_id) DO UPDATE SET
                           state=excluded.state, total_cents=excluded.total_cents,
                           fulfillment_state=excluded.fulfillment_state, updated_at=excluded.updated_at""",
                        (order.id, order.location_id, order.state, total,
                         items_count, cust_name, ftype, fstate,
                         order.created_at, datetime.now(timezone.utc).isoformat())
                    )
                    for li in (order.line_items or []):
                        li_total = li.total_money.amount if li.total_money else None
                        li_base = li.base_price_money.amount if li.base_price_money else None
                        conn.execute(
                            """INSERT OR IGNORE INTO square_order_items
                               (order_id, catalog_item_id, name, quantity, base_price_cents, total_cents)
                               VALUES (?,?,?,?,?,?)""",
                            (order.id, li.catalog_object_id, li.name,
                             float(li.quantity or 1), li_base, li_total)
                        )
                    synced += 1
        except Exception as e:
            errors.append(f"Orders sync: {e}")

        conn.commit()
        from db.integrations.router import _now
        conn.execute(
            "UPDATE integration_connections SET last_sync_at=?, last_error=?, updated_at=? WHERE platform='square'",
            (_now(), ("; ".join(errors) if errors else None), _now())
        )
        conn.commit()

    except Exception as e:
        errors.append(str(e))

    return {"synced": synced, "errors": errors}
