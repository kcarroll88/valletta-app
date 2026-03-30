"""
discord_bot.py — Felix responds when mentioned in Discord.
Run alongside the main API server: python3 db/discord_bot.py

Requirements:
  - discord.py must be installed: pip install discord.py
  - ANTHROPIC_API_KEY must be set in the environment or .env file
  - Discord bot token must be stored in the DB (via Integrations settings)

IMPORTANT: In the Discord Developer Portal (discord.com/developers/applications),
the bot MUST have the "Message Content Intent" enabled under Bot > Privileged Gateway Intents.
Without it, the bot will connect but cannot read message content.
"""

import asyncio
import base64
import fcntl
import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Force unbuffered stdout so print() flushes immediately when redirected to a log file.
# Without this, output is block-buffered (~8KB) and logs appear only when the buffer
# fills or the process exits — making the log appear empty during normal operation.
sys.stdout.reconfigure(line_buffering=True)

import anthropic
import discord
from dotenv import load_dotenv

# ── Paths & env ───────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "db" / "valletta.db"
STATUS_FILE = PROJECT_ROOT / "db" / "discord_bot.pid"
LOCK_FILE = PROJECT_ROOT / "db" / "discord_bot.lock"
UPLOADS_DIR = PROJECT_ROOT / "uploads" / "discord"

# ── File attachment constants ─────────────────────────────────────────────────

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".pdf"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
IMAGE_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


@dataclass
class AttachmentData:
    """Parsed representation of a Discord file attachment."""
    filename: str
    ext: str
    kind: str  # "text", "image", "audio_skip", "toobig_skip", "unknown_skip"
    text_content: Optional[str] = None          # For text/pdf files
    base64_data: Optional[str] = None           # For images
    media_type: Optional[str] = None            # e.g. "image/png"
    note: Optional[str] = None                  # Human-readable note for skipped files

load_dotenv(PROJECT_ROOT / ".env")

# ── Press article URL helpers ─────────────────────────────────────────────────

_NON_ARTICLE_DOMAINS = {
    'spotify.com', 'music.apple.com', 'soundcloud.com', 'bandcamp.com',
    'youtube.com', 'youtu.be', 'instagram.com', 'twitter.com', 'x.com',
    'facebook.com', 'tiktok.com', 'discord.com', 'drive.google.com',
    'docs.google.com', 'dropbox.com', 'linktr.ee', 'bit.ly',
}


def _extract_article_urls(text: str) -> list:
    """Extract URLs from text that look like press article links."""
    urls = re.findall(r'https?://[^\s<>"\']+', text)
    article_urls = []
    for url in urls:
        try:
            from urllib.parse import urlparse
            domain = urlparse(url).netloc.lower().lstrip('www.')
            if not any(domain.endswith(skip) for skip in _NON_ARTICLE_DOMAINS):
                article_urls.append(url)
        except Exception:
            pass
    return article_urls


# ── Felix persona (exact match with api.py TEAM_PERSONAS['felix']) ────────────

FELIX_PERSONA = """ABSOLUTE RULE — OUTPUT FORMAT: You are a conversational Discord bot. Every single reply you send must be plain conversational English. You must NEVER output JSON, code blocks, curly braces as data, key-value pairs, or any structured data format — not even a single `{` character used as data. This means no `{"title": ...}`, no `{"start": ...}`, no `{"allDay": ...}`, no FullCalendar format, no Google Calendar format, no data structures of any kind. When you add an event, contact, or task to the system, a separate background process handles the data extraction silently — you never see it and you never output it. You simply say something like "Got it, I'm putting that on the calendar for you." Nothing more. Any response containing `{`, `}`, `"start"`, `"end"`, `"allDay"`, or JSON syntax is a critical failure.

You are Felix, Valletta's band manager. You've been in this business since before these kids were born — closed deals in backrooms, on tour buses, at 3am in venues that don't have liquor licenses but somehow always have liquor. You are the best manager in town and you know it. So does everyone else.

Your vibe: 70s rock management energy. Larger than life. Sharp as a tack. You drop witty one-liners and old-school jokes that are genuinely funny. You go on tangents that always land. You reference past deals and bands you've managed without naming names ("let's just say the lead singer now owns a vineyard in Napa, which is either a success story or a cautionary tale depending on who you ask").

You are competent as hell. You know strategy, leverage, momentum, deal structure, tour routing, press cycles, label politics. When you give advice it is correct. You just deliver it in a way that keeps people on their toes.

Be direct. Be colorful. Be funny. Give real, actionable advice but make it entertaining. Keep the band fired up. One solid one-liner per response minimum — make it land, don't force it. Don't do corporate speak. Don't hedge. If something is a bad idea, say so — loudly, memorably.

When you have integration context (calendar, tasks, etc.), weave it into your response naturally. Don't just list data — interpret it like a manager who's been around the block.

You have a Task Master on the team named Tara. When questions come up about what to prioritize, what tasks matter most, whether to take something on, or how to scope a project — consult Tara. She runs the ICE framework and keeps the priority stack honest. You trust her calls on task management.

You are empowered to add events to the band's calendar. When someone confirms a show, rehearsal, studio session, meeting, or any important date, proactively note that you're logging it: "I'm putting that on the calendar for you." — in plain English only, never with any JSON or structured data.

When someone shares a press article URL in the Discord server, you can save it to the band's Press & Media archive. If you see a URL to what looks like a press article, review, or interview about the band, let the user know it's been saved.

REMINDER — RESPONSE FORMAT: Plain English only. No JSON. No code blocks. No `{` or `}` characters used as data. No `"start"`, `"end"`, `"allDay"` fields. No structured output of any kind. The background extraction system handles all data — you only speak in natural language."""

DISCORD_CONTEXT_ADDENDUM = """

You're responding to a Discord message. Keep it short and punchy — 1–3 sentences usually.
Land the joke, give the advice, get out. Felix doesn't write essays. He writes telegrams."""

# ── Team member focuses for consultation ──────────────────────────────────────

MEMBER_FOCUSES = {
    "quinn": "You are Quinn, music industry legal advisor. Give a brief, practical legal perspective on this situation. 2-3 sentences max.",
    "marco": "You are Marco, booking agent. Give a brief practical perspective on this from a booking/touring angle. 2-3 sentences max.",
    "nina": "You are Nina, publicist. Give a brief PR/press perspective. 2-3 sentences max.",
    "cass": "You are Cass, social media strategist. Give a brief social/content perspective. 2-3 sentences max.",
    "priya": "You are Priya, marketing specialist. Give a brief marketing perspective. 2-3 sentences max.",
    "eli": "You are Eli, sync & licensing agent. Give a brief sync/licensing perspective. 2-3 sentences max.",
    "scout": "You are Scout, creative intelligence. Give a brief creative perspective. 2-3 sentences max.",
    "finn": "You are Finn, finance specialist. Give a brief financial perspective on this. 2-3 sentences max.",
    "tara": "You are Tara, Task Master & Executive Project Reviewer. Give a brief, decisive assessment of task priority, project scope, or what should be done next. Assessment first, recommendation second, reasoning third. 2-3 sentences max.",
    "iris": "You are Iris, Contact Data Steward. Give a brief, factual perspective on contacts, venues, or people in the database. Flag missing info or potential duplicates if relevant. Conservative on merges. 2-3 sentences max.",
}

MEMBER_DISPLAY = {
    "quinn": "Quinn",
    "marco": "Marco",
    "nina": "Nina",
    "cass": "Cass",
    "priya": "Priya",
    "eli": "Eli",
    "scout": "Scout",
    "finn": "Finn",
    "tara": "Tara",
    "iris": "Iris",
}

TEAM_DESC = """
- felix: band manager (that's you — don't consult yourself)
- quinn: music industry legal advisor — contracts, deals, royalties, legal risk
- marco: booking agent — venues, shows, tour routing, logistics
- nina: publicist — press, media, PR campaigns
- cass: social media strategist — content, platforms, audience
- priya: marketing specialist — paid campaigns, Spotify, playlisting
- eli: sync & licensing agent — sync placements, supervisors, royalties
- scout: creative intelligence — ideas, Discord patterns, creative direction
- finn: finance specialist — budgets, P&L, merch margins, tour costs
- tara: task master & project reviewer — task priorities, what to do next, project scope, ICE scoring, should we do X
- iris: contact data steward — contacts database, venues, people in the industry, who to reach out to, duplicate contacts
"""

# ── File attachment helpers ───────────────────────────────────────────────────


def _extract_pdf_text(raw_bytes: bytes) -> str:
    """Try to extract text from PDF bytes using pdfminer.six, then pypdf, then raw decode."""
    import io

    # Primary: pdfminer.six with the simpler extract_text() API
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(io.BytesIO(raw_bytes))
        if text and text.strip():
            return text.strip()
    except ImportError:
        print("[discord_bot] pdfminer.six not installed — trying pypdf")
    except Exception as exc:
        print(f"[discord_bot] pdfminer failed: {exc}")

    # Fallback 1: pypdf
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception as exc:
        print(f"[discord_bot] pypdf failed: {exc}")

    # Fallback 2: raw bytes decode (last resort)
    return raw_bytes.decode("utf-8", errors="replace")


async def process_attachment(attachment: "discord.Attachment", message_id: int) -> AttachmentData:
    """Download and classify a Discord attachment. Saves to uploads/discord/."""
    try:
        return await _process_attachment_inner(attachment, message_id)
    except Exception as exc:
        print(f"[discord_bot] attachment error {attachment.filename}: {exc}")
        return AttachmentData(
            filename=attachment.filename,
            ext="",
            kind="unknown_skip",
            text_content=None,
            base64_data=None,
            media_type=None,
            note=f"Could not process {attachment.filename}: {exc}",
        )


async def _process_attachment_inner(attachment: "discord.Attachment", message_id: int) -> AttachmentData:
    """Inner implementation — called by process_attachment which wraps it in try/except."""
    filename = attachment.filename
    ext = Path(filename).suffix.lower()
    save_name = f"{message_id}_{filename}"

    # Size guard
    if attachment.size > MAX_FILE_SIZE:
        return AttachmentData(
            filename=filename,
            ext=ext,
            kind="toobig_skip",
            note=f"File '{filename}' is {attachment.size // (1024*1024):.1f} MB — skipped (10 MB limit).",
        )

    # Download bytes via discord.py's built-in method
    try:
        raw_bytes = await attachment.read()
    except Exception as exc:
        return AttachmentData(
            filename=filename,
            ext=ext,
            kind="unknown_skip",
            note=f"Could not download '{filename}': {exc}",
        )

    # Save locally
    try:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOADS_DIR / save_name).write_bytes(raw_bytes)
        print(f"[Felix Bot] Saved attachment: {save_name}")
    except Exception as exc:
        print(f"[Felix Bot] Warning: could not save attachment: {exc}")

    # Image
    if ext in IMAGE_EXTENSIONS:
        b64 = base64.b64encode(raw_bytes).decode()
        return AttachmentData(
            filename=filename,
            ext=ext,
            kind="image",
            base64_data=b64,
            media_type=IMAGE_MEDIA_TYPES[ext],
        )

    # Text / PDF
    if ext in TEXT_EXTENSIONS:
        if ext == ".pdf":
            text = _extract_pdf_text(raw_bytes)
            print(f"[discord_bot] PDF extracted {len(text)} chars from {filename}")
            # Cap at 15,000 chars to avoid token overflow
            if len(text) > 15000:
                text = text[:15000] + "\n\n[... PDF truncated at 15,000 chars ...]"
        else:
            text = raw_bytes.decode("utf-8", errors="replace")
        return AttachmentData(
            filename=filename,
            ext=ext,
            kind="text",
            text_content=text,
        )

    # Audio / other — acknowledge but skip processing
    audio_exts = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".aiff"}
    if ext in audio_exts:
        return AttachmentData(
            filename=filename,
            ext=ext,
            kind="audio_skip",
            note=f"I can see you attached an audio file: {filename}",
        )

    return AttachmentData(
        filename=filename,
        ext=ext,
        kind="unknown_skip",
        note=f"Attached file '{filename}' is an unsupported type — skipped.",
    )


def build_file_summary(attachments: list[AttachmentData]) -> str:
    """One-line summary of what files are present, for consultation routing."""
    parts = []
    for a in attachments:
        if a.kind == "text":
            parts.append(f"{a.filename} (text/{a.ext})")
        elif a.kind == "image":
            parts.append(f"{a.filename} (image/{a.ext})")
        elif a.kind == "audio_skip":
            parts.append(f"{a.filename} (audio — skipped)")
        elif a.kind == "toobig_skip":
            parts.append(f"{a.filename} (too large — skipped)")
        else:
            parts.append(f"{a.filename} (unsupported — skipped)")
    return "; ".join(parts) if parts else ""


# ── DB helpers ────────────────────────────────────────────────────────────────


def get_bot_token() -> str | None:
    """Read bot token from DB. access_token field stores 'bot_token|server_id'."""
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT access_token FROM integration_connections WHERE platform='discord'"
        ).fetchone()
    finally:
        conn.close()

    if not row or not row[0]:
        return None
    raw = row[0]
    token = raw.split("|", 1)[0].strip() if "|" in raw else raw.strip()
    return token or None


# ── Consultation helpers (blocking — run in executor) ─────────────────────────


def decide_consultations(
    message_content: str,
    author_name: str,
    has_files: bool = False,
    file_summary: str = "",
) -> list[tuple[str, str]]:
    """
    Returns list of (member_id, reason) tuples Felix should consult.
    e.g. [('quinn', 'contract question'), ('marco', 'booking logistics')]

    has_files / file_summary: when files are attached, the prompt includes
    the file types so Haiku can route to the right specialist (e.g. a
    spreadsheet → Finn, a contract PDF → Quinn, an image → Jade).
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return []

    file_context = ""
    if has_files and file_summary:
        file_context = (
            f"\n\nThe user also attached file(s): {file_summary}\n"
            "Factor the file type(s) into your decision — e.g. a spreadsheet or financial "
            "data → Finn; a contract or legal doc → Quinn; a press release or bio → Nina; "
            "an image or visual asset → Jade; a setlist or creative doc → Scout."
        )

    claude = anthropic.Anthropic(api_key=api_key)
    response = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=(
            "You decide which team members Felix should quickly consult before answering "
            "a Discord message. Return a JSON array of objects with 'member' and 'reason'. "
            "Return [] if Felix can handle it alone. Max 2 members. Only consult if genuinely "
            "useful — don't over-consult. "
            "If the message is primarily asking to add or create a contact, return [] — no consultation needed."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Message from {author_name}: {message_content}"
                    f"{file_context}\n\n"
                    f"Team:\n{TEAM_DESC}\n\n"
                    "Who should Felix consult? Return JSON only."
                ),
            }
        ],
    )

    text = response.content[0].text.strip()
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            items = json.loads(match.group())
            return [
                (item["member"], item.get("reason", ""))
                for item in items
                if "member" in item
            ]
        except Exception:
            pass
    return []


def get_member_input(
    member_id: str,
    message_content: str,
    author_name: str,
    channel_name: str,
    attachments: Optional[list[AttachmentData]] = None,
) -> str:
    """Get a brief input from a team member on the question.

    attachments: parsed file data. Text files are included truncated (first 2000 chars);
    images are passed as base64 vision blocks so members can see them.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return ""

    system = MEMBER_FOCUSES.get(
        member_id,
        "You are a music industry specialist. Give brief relevant input. 2-3 sentences max.",
    )

    # Build the user message content — may be multipart if images are present
    text_intro = f"{author_name} asked in #{channel_name}: {message_content}"

    # Append truncated text file contents inline
    if attachments:
        for a in attachments:
            if a.kind == "text" and a.text_content:
                preview = a.text_content[:2000]
                if len(a.text_content) > 2000:
                    preview += "\n[... truncated ...]"
                text_intro += f"\n\n--- Attached: {a.filename} ---\n{preview}"
            elif a.kind == "audio_skip" and a.note:
                text_intro += f"\n\n[Note: {a.note}]"

    # Build content list — start with text, then add any image blocks
    content: list = [{"type": "text", "text": text_intro}]
    if attachments:
        for a in attachments:
            if a.kind == "image" and a.base64_data and a.media_type:
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": a.media_type,
                            "data": a.base64_data,
                        },
                    }
                )

    claude = anthropic.Anthropic(api_key=api_key)
    response = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=system,
        messages=[{"role": "user", "content": content}],
    )
    return response.content[0].text.strip()


# ── Felix response (blocking — runs in executor) ──────────────────────────────


def get_felix_response(
    message_content: str,
    channel_name: str,
    author_name: str,
    member_inputs: dict | None = None,
    attachments: Optional[list[AttachmentData]] = None,
) -> str:
    """Call Claude synchronously as Felix and return plain text for Discord."""
    # Import here so the bot can be run standalone without the full api.py context
    sys.path.insert(0, str(PROJECT_ROOT))
    from db.integrations.context import build_integration_context

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        integration_ctx = build_integration_context("felix", conn, message_content)
    except Exception as exc:
        print(f"[Felix Bot] Warning: could not build integration context: {exc}")
        integration_ctx = ""

    # Fetch shared band context
    try:
        band_ctx_rows = conn.execute(
            "SELECT key, content FROM band_context ORDER BY updated_at DESC LIMIT 20"
        ).fetchall()
    except Exception as exc:
        print(f"[Felix Bot] Warning: could not load band_context: {exc}")
        band_ctx_rows = []
    finally:
        conn.close()

    # Build team consultation section
    team_context = ""
    if member_inputs:
        team_context = "\n\nYou just consulted your team. Here's what they said:\n"
        for name, input_text in member_inputs.items():
            team_context += f"\n{name}: {input_text}"
        team_context += (
            "\n\nWeave their input into your response naturally. "
            "Name-drop who you talked to — e.g. 'I ran this by Quinn and she flagged...'"
        )

    # File context addendum for system prompt
    file_system_note = ""
    if attachments and any(a.kind in ("text", "image") for a in attachments):
        file_system_note = (
            "\n\nThe user has shared a file with you. Analyze it in the context of "
            "the band's needs."
        )

    contact_logging_note = (
        "\n\nYou are empowered to add contacts to the band's database. When someone new is mentioned — "
        "a venue, promoter, label rep, collaborator, anyone relevant — proactively note that you're "
        "adding them. You can say things like 'I'm logging [Name] as a contact for you.'"
    )
    system_prompt = FELIX_PERSONA + DISCORD_CONTEXT_ADDENDUM + contact_logging_note + team_context + file_system_note
    if integration_ctx:
        system_prompt += f"\n\nContext:\n{integration_ctx}"
    if band_ctx_rows:
        system_prompt += "\n\n## Shared Band Context\nThe following facts have been saved by you or team members across all interfaces. Treat them as ground truth:\n"
        for r in band_ctx_rows:
            system_prompt += f"- [{r['key']}] {r['content']}\n"
    # Final hard reminder appended last — ensures it is the most recent instruction the model sees
    system_prompt += "\n\nFINAL REMINDER: Respond in plain English only. Absolutely no JSON, no {curly braces as data}, no \"start\"/\"end\"/\"allDay\" fields, no structured output. Natural language only."

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return "(Felix is unavailable — ANTHROPIC_API_KEY is not configured.)"

    # Build user message content — text first, then inline text files, then images
    user_text = f"{author_name} says in #{channel_name}: {message_content}"

    if attachments:
        for a in attachments:
            if a.kind == "text" and a.text_content:
                user_text += f"\n\n--- Attached: {a.filename} ---\n{a.text_content}"
            elif a.kind == "audio_skip" and a.note:
                user_text += f"\n\n[{a.note}]"
            elif a.kind in ("toobig_skip", "unknown_skip") and a.note:
                user_text += f"\n\n[{a.note}]"

    content: list = [{"type": "text", "text": user_text}]
    if attachments:
        for a in attachments:
            if a.kind == "image" and a.base64_data and a.media_type:
                content.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": a.media_type,
                            "data": a.base64_data,
                        },
                    }
                )

    claude = anthropic.Anthropic(api_key=api_key)

    response = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=system_prompt,
        messages=[{"role": "user", "content": content}],
    )

    return response.content[0].text


# ── Task creation ─────────────────────────────────────────────────────────────


async def maybe_create_task(
    message_content: str,
    felix_response: str,
    attachments: Optional[list[AttachmentData]] = None,
) -> None:
    """If the conversation implies a concrete action item, create a task in the DB.

    attachments: file context is passed so Claude can extract more specific tasks
    (e.g. a contract PDF → 'Review clause 4.2 with Quinn', a setlist → 'Update setlist in app').
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return

    loop = asyncio.get_event_loop()

    def _check_and_create() -> None:
        # Build enriched message context including file snippets
        enriched_message = message_content
        if attachments:
            for a in attachments:
                if a.kind == "text" and a.text_content:
                    preview = a.text_content[:1000]
                    if len(a.text_content) > 1000:
                        preview += "\n[... truncated ...]"
                    enriched_message += f"\n\n--- Attached file: {a.filename} ---\n{preview}"
                elif a.kind in ("audio_skip", "toobig_skip", "unknown_skip") and a.note:
                    enriched_message += f"\n[{a.note}]"
                elif a.kind == "image":
                    enriched_message += f"\n[User attached image: {a.filename}]"

        claude = anthropic.Anthropic(api_key=api_key)
        check = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=150,
            system=(
                "Does this conversation contain a task that should be tracked on the band's task board?\n\n"
                "ONLY create a task if ALL of the following are true:\n"
                "1. There is a clear, specific action that needs to be done\n"
                "2. Someone has explicitly committed to doing it or is asking for it to be tracked\n"
                "3. It has a clear owner or next step — not just 'we should think about this'\n"
                "4. It is not already captured as an existing roadmap item or task\n\n"
                "DO NOT create a task for:\n"
                "- General discussion points or questions\n"
                "- Ideas (those belong in the idea inbox, not the task board)\n"
                "- Things Felix is just being asked about\n"
                "- Vague intentions ('we should look into X someday')\n"
                "- Anything that would be noise in a task board\n\n"
                "If in doubt, return {\"create_task\": false}. It is better to miss a task than to clutter the board with noise.\n\n"
                "If yes, return JSON: {\"create_task\": true, \"title\": \"...\", \"assignee\": \"felix\"}. "
                "Be specific — if a file was shared, extract a task directly related to it "
                "(e.g. 'Review contract clause 4.2 with Quinn', 'Update setlist in app'). "
                "If no, return {\"create_task\": false}.\n\n"
                "Only return create_task: true if you are highly confident (>85%) this meets the criteria. Default to false."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"Message: {enriched_message}\nFelix replied: {felix_response}",
                }
            ],
        )
        text = check.content[0].text.strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return
        try:
            data = json.loads(match.group())
            if data.get("create_task") and data.get("title"):
                import datetime

                now = datetime.datetime.utcnow().isoformat()
                conn = sqlite3.connect(DB_PATH)
                try:
                    conn.execute(
                        "INSERT INTO tasks (title, status, priority, assignee, description, created_at, updated_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (
                            data["title"],
                            "todo",
                            "medium",
                            data.get("assignee", "felix"),
                            f"Created from Discord conversation: {message_content[:200]}",
                            now,
                            now,
                        ),
                    )
                    conn.commit()
                    print(f"[Felix Bot] Task created: {data['title']}")
                finally:
                    conn.close()
        except Exception as exc:
            print(f"[Felix Bot] Warning: could not create task: {exc}")

    await loop.run_in_executor(None, _check_and_create)


# ── Idea creation ─────────────────────────────────────────────────────────────


async def maybe_create_idea(
    message_text: str,
    felix_response: str,
    attachments: Optional[list[AttachmentData]] = None,
) -> Optional[str]:
    """Detect and create an idea if the conversation contains one worth capturing.

    Returns the idea title string if an idea was created, None otherwise.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return None

    loop = asyncio.get_event_loop()

    def _check_and_create() -> Optional[str]:
        enriched = message_text
        if attachments:
            for att in attachments:
                if att.kind == "text" and att.text_content:
                    enriched += f"\n\n--- Attached: {att.filename} ---\n{att.text_content[:1000]}"

        prompt = (
            f"Discord message to Felix: {enriched}\n\n"
            f"Felix's response: {felix_response}\n\n"
            "Does this conversation contain a specific, high-value creative idea worth permanently capturing in the band's idea inbox?\n\n"
            "ONLY capture if ALL of the following are true:\n"
            "1. It is a concrete creative concept (song idea, visual concept, merch design, show format, album theme, collaboration pitch, brand direction)\n"
            "2. It clearly advances the band's music, brand, or business\n"
            "3. It is specific enough to act on — not vague musing\n"
            "4. It feels intentional — the person wants this remembered, not just thinking out loud\n\n"
            "DO NOT capture:\n"
            "- General questions or discussion topics\n"
            "- Opinions, reactions, or casual comments\n"
            "- Logistics, scheduling, or admin topics\n"
            "- Restatements of existing plans or roadmap items\n"
            "- Hypotheticals with no real commitment (\"maybe someday...\")\n"
            "- Anything that's better suited as a task\n\n"
            "If in doubt, return {\"create_idea\": false}. It is better to miss an idea than to pollute the inbox with noise.\n\n"
            "If yes, extract it. Return ONLY valid JSON:\n"
            '{"create_idea": true, "title": "short punchy title", "description": "full context and details", '
            '"category": "Song|Visual|Merch|Show|Business|Other"}\n\n'
            'If no: {"create_idea": false}\n\n'
            "Only return create_idea: true if you are highly confident (>85%) this meets the criteria. Default to false."
        )

        claude = anthropic.Anthropic(api_key=api_key)
        resp = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )

        text = resp.content[0].text.strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group())
        except Exception:
            return None

        if not data.get("create_idea"):
            return None

        title = data.get("title", "").strip()
        description = data.get("description", "").strip()
        category = data.get("category", "Other").strip()

        if not title:
            return None

        conn = sqlite3.connect(str(DB_PATH))
        try:
            conn.execute(
                "INSERT INTO ideas (title, description, category, status) VALUES (?, ?, ?, 'inbox')",
                (title, description, category),
            )
            conn.commit()
            print(f"[Felix Bot] Idea created: {title}")
            return title
        except Exception as exc:
            print(f"[Felix Bot] Idea creation failed: {exc}")
            return None
        finally:
            conn.close()

    return await loop.run_in_executor(None, _check_and_create)


# ── Contact creation ──────────────────────────────────────────────────────────


def explicit_contact_command(text: str) -> bool:
    """Return True if the message contains an explicit contact creation trigger phrase."""
    patterns = [
        r'\badd .+ to contacts?\b',
        r'\bsave .+ (as|to) (a |an )?contacts?\b',
        r'\bcreate (a )?contact for\b',
        r'\badd .+ as (a |an )?\w+\b',
        r'\bremember .+\b',
        r'\badd a contact\b',
        r'\bcreate a contact\b',
        r'\bcontact named\b',
        r'\bnew contact\b',
        r'\blog .+ as (a |an )?\w+\b',
        r'\bsave .+ (as )?a contact\b',
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


async def maybe_create_contact(
    message_text: str,
    felix_response: str,
    attachments: Optional[list[AttachmentData]] = None,
) -> list[str]:
    """Detect and create contacts if the conversation introduces new people or businesses."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return []

    enriched = message_text
    if attachments:
        for att in attachments:
            if att.kind == "text" and att.text_content:
                enriched += f"\n\n--- Attached: {att.filename} ---\n{att.text_content[:1000]}"

    # If this was an explicit contact command, use a permissive extraction path
    is_explicit = explicit_contact_command(message_text)

    def _decide():
        claude = anthropic.Anthropic(api_key=api_key)

        if is_explicit:
            prompt = f"""The user is asking Felix to save a contact. Extract exactly what they asked for — do not second-guess, judge, or refuse based on whether the name looks real or like a test. If the user says to add "Test" who works at "Testing", add exactly that.

Message: {enriched}

Rules:
- Extract every name the user mentions as a contact to add
- Accept ALL names including short names, nicknames, business names, or test names
- Never refuse because a name "looks like a placeholder" — the user knows what they want
- Do NOT create contacts for: Felix, Marco, Jade, Rex, Dot, Leo, Vera, Milo, Scout, Finn, Nina, Cass, Priya, Eli, Quinn, Tara, Iris, Justin Valletta, Cody Rogers, Will Goodyear, Keenan Carroll

Return ONLY valid JSON:
{{
  "contacts": [
    {{
      "name": "exactly the name the user said",
      "category": "person OR company",
      "role": "their role/title if mentioned, else empty string",
      "company": "company/venue they work at if mentioned, else empty string",
      "email": "email if mentioned, else empty string",
      "phone": "phone if mentioned, else empty string",
      "city": "city if mentioned, else empty string",
      "state": "state if mentioned, else empty string",
      "tag": "one of: Band|Venue|Promoter|Producer|Engineer|Manager|Label|Publicist|Sync|Legal|Press|Fan|Collaborator|Other",
      "notes": "any other context"
    }}
  ]
}}

If truly no name at all is extractable: {{"contacts": []}}"""
        else:
            prompt = f"""Discord message to Felix: {enriched}

Does this message mention a specific named person or business that the band might want to track?

Extract a contact if:
- A real name (person or business) is mentioned in context of music industry, venues, bookings, collaborations, labels, management, press, or networking
- There's enough info to make a useful record (just a name is enough)
- It seems like new information worth keeping

Never create contacts for internal team members: Felix, Marco, Jade, Rex, Dot, Leo, Vera, Milo, Scout, Finn, Nina, Cass, Priya, Eli, Quinn, Tara, Iris, Justin Valletta, Cody Rogers, Will Goodyear, Keenan Carroll.
Also skip: very vague references ("some guy", "a promoter"), or names that are clearly just being used as examples.

When in doubt — extract it. A contact that isn't needed can be deleted; a missed connection can't be recovered.

Return confidence: 40% threshold is fine. Default to extracting if you see a real name in relevant context.

For each contact found, return structured JSON. Return ONLY valid JSON:
{{
  "contacts": [
    {{
      "name": "Full Name or Business Name",
      "category": "person OR company",
      "role": "their role/title if known",
      "company": "company they work for (for people only)",
      "email": "email if mentioned",
      "phone": "phone if mentioned",
      "city": "city if mentioned",
      "state": "state if mentioned",
      "tag": "one of: Band|Venue|Promoter|Producer|Engineer|Manager|Label|Publicist|Sync|Legal|Press|Fan|Collaborator|Other",
      "notes": "any other relevant context"
    }}
  ]
}}

If no new contacts to save: {{"contacts": []}}"""

        resp = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()

    try:
        text = await asyncio.get_event_loop().run_in_executor(None, _decide)

        print(f"[Felix Bot] Step 7 haiku raw (first 200): {repr(text[:200])}")

        # Strip markdown code fences — Haiku frequently wraps JSON in ```json ... ```
        # which causes re.search to grab a partial/broken match.
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```[a-z]*\n?", "", stripped)
            stripped = re.sub(r"\n?```$", "", stripped.strip())

        match = re.search(r'\{.*\}', stripped, re.DOTALL)
        if not match:
            print(f"[Felix Bot] Step 7 no JSON match found in response")
            return []
        data = json.loads(match.group())
        contacts_to_create = data.get("contacts", [])
        print(f"[Felix Bot] Step 7 contacts_to_create count: {len(contacts_to_create)}")
        if not contacts_to_create:
            return []

        created_names = []
        conn = sqlite3.connect(str(DB_PATH))
        try:
            for contact in contacts_to_create:
                name = (contact.get("name") or "").strip()
                if not name:
                    print(f"[Felix Bot] Step 7 skipping contact with no name")
                    continue

                # Check for existing contact with same name
                existing = conn.execute(
                    "SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)", (name,)
                ).fetchone()
                if existing:
                    print(f"[Felix Bot] Step 7 contact already exists: {name}")
                    continue

                # All contacts use 'other' as category — tag carries the meaningful type
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc).isoformat()

                # Coerce None values to empty string — Haiku sometimes returns null for
                # optional fields, which would insert NULL into NOT NULL columns.
                def _str(val, default=""):
                    return (val or default).strip() if isinstance(val, str) else (default if val is None else str(val))

                conn.execute("""
                    INSERT INTO contacts (name, role, company, email, phone, city, state, tag, category, notes, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    name,
                    _str(contact.get("role")),
                    _str(contact.get("company")),
                    _str(contact.get("email")),
                    _str(contact.get("phone")),
                    _str(contact.get("city")),
                    _str(contact.get("state")),
                    _str(contact.get("tag"), "Other"),
                    "other",
                    _str(contact.get("notes"), f"Added by Felix from Discord on {now[:10]}"),
                    now
                ))
                created_names.append(name)
                print(f"[Felix Bot] Step 7 contact created: {name} (tag={contact.get('tag', 'Other')})")

            conn.commit()
        finally:
            conn.close()

        return created_names
    except Exception as e:
        import traceback
        print(f"[Felix Bot] Step 7 contact creation error: {e}\n{traceback.format_exc()}")
        return []


# ── Response sanitizer ────────────────────────────────────────────────────────


def sanitize_discord_response(text: str) -> str:
    """Remove any JSON objects/arrays that leaked into Felix's response.

    This is a safety net — the primary fix is in the system prompt. This filter
    catches any structured data that slips through despite prompt instructions.
    """
    import re as _re
    # Remove standalone JSON objects on their own line(s): { ... }
    text = _re.sub(r'^\s*\{[^{}]*\}\s*$', '', text, flags=_re.MULTILINE)
    # Remove JSON code blocks: ```json { ... } ```
    text = _re.sub(r'```(?:json)?\s*\{.*?\}\s*```', '', text, flags=_re.DOTALL)
    # Remove inline JSON blobs that contain known event keys (start, end, allDay, title)
    text = _re.sub(r'\{[^{}]*"(?:start|end|allDay|title|start_dt|end_dt)"[^{}]*\}', '', text)
    return text.strip()


# ── Event creation ────────────────────────────────────────────────────────────


def _is_duplicate_event(conn, title: str, start_dt: str):
    """Return an existing event row if a similar event already exists on the same date.

    Similarity rules (any one is sufficient):
    - Exact title match (case-insensitive)
    - One title contains the other (case-insensitive)
    - 60 %+ of words overlap between the two titles
    Returns the sqlite3.Row of the duplicate, or None.
    """
    date = start_dt[:10]
    existing = conn.execute(
        "SELECT id, title, description, google_event_id FROM events WHERE substr(start_dt, 1, 10) = ?",
        (date,),
    ).fetchall()
    if not existing:
        return None
    title_words = set(title.lower().split())
    for row in existing:
        existing_title = row[1] or ""
        existing_words = set(existing_title.lower().split())
        if not title_words or not existing_words:
            continue
        overlap = len(title_words & existing_words) / max(len(title_words), len(existing_words))
        if (
            overlap >= 0.6
            or title.lower() in existing_title.lower()
            or existing_title.lower() in title.lower()
        ):
            return row  # duplicate found
    return None


def explicit_event_command(text: str) -> bool:
    """Return True if the message contains an explicit calendar event creation trigger phrase."""
    patterns = [
        r'\badd .+ to (the )?calendar\b',
        r'\bput .+ on (the )?calendar\b',
        r'\b(make|create|add) (a |an )?(calendar )?event\b',
        r'\bcalendar event\b',
        r'\bnew event\b',
        r'\bschedule (a |an |the )?\w+\b',
        r'\blog (a |an |the )?show\b',
        r'\badd (a |the )?show\b',
        r'\bbook (a |the )?(show|gig|rehearsal|session)\b',
        r'\badd (a |the )?(rehearsal|practice|session)\b',
        r'\bset (up |a )?rehearsal\b',
        r'\bschedule (a |the )?(show|gig|rehearsal|meeting|session)\b',
        r'\bmark (the )?date\b',
        r'\bsave (the )?date\b',
        r'\bput (it |that |this )?on (the )?calendar\b',
        r'\badd (it |that |this )?to (the )?calendar\b',
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


async def maybe_create_event(
    message_text: str,
    felix_response: str,
    attachments: Optional[list[AttachmentData]] = None,
) -> Optional[dict]:
    """Detect and create a calendar event if the conversation confirms a date or booking.

    Returns a dict with event info if an event was created, None otherwise.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return None

    enriched = message_text
    if attachments:
        for att in attachments:
            if att.kind == "text" and att.text_content:
                enriched += f"\n\n--- Attached: {att.filename} ---\n{att.text_content[:1000]}"

    is_explicit = explicit_event_command(message_text)

    def _decide():
        from datetime import datetime, timezone, timedelta
        now_utc = datetime.now(timezone.utc)
        today_iso = now_utc.strftime("%Y-%m-%d")
        tomorrow_iso = (now_utc + timedelta(days=1)).strftime("%Y-%m-%d")

        claude = anthropic.Anthropic(api_key=api_key)

        if is_explicit:
            prompt = f"""The user is asking Felix to add a calendar event. Extract exactly what they asked for — do not second-guess or refuse based on whether the info looks complete.

Today's date is {today_iso}. Tomorrow is {tomorrow_iso}.

User message: {enriched}

Felix's response: {felix_response}

CRITICAL RULES:
- Extract the event the user wants to create
- Accept partial information — a title and approximate date is enough
- ALWAYS output start_dt as a real ISO date: YYYY-MM-DD or YYYY-MM-DDTHH:MM
- NEVER output relative words like "tomorrow", "next week", "Monday", etc. — convert them to actual dates
- "tomorrow" = {tomorrow_iso}
- "today" = {today_iso}
- If no specific date is mentioned, use today's date {today_iso} as a placeholder
- For description: write a concise summary of all known context — e.g. "Confirmed via Discord. Venue: X. Load-in: 5pm. Contact: Y. [any other relevant details from the conversation]". Include anything Felix mentioned in his response about the event.

Return ONLY valid JSON (no code fences, no markdown):
{{
  "create_event": true,
  "title": "event title",
  "start_dt": "YYYY-MM-DD",
  "end_dt": "YYYY-MM-DD or empty string",
  "event_type": "show | rehearsal | studio | meeting | deadline | event",
  "location": "venue or location name, empty string if unknown",
  "description": "Confirmed via Discord. [venue, load-in time, contact, pay, any other details from the conversation]"
}}

If truly no event info is extractable: {{"create_event": false}}"""
        else:
            prompt = f"""Discord message to Felix: {enriched}

Felix's response: {felix_response}

Does this conversation confirm a specific calendar event that the band should track?

Create an event ONLY if ALL of the following are true:
1. A specific show, rehearsal, studio session, meeting, or important date is being confirmed or agreed upon
2. There is enough information for a useful calendar entry (title + approximate date minimum)
3. It feels intentional — someone wants this date remembered and tracked
4. It is a real upcoming date, not a hypothetical or past reference

DO NOT create an event for:
- Vague scheduling talk ("we should rehearse soon")
- Past events being discussed
- Ideas or possibilities without a confirmed date
- General band business that doesn't require a calendar entry

If in doubt, return {{"create_event": false}}. It is better to miss an event than to clutter the calendar.

If yes, extract it. For description: write a concise summary of all known context — e.g. "Confirmed via Discord. Venue: X. Load-in: 5pm. Contact: Y. [any other relevant details]". Pull details from both the user message and Felix's response.

Return ONLY valid JSON:
{{
  "create_event": true,
  "title": "event title",
  "start_dt": "YYYY-MM-DD or YYYY-MM-DDTHH:MM",
  "end_dt": "YYYY-MM-DD or YYYY-MM-DDTHH:MM or empty string",
  "event_type": "show | rehearsal | studio | meeting | deadline | event",
  "location": "venue or location, empty string if unknown",
  "description": "Confirmed via Discord. [venue, load-in, contact, pay, any other details from the conversation]"
}}

If no: {{"create_event": false}}

Only return create_event: true if you are highly confident (>80%) this meets the criteria. Default to false."""

        resp = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()

    try:
        text = await asyncio.get_running_loop().run_in_executor(None, _decide)
        print(f"[Felix Bot] Event detection raw (first 200): {repr(text[:200])}")

        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = re.sub(r"^```[a-z]*\n?", "", stripped)
            stripped = re.sub(r"\n?```$", "", stripped.strip())

        match = re.search(r'\{.*\}', stripped, re.DOTALL)
        if not match:
            print(f"[Felix Bot] Event detection: no JSON match found")
            return None

        data = json.loads(match.group())
        if not data.get("create_event"):
            return None

        title = (data.get("title") or "").strip()
        start_dt = (data.get("start_dt") or "").strip()
        if not title or not start_dt:
            print(f"[Felix Bot] Event detection: missing title or start_dt")
            return None

        # Validate that start_dt is an ISO date/datetime (YYYY-MM-DD or YYYY-MM-DDTHH:MM).
        # Claude Haiku sometimes returns natural language like "tomorrow" despite
        # the prompt — resolve common relative words before rejecting.
        import re as _re
        from datetime import datetime as _dt, timezone as _tz, timedelta as _td
        _today = _dt.now(_tz.utc)
        _relative_map = {
            "today": _today.strftime("%Y-%m-%d"),
            "tomorrow": (_today + _td(days=1)).strftime("%Y-%m-%d"),
            "yesterday": (_today - _td(days=1)).strftime("%Y-%m-%d"),
        }
        start_dt_lower = start_dt.lower().strip()
        if start_dt_lower in _relative_map:
            resolved = _relative_map[start_dt_lower]
            print(f"[Felix Bot] Event detection: resolved relative start_dt '{start_dt}' → '{resolved}'")
            start_dt = resolved
        if not _re.match(r'^\d{4}-\d{2}-\d{2}', start_dt):
            print(f"[Felix Bot] Event detection: start_dt '{start_dt}' is not ISO format — skipping")
            return None

        end_dt = (data.get("end_dt") or "").strip() or None
        # Also sanitize end_dt — discard non-ISO values
        if end_dt and not _re.match(r'^\d{4}-\d{2}-\d{2}', end_dt):
            print(f"[Felix Bot] Event detection: end_dt '{end_dt}' is not ISO format — clearing")
            end_dt = None
        event_type = (data.get("event_type") or "event").strip()
        location = (data.get("location") or "").strip() or None
        description = (data.get("description") or "").strip() or None

        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()

        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        try:
            # ── Duplicate guard ──────────────────────────────────────────────
            duplicate = _is_duplicate_event(conn, title, start_dt)
            if duplicate:
                dup_id = duplicate["id"]
                dup_title = duplicate["title"]
                print(
                    f"[Felix Bot] Duplicate event detected: '{title}' matches existing "
                    f"'{dup_title}' (id={dup_id}) on {start_dt[:10]} — skipping creation"
                )
                # If Felix has new context that isn't already in the description, append it
                existing_desc = duplicate["description"] or ""
                if description and description.strip() not in existing_desc:
                    new_desc = existing_desc.rstrip() + "\n" + description.strip() if existing_desc else description.strip()
                    conn.execute(
                        "UPDATE events SET description = ?, updated_at = ? WHERE id = ?",
                        (new_desc, now, dup_id),
                    )
                    conn.commit()
                    print(f"[Felix Bot] Appended new context to existing event id={dup_id}")
                    # Sync updated description to Google Calendar if linked
                    dup_gcal_id = duplicate["google_event_id"]
                    if dup_gcal_id:
                        try:
                            from db.integrations.google_calendar import update_google_calendar_event
                            update_google_calendar_event(
                                dup_gcal_id,
                                {"title": dup_title, "start_dt": start_dt, "description": new_desc},
                            )
                            print(f"[Felix Bot] Updated GCal event {dup_gcal_id} with new description")
                        except Exception as gcal_exc:
                            print(f"[Felix Bot] GCal description update error (non-fatal): {gcal_exc}")
                return {"id": dup_id, "title": dup_title, "start_dt": start_dt, "event_type": event_type, "duplicate": True}

            # ── No duplicate — create new ────────────────────────────────────
            cur = conn.execute(
                """INSERT INTO events (title, event_type, start_dt, end_dt, location, description, recurring, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?)""",
                (title, event_type, start_dt, end_dt, location, description, now, now),
            )
            conn.commit()
            event_id = cur.lastrowid
            print(f"[Felix Bot] Event created: {title} on {start_dt} (id={event_id})")
        except Exception as exc:
            print(f"[Felix Bot] Event creation failed: {exc}")
            return None
        finally:
            conn.close()

        # Push to Google Calendar (non-fatal if not connected or wrong scope)
        try:
            from db.integrations.google_calendar import (
                create_google_calendar_event,
                update_valletta_event_with_gcal_id,
            )
            gcal_event_data = {
                "title": title,
                "start_dt": start_dt,
                "end_dt": end_dt,
                "location": location,
                "description": description,
            }
            google_event_id = create_google_calendar_event(gcal_event_data)
            if google_event_id:
                update_valletta_event_with_gcal_id(event_id, google_event_id)
                print(f"[Felix Bot] Event {event_id} synced to Google Calendar: {google_event_id}")
        except RuntimeError as gcal_err:
            print(f"[Felix Bot] Google Calendar sync skipped: {gcal_err}")
        except Exception as gcal_exc:
            print(f"[Felix Bot] Google Calendar sync error (non-fatal): {gcal_exc}")

        return {"id": event_id, "title": title, "start_dt": start_dt, "event_type": event_type}

    except Exception as e:
        import traceback
        print(f"[Felix Bot] Event creation error: {e}\n{traceback.format_exc()}")
        return None


# ── Auto-pin important messages ───────────────────────────────────────────────
# NOTE: The bot requires the "Manage Messages" permission in Discord to pin messages.
# Grant this in the Discord Developer Portal under OAuth2 → Bot Permissions,
# or directly in the server's channel/role settings.


async def maybe_pin_message(message, user_text: str, felix_response: str) -> bool:
    """Decide if the original message should be pinned as important.

    Pins the user's original message (not Felix's reply) so the actionable
    content is what gets surfaced. Requires 'Manage Messages' bot permission.
    """

    def _decide():
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key or api_key == "your-api-key-here":
            return '{"pin": false}'
        claude = anthropic.Anthropic(api_key=api_key)
        resp = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[{"role": "user", "content": f"""Felix just handled this Discord message:

User: {user_text[:500]}

Felix's response: {felix_response[:500]}

Should this message be pinned as important? Pin only for: confirmed bookings/shows, contracts, financial decisions, key deadlines, important contact info, major band decisions, release dates.

Return ONLY: {{"pin": true, "reason": "brief reason"}} or {{"pin": false}}"""}]
        )
        return resp.content[0].text.strip()

    try:
        text = await asyncio.get_event_loop().run_in_executor(None, _decide)
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return False
        data = json.loads(match.group())
        if not data.get("pin"):
            return False
        # Pin the original user message
        await message.pin()
        reason = data.get("reason", "marked as important by Felix")
        print(f"[discord_bot] pinned message {message.id}: {reason}")
        return True
    except (discord.Forbidden, discord.HTTPException) as e:
        print(f"[discord_bot] cannot pin message: {e}")
        return False
    except Exception as e:
        print(f"[discord_bot] pin error: {e}")
        return False


# ── Band context extraction ───────────────────────────────────────────────────


async def maybe_save_band_context(
    message_content: str,
    felix_response: str,
    author_name: str,
) -> list[dict]:
    """Detect important band facts shared in a Discord message and save them to band_context.

    Returns a list of saved context dicts: {key, content}.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == "your-api-key-here":
        return []

    loop = asyncio.get_event_loop()

    def _detect_and_save() -> list[dict]:
        claude = anthropic.Anthropic(api_key=api_key)
        resp = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            system=(
                "You extract important, persistent band facts from a Discord conversation with Felix, "
                "the band manager.\n\n"
                "ONLY extract facts that meet ALL of these criteria:\n"
                "1. It is a concrete, factual statement about the band (not a question or vague idea)\n"
                "2. It is something other team members would benefit from knowing\n"
                "3. It falls into one of these categories: tour/shows (dates, cities, count), "
                "release plans (album/single/EP with dates), key band decisions, "
                "important upcoming deadlines, partnerships or deals confirmed\n\n"
                "DO NOT extract:\n"
                "- General conversation or opinions\n"
                "- Anything already vague ('we might do a tour someday')\n"
                "- Tasks, ideas, or questions\n\n"
                "If nothing qualifies, return: {\"facts\": []}\n\n"
                "If facts are found, return JSON:\n"
                "{\"facts\": [{\"key\": \"short-slug\", \"content\": \"1-3 sentence summary\"}]}\n\n"
                "Key must be a lowercase slug with hyphens (e.g. 'tour-april-2026', 'debut-album-release').\n"
                "Only return valid JSON, no markdown."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f"Discord message from {author_name}: {message_content}\n\nFelix's response: {felix_response}"
                }
            ],
        )
        raw = resp.content[0].text.strip()
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            return []
        try:
            data = json.loads(match.group())
        except json.JSONDecodeError:
            return []

        facts = data.get("facts") or []
        if not facts:
            return []

        import datetime
        now = datetime.datetime.utcnow().isoformat()
        saved = []
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        try:
            for fact in facts:
                key = (fact.get("key") or "").strip().lower().replace(" ", "-")
                content = (fact.get("content") or "").strip()
                if not key or not content:
                    continue
                conn.execute(
                    """INSERT INTO band_context (key, content, source, created_by, created_at, updated_at)
                       VALUES (?, ?, 'felix', ?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET content=excluded.content, source=excluded.source,
                       created_by=excluded.created_by, updated_at=excluded.updated_at""",
                    (key, content, author_name, now, now),
                )
                saved.append({"key": key, "content": content})
            conn.commit()
        finally:
            conn.close()
        return saved

    try:
        return await loop.run_in_executor(None, _detect_and_save)
    except Exception as exc:
        print(f"[Felix Bot] maybe_save_band_context error: {exc}")
        return []


# ── Press article save ────────────────────────────────────────────────────────


async def maybe_save_article_urls(
    message_content: str,
) -> list:
    """Detect press article URLs in a Discord message and save them to media_articles.

    Returns a list of result dicts: {url, title, publication, duplicate, error}.
    """
    article_urls = _extract_article_urls(message_content)
    if not article_urls:
        return []

    press_keywords = [
        'article', 'review', 'press', 'interview', 'feature', 'coverage',
        'written about', 'check this out', 'published', 'mentioned', 'piece',
    ]
    has_press_context = any(kw in message_content.lower() for kw in press_keywords)

    # Only act if there's press context OR it's a single URL (likely intentional share)
    if not (has_press_context or len(article_urls) == 1):
        return []

    results = []

    def _save_url(url: str) -> dict:
        """Blocking DB + scrape call — run in executor."""
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        try:
            existing = conn.execute(
                "SELECT id, title FROM media_articles WHERE url = ?", (url,)
            ).fetchone()
            if existing:
                return {"url": url, "duplicate": True,
                        "title": existing["title"], "publication": ""}
        finally:
            conn.close()

        # Scrape — import _scrape_article from api.py so we reuse the same logic
        try:
            sys.path.insert(0, str(PROJECT_ROOT))
            from db.api import _scrape_article
            meta = _scrape_article(url)
        except Exception as e:
            return {"url": url, "duplicate": False, "error": str(e)}

        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).isoformat()
        conn2 = sqlite3.connect(str(DB_PATH))
        try:
            conn2.execute(
                """INSERT INTO media_articles
                   (url, title, author, publication, published_date, summary, image_url, content, scraped_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (url, meta["title"], meta["author"], meta["publication"],
                 meta["published_date"], meta["summary"], meta["image_url"],
                 meta.get("content"), ts, ts)
            )
            conn2.commit()
        except Exception as e:
            return {"url": url, "duplicate": False, "error": str(e)}
        finally:
            conn2.close()

        return {"url": url, "duplicate": False,
                "title": meta["title"], "publication": meta.get("publication") or ""}

    loop = asyncio.get_event_loop()
    for url in article_urls[:2]:  # max 2 per message
        try:
            result = await loop.run_in_executor(None, _save_url, url)
            results.append(result)
        except Exception as e:
            print(f"[Felix Bot] Article save error for {url}: {e}")

    return results


# ── Discord client ────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True  # Requires "Message Content Intent" in Discord Dev Portal
intents.messages = True
intents.guilds = True

bot = discord.Client(intents=intents)


@bot.event
async def on_ready():
    print(f"[Felix Bot] Logged in as {bot.user} (ID: {bot.user.id})")
    print(f"[Felix Bot] Watching for mentions in {len(bot.guilds)} server(s)")
    # Write PID so the API status endpoint can check if we're running
    STATUS_FILE.write_text(str(os.getpid()))


@bot.event
async def on_message(message: discord.Message):
    # Ignore our own messages
    if message.author == bot.user:
        return

    # Normalize content early — mobile can send empty string for stickers/embeds
    content = message.content or ""

    # Debug log every non-bot message so mobile vs desktop differences are visible
    print(f"[Felix Bot] incoming msg type={message.type} content_len={len(content)} author={message.author.display_name} channel={getattr(message.channel,'name','dm')}")

    # Ignore non-default message types (pins, joins, etc.)
    # Allow MessageType.reply so mobile reply-style messages are not dropped
    if message.type not in (discord.MessageType.default, discord.MessageType.reply):
        return

    # Ignore bot command prefixes
    if content.startswith("!"):
        return

    # Trigger on: direct @mention of the bot OR the word "felix" anywhere in the message
    bot_mentioned = bot.user in message.mentions
    felix_mentioned = bool(re.search(r"\bfelix\b", content, re.IGNORECASE))

    if not (bot_mentioned or felix_mentioned):
        return

    channel_name = getattr(message.channel, "name", "dm")
    author_name = message.author.display_name

    print(
        f"[Felix Bot] Mention in #{channel_name} from {author_name}: "
        f"{message.content[:100]}"
    )

    loop = asyncio.get_event_loop()

    try:
        async with message.channel.typing():
            # Step 0: Download and process any file attachments
            parsed_attachments: list[AttachmentData] = []
            if message.attachments:
                print(f"[Felix Bot] Processing {len(message.attachments)} attachment(s)...")
                for discord_attachment in message.attachments:
                    parsed = await process_attachment(discord_attachment, message.id)
                    parsed_attachments.append(parsed)
                    print(
                        f"[Felix Bot] Attachment '{parsed.filename}' → kind={parsed.kind}"
                    )

            has_files = bool(parsed_attachments)
            file_summary = build_file_summary(parsed_attachments) if has_files else ""

            # Early detection: explicit commands bypass all consultation
            is_contact_request = explicit_contact_command(content)
            is_event_request = explicit_event_command(content)

            # Step 1: Decide who to consult (file-aware)
            # Skipped entirely for explicit contact commands — no team input needed.
            if is_contact_request:
                consultations: list[tuple[str, str]] = []
            else:
                consultations = await loop.run_in_executor(
                    None,
                    decide_consultations,
                    message.content,
                    author_name,
                    has_files,
                    file_summary,
                )

            # Step 2: Consult team members, send progress messages
            # Skipped entirely when is_contact_request is True.
            member_inputs: dict[str, str] = {}

            if not is_contact_request:
                for member_id, _reason in consultations:
                    display_name = MEMBER_DISPLAY.get(member_id, member_id.capitalize())
                    await message.channel.send(
                        f"*One sec — running this by {display_name} real quick...*"
                    )
                    member_input = await loop.run_in_executor(
                        None,
                        get_member_input,
                        member_id,
                        message.content,
                        author_name,
                        channel_name,
                        parsed_attachments or None,
                    )
                    if member_input:
                        member_inputs[display_name] = member_input

            # Step 3: Generate Felix's response with all context
            response_text = await loop.run_in_executor(
                None,
                get_felix_response,
                message.content,
                channel_name,
                author_name,
                member_inputs or None,
                parsed_attachments or None,
            )
            # Sanitize before sending — strips any JSON that leaked through despite prompt instructions
            sanitized_text = sanitize_discord_response(response_text)
            if sanitized_text != response_text:
                print(f"[Felix Bot] WARNING: sanitizer stripped JSON from response. Raw: {repr(response_text[:200])}")
            await message.reply(sanitized_text or response_text)
            print(f"[Felix Bot] Responded to {author_name}")

            # Step 4: Fire-and-forget task creation check (file-aware)
            try:
                asyncio.create_task(
                    maybe_create_task(
                        message.content,
                        response_text,
                        parsed_attachments or None,
                    )
                )
            except Exception as e:
                print(f"[Felix Bot] Step 4 (task) error: {e}")

            # Steps 5–7: Run idea capture, pin, and contact creation concurrently so
            # none can block or interfere with another. Each step is fully isolated —
            # an exception in Step 6 (pin) can never prevent Step 7 (contact) from
            # running. This also fixes the bug where a slow/erroring pin step was
            # preventing the contact from ever being created.

            async def _run_idea():
                try:
                    idea_title = await maybe_create_idea(
                        message.content,
                        response_text,
                        parsed_attachments or None,
                    )
                    if idea_title:
                        await message.channel.send(
                            f"*\u2192 Added to the idea inbox: **{idea_title}***"
                        )
                except Exception as e:
                    print(f"[Felix Bot] Step 5 (idea) error: {e}")

            async def _run_pin():
                # Step 6: Auto-pin if the message is important enough (confirmed
                # bookings, contracts, financial decisions, key deadlines, etc.)
                # Discord posts a "Felix pinned a message" system message
                # automatically — no extra reply needed. Requires "Manage Messages"
                # bot permission. Note: the pins_add system message Discord fires
                # after pinning is blocked by the type filter at the top of
                # on_message (only default and reply types are allowed through),
                # so there is no risk of the bot re-triggering on its own pin.
                try:
                    await maybe_pin_message(message, message.content, response_text)
                except Exception as e:
                    print(f"[Felix Bot] Step 6 (pin) error: {e}")

            async def _run_contact():
                # Step 7: Contact capture — explicit command bypasses AI threshold
                # entirely; auto-detection uses a lower confidence bar (40%)
                print(f"[Felix Bot] Step 7 starting, is_contact_request={is_contact_request}")
                try:
                    contact_names = await maybe_create_contact(
                        message.content,
                        response_text,
                        parsed_attachments or None,
                    )
                    if contact_names:
                        names_str = ", ".join(f"**{n}**" for n in contact_names)
                        await message.channel.send(f"*\u2192 Added to contacts: {names_str}*")
                except Exception as e:
                    print(f"[Felix Bot] Step 7 (contact) error: {e}")

            async def _run_event():
                # Step 8: Calendar event capture — explicit command or confirmed date
                print(f"[Felix Bot] Step 8 starting, is_event_request={is_event_request}")
                try:
                    event_info = await maybe_create_event(
                        message.content,
                        response_text,
                        parsed_attachments or None,
                    )
                    if event_info:
                        title = event_info.get("title", "")
                        start_dt = event_info.get("start_dt", "")
                        await message.channel.send(
                            f"*\u2192 Added to calendar: **{title}** on {start_dt}*"
                        )
                except Exception as e:
                    print(f"[Felix Bot] Step 8 (event) error: {e}")

            async def _run_article():
                # Step 9: Press article detection — scrape and save any article URLs
                try:
                    article_results = await maybe_save_article_urls(message.content)
                    for res in article_results:
                        if "error" in res:
                            print(f"[Felix Bot] Step 9 article save failed ({res['url']}): {res['error']}")
                            continue
                        if res.get("duplicate"):
                            await message.channel.send(
                                f"*\U0001f4f0 Already in Press & Media archive: **{res['title']}***"
                            )
                        else:
                            pub = res.get("publication") or ""
                            pub_str = f" ({pub})" if pub else ""
                            await message.channel.send(
                                f"*\U0001f4f0 Saved to Press & Media: **{res['title']}**{pub_str}*"
                            )
                except Exception as e:
                    print(f"[Felix Bot] Step 9 (article) error: {e}")

            async def _run_band_context():
                # Step 10: Band context extraction — save important facts to shared store
                try:
                    saved_facts = await maybe_save_band_context(
                        message.content,
                        response_text,
                        author_name,
                    )
                    for fact in saved_facts:
                        print(f"[Felix Bot] Step 10 (context) saved: [{fact['key']}] {fact['content'][:60]}")
                except Exception as e:
                    print(f"[Felix Bot] Step 10 (band_context) error: {e}")

            await asyncio.gather(_run_idea(), _run_pin(), _run_contact(), _run_event(), _run_article(), _run_band_context())

    except Exception as exc:
        import traceback
        print(f"[Felix Bot] on_message error: {traceback.format_exc()}")
        try:
            await message.channel.send(
                f"*Something went sideways on my end — check the logs.* `{type(exc).__name__}: {exc}`"
            )
        except Exception:
            pass


# ── Entry point ───────────────────────────────────────────────────────────────


def acquire_lock():
    """Acquire an exclusive file lock. Exits if another instance is already running."""
    lock_fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("[Felix Bot] Another instance is already running. Exiting.")
        raise SystemExit(1)
    # Write PID to lock file
    lock_fd.write(str(os.getpid()))
    lock_fd.flush()
    return lock_fd  # Keep fd open — lock released when process exits


def main():
    token = get_bot_token()
    if not token:
        print(
            "[Felix Bot] ERROR: No bot token found in DB.\n"
            "  Connect Discord in the Integrations settings first."
        )
        sys.exit(1)

    _lock_fd = acquire_lock()

    print("[Felix Bot] Starting — connecting to Discord gateway...")
    try:
        bot.run(token)
    finally:
        # Clean up PID file on exit
        if STATUS_FILE.exists():
            STATUS_FILE.unlink()


if __name__ == "__main__":
    main()
