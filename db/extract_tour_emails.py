#!/usr/bin/env python3
"""
extract_tour_emails.py
Rex — Data & Tooling Developer, Valletta

Streams through the Gmail mbox export, filters for tour-relevant emails,
and writes clean readable output to:
  - db/tour_emails.txt      (full email details)
  - db/tour_contacts.txt    (Name | Email | Context)
"""

import mailbox
import re
import sys
import email.header
import html
from datetime import datetime

# ── Paths ────────────────────────────────────────────────────────────────────
MBOX_PATH   = "/Users/keenancarroll/Documents/Music/Valletta/All mail Including Spam and Trash.mbox"
EMAILS_OUT  = "/Users/keenancarroll/Documents/Music/Valletta/db/tour_emails.txt"
CONTACTS_OUT = "/Users/keenancarroll/Documents/Music/Valletta/db/tour_contacts.txt"

# ── Keywords ─────────────────────────────────────────────────────────────────
KEYWORDS = [
    "tour", "touring", "tour date", "show", "shows", "gig", "booking",
    "booked", "venue", "venues", "contract", "advance", "hospitality",
    "guarantee", "merch split", "door deal", "opener", "support",
    "headliner", "festival", "setlist", "load-in", "soundcheck",
    "sound check", "valletta",
]
# Build one compiled regex for speed
KEYWORD_PATTERN = re.compile(
    "|".join(re.escape(kw) for kw in KEYWORDS),
    re.IGNORECASE,
)

DIVIDER = "=" * 80

# ── Helpers ──────────────────────────────────────────────────────────────────

def decode_header_value(raw):
    """Decode RFC2047-encoded header (=?UTF-8?...?=) to plain string."""
    if raw is None:
        return ""
    parts = email.header.decode_header(raw)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            charset = charset or "utf-8"
            decoded.append(part.decode(charset, errors="replace"))
        else:
            decoded.append(part)
    return " ".join(decoded)


def strip_html(html_text):
    """Remove HTML tags and decode HTML entities."""
    text = re.sub(r'<style[^>]*>.*?</style>', ' ', html_text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    # Collapse excessive whitespace
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    text = re.sub(r'[ \t]+', ' ', text)
    return text.strip()


def strip_quoted_replies(body):
    """
    Attempt to remove quoted reply chains.
    Strips lines starting with '>' and common 'On ... wrote:' patterns.
    """
    # Remove 'On <date>, <name> wrote:' and everything after
    body = re.sub(
        r'\nOn .{0,200}wrote:\n.*',
        '',
        body,
        flags=re.DOTALL,
    )
    # Remove lines starting with >
    lines = body.splitlines()
    clean = [ln for ln in lines if not ln.strip().startswith(">")]
    return "\n".join(clean).strip()


def get_body(msg):
    """
    Walk MIME parts.  Prefer text/plain; fall back to text/html stripped.
    Returns plain-text string.
    """
    plain_parts = []
    html_parts  = []

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp  = str(part.get("Content-Disposition") or "")
            if "attachment" in disp:
                continue
            if ctype == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    plain_parts.append(payload.decode(charset, errors="replace"))
            elif ctype == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    html_parts.append(payload.decode(charset, errors="replace"))
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            ctype = msg.get_content_type()
            text = payload.decode(charset, errors="replace")
            if ctype == "text/html":
                html_parts.append(text)
            else:
                plain_parts.append(text)

    if plain_parts:
        return "\n".join(plain_parts)
    elif html_parts:
        return strip_html("\n".join(html_parts))
    return ""


def is_tour_relevant(subject, body):
    """Return True if subject or body contains any keyword."""
    return bool(
        KEYWORD_PATTERN.search(subject) or
        KEYWORD_PATTERN.search(body)
    )


# Very basic heuristic: if an address doesn't look like a personal Gmail/Yahoo,
# treat it as a potential venue/industry contact.
PERSONAL_DOMAINS = re.compile(
    r"@(gmail|yahoo|hotmail|outlook|icloud|me|mac|live|msn|aol)\.",
    re.IGNORECASE,
)

def extract_contacts(from_field, to_field, subject):
    """
    Parse From / To for name+email pairs.
    Returns list of (name, email, context) tuples.
    """
    contacts = []
    combined = f"{from_field} {to_field}"
    # Match "Display Name <address@domain>" or bare addresses
    matches = re.findall(
        r'([^<,;]*?)\s*<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>|'
        r'([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})',
        combined,
    )
    for m in matches:
        name  = m[0].strip().strip('"') if m[0] else ""
        addr  = m[1] if m[1] else m[2]
        if not addr:
            continue
        # Only keep contacts that look like industry (non-personal) addresses
        if not PERSONAL_DOMAINS.search(addr):
            context = subject[:80] if subject else ""
            contacts.append((name, addr, context))
    return contacts


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[{datetime.now():%H:%M:%S}] Opening mbox: {MBOX_PATH}")
    mbox = mailbox.mbox(MBOX_PATH)

    total        = 0
    matched      = 0
    skipped      = 0
    contact_set  = {}   # addr -> (name, context) — deduplicated by address

    emails_file   = open(EMAILS_OUT,   "w", encoding="utf-8")
    contacts_file = open(CONTACTS_OUT, "w", encoding="utf-8")

    contacts_file.write("Name | Email | Context\n")
    contacts_file.write("-" * 80 + "\n")

    try:
        for msg in mbox:
            total += 1

            if total % 1000 == 0:
                print(
                    f"[{datetime.now():%H:%M:%S}] "
                    f"Scanned {total:,} emails | matched {matched:,} | skipped {skipped:,}",
                    flush=True,
                )

            try:
                subject = decode_header_value(msg.get("Subject", ""))
                from_   = decode_header_value(msg.get("From",    ""))
                to_     = decode_header_value(msg.get("To",      ""))
                date_   = msg.get("Date", "")

                body = get_body(msg)

                if not body:
                    skipped += 1
                    continue

                if not is_tour_relevant(subject, body):
                    continue

                # ── Write email block ─────────────────────────────────────
                matched += 1
                clean_body = strip_quoted_replies(body)

                emails_file.write(DIVIDER + "\n")
                emails_file.write(f"Date: {date_}\n")
                emails_file.write(f"From: {from_}\n")
                emails_file.write(f"To:   {to_}\n")
                emails_file.write(f"Subject: {subject}\n\n")
                emails_file.write(clean_body[:8000])   # cap per-email at 8k chars
                emails_file.write("\n\n")

                # ── Collect contacts ──────────────────────────────────────
                for name, addr, ctx in extract_contacts(from_, to_, subject):
                    if addr not in contact_set:
                        contact_set[addr] = (name, ctx)

            except Exception as e:
                skipped += 1
                # Don't let a single bad message abort the run
                continue

    finally:
        # Write final divider
        emails_file.write(DIVIDER + "\n")
        emails_file.close()

        # Write contacts
        for addr, (name, ctx) in sorted(contact_set.items()):
            contacts_file.write(f"{name} | {addr} | {ctx}\n")
        contacts_file.close()

        mbox.close()

    print()
    print("=" * 60)
    print(f"DONE — {datetime.now():%H:%M:%S}")
    print(f"  Total emails scanned : {total:,}")
    print(f"  Tour-relevant matches: {matched:,}")
    print(f"  Skipped (no body)    : {skipped:,}")
    print(f"  Unique contacts found: {len(contact_set):,}")
    print(f"  Output: {EMAILS_OUT}")
    print(f"  Output: {CONTACTS_OUT}")
    print("=" * 60)


if __name__ == "__main__":
    main()
