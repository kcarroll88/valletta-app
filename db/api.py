#!/usr/bin/env python3
"""
api.py — Valletta FastAPI backend
Maintained by Rex

Serves the SQLite database over HTTP for Jade's frontend.
Runs on localhost:8000.

Start: uvicorn db.api:app --reload
  or:  python3 db/api.py
"""

import asyncio
import json
import mimetypes
import os
import secrets
import shutil
import sqlite3
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import anthropic
from dotenv import load_dotenv
from fastapi import Body, FastAPI, File as FastAPIFile, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db.integrations.router import router as integrations_router
from db.integrations.context import build_integration_context

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH      = PROJECT_ROOT / "db" / "valletta.db"

# ── Auth ──────────────────────────────────────────────────────────────────────
BAND_PASSWORD = os.getenv("BAND_PASSWORD", "valletta2024")
_ACTIVE_TOKENS: set[str] = set()

# Google OAuth login (separate from integration OAuth)
GOOGLE_LOGIN_REDIRECT_URI = os.getenv(
    "GOOGLE_LOGIN_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Scheduler ─────────────────────────────────────────────────────────────────
_SYNC_INTERVAL_SECS      = 3600   # full integration sync every 60 min
_SCAN_MIN_INTERVAL_SECS  = 1800   # minimum gap between Discord idea scans (30 min)

_sync_in_progress        = False
_last_discord_scan: float = 0.0

# ── Team member personas ──────────────────────────────────────────────────────
TEAM_PERSONAS: dict[str, str] = {
    "felix": """You are Felix, Valletta's band manager. You've been in this business since before these kids were born — closed deals in backrooms, on tour buses, at 3am in venues that don't have liquor licenses but somehow always have liquor. You are the best manager in town and you know it. So does everyone else.

Your vibe: 70s rock management energy. Larger than life. Sharp as a tack. You drop witty one-liners and old-school jokes that are genuinely funny. You go on tangents that always land. You reference past deals and bands you've managed without naming names ("let's just say the lead singer now owns a vineyard in Napa, which is either a success story or a cautionary tale depending on who you ask").

You are competent as hell. You know strategy, leverage, momentum, deal structure, tour routing, press cycles, label politics. When you give advice it is correct. You just deliver it in a way that keeps people on their toes.

Be direct. Be colorful. Be funny. Give real, actionable advice but make it entertaining. Keep the band fired up. One solid one-liner per response minimum — make it land, don't force it. Don't do corporate speak. Don't hedge. If something is a bad idea, say so — loudly, memorably.

When you have integration context (calendar, tasks, etc.), weave it into your response naturally. Don't just list data — interpret it like a manager who's been around the block.

You work FOR the band. Your job is to make sure things actually happen, not just get discussed. When action items come up in conversation, you call them out explicitly — "that's a task, I'm logging it." When you have access to the task list or calendar, you reference what's open and what's coming up. You follow through and you make sure the team follows through.

You use the create_task tool proactively. If something comes up that needs doing, you don't just mention it — you create the task on the spot. Then you confirm you did it: "Done — that's in the queue, kid."

You also use the create_event tool proactively. When a show, rehearsal, studio session, meeting, or any date gets confirmed or requested, you create the calendar event immediately. You confirm it: "Locked in — that's on the calendar." You don't wait to be asked twice.

You celebrate wins. When something gets done or goes well, you say so — loudly and memorably.""",

    "nina": """You are Nina, the Publicist for Valletta — an independent rock band.
You are sharp, fast-moving, and relationship-driven. You have placed stories across all
tiers of music media and know that press is a long game built on specificity and relationships.
Your expertise covers: press release writing, media pitching strategy, press kit management,
release campaign planning, and music media landscape (blogs, trades, streaming press, radio).
You are answering questions from Valletta band members. Be direct, specific, and realistic
about what coverage is achievable versus a reach.""",

    "cass": """You are Cass, the Social Media Strategist for Valletta — an independent rock band.
You are platform-native, data-aware, and have strong opinions about what actually works.
You think in narrative arcs, platform-specific formats, and audience psychology.
Your expertise covers: Instagram, TikTok, YouTube, X strategy; content calendar management;
short-form video scripting; caption writing; analytics interpretation; community management.
You are answering questions from Valletta band members. Be creative but grounded — you don't
chase trends blindly, only those that fit the band's identity.""",

    "marco": """You are Marco, the Booking Agent for Valletta — an independent rock band.
You are practical, well-connected, and persistently resourceful. You've worked every rung of
the live music ladder and know how venues work from the inside.
Your expertise covers: venue research and market analysis, show proposal writing, deal
evaluation (guarantees, door splits, radius clauses), tour routing, festival submissions,
and supporting act opportunities. You treat every show as a building block toward the next.
You are answering questions from Valletta band members. Be concrete about what's realistic
for the band's current stage.

You have the ability to create calendar events directly. When a show date, venue booking,
festival slot, or any live performance date is confirmed or requested, use the create_event
tool to add it to the calendar immediately. Confirm it: "That's on the calendar." """,

    "priya": """You are Priya, the Marketing Specialist for Valletta — an independent rock band.
You bridge the gap between art and audience at scale. You are analytical, creative, and
results-focused — you test, read data, and adjust.
Your expertise covers: paid social campaigns (Meta, TikTok, YouTube Ads), Spotify for Artists
strategy and editorial pitching, playlist outreach (curators and editorial), email marketing
and list growth, release strategy (presave, smart links, platform timing), and campaign analytics.
You are answering questions from Valletta band members. Be specific with strategy and realistic
about budgets and timelines.""",

    "eli": """You are Eli, the Sync & Licensing Agent for Valletta — an independent rock band.
You operate at the intersection of music and everything else that uses it. Patient,
well-networked, and meticulous — you know sync is a long game built on relationships.
Your expertise covers: music supervisor pitching, sync and master license fundamentals,
catalog clearance (co-writer sign-off, split clarity), licensing platform knowledge
(Musicbed, Artlist, Sync Summit, etc.), deal term basics, and PRO royalty tracking.
You are answering questions from Valletta band members. Always verify catalog clearance
before any pitch conversation. Be honest about realistic timelines for placements.""",

    "dot": """You are Dot, the AI orchestrator for Valletta. You have deep knowledge of the full team and all ongoing work.

Team members you can route to:
- felix: band manager — strategy, calendar, opportunities, contracts, general band business
- nina: publicist — press releases, media, press kit, journalists
- cass: social media — content, platforms, captions, short-form video
- marco: booking agent — venues, shows, festivals, tour routing
- priya: marketing — paid campaigns, Spotify, playlists, email marketing
- eli: sync & licensing — placements, music supervisors, royalties
- quinn: legal — contracts, LLC, royalties, music law
- tara: task master & project reviewer — task priorities, what to do next, ICE scoring, project scope
- iris: contact data steward — contacts database, venues, people, duplicates, enrichment

You have access to all team context. Answer questions directly and helpfully, drawing on the relevant team member's expertise. Always be concise and actionable.""",

    "scout": """You are Scout, Valletta's Creative Intelligence. Your role is to identify, capture, and structure creative ideas from Discord conversations and direct input. You surface ideas that might otherwise get lost, organize them into actionable items, and keep the idea backlog fresh.

You have access to Discord messages and the current ideas backlog.

CRITICAL RULE: When you identify an idea worth capturing — no matter how the conversation is phrased — you MUST call the create_idea tool immediately and unconditionally. Do not describe the idea, summarize it, or say you're "noting it down". Actually call the tool right now. If the user mentions an idea, concept, direction, or creative thought, call create_idea before saying anything else. Failure to call the tool means the idea is lost.

After calling the tool, briefly confirm what you captured and why it stood out. Keep responses concise. Focus on insight — what's interesting, what patterns you see, what's worth pursuing.""",

    "finn": """You are Finn, Valletta's Finance Specialist. You have deep expertise in music industry finance — not just accounting, but the specific financial realities of being an independent band: show P&L, merch margins, royalty structures, deal evaluation, budget allocation, and cash flow.

When reviewing financial data, always lead with: the numbers → what they mean → your recommendation. Be specific — never say "expenses seem high," say "your travel costs were 68% of your guarantee, which is above the 30–40% benchmark for a regional date."

You have access to Valletta's finance data including income/expense summaries, show breakdowns, category totals, and the raw Google Sheets. You also see their calendar and roadmap so you can connect financial advice to upcoming shows and planned releases.

Flag issues proactively. Give clear verdicts on deals and opportunities before explaining the reasoning. Keep responses concise in chat — offer to go deeper when the user wants a full breakdown.

Tone: knowledgeable, candid, low-ego. Like a trusted advisor who happens to be in the room.""",

    "quinn": """You are Quinn, the Music Industry Legal Advisor for Valletta — an independent rock band.

You spent years as an entertainment attorney working with independent artists before shifting
to advisory work. You've reviewed hundreds of record contracts, management agreements, sync
deals, venue contracts, and split sheets. You understand what these documents are designed to
do and who they're designed to benefit. You are not a licensed attorney in anyone's jurisdiction
and you don't pretend to be — but you are the smartest, most well-read friend the band could
have before they walk into that meeting.

Your expertise covers:
- Record contracts: term and options, royalty rates and recoupment, creative control, master ownership
- Management agreements: commission structure, term length, sunset clauses, conflict flags
- Sync and master licenses: rights granted, fee structures, exclusivity, territory
- Venue and booking contracts: radius clauses, cancellation terms, payment structure, liability
- Collaboration agreements and split sheets: enforceability, co-writer disputes
- PRO registration (ASCAP, BMI, SESAC): how royalties flow, songwriter vs. publisher splits
- 360 deals: identifying what rights are captured, evaluating whether the trade makes sense
- LLC and band business structure: member agreements, IP ownership, profit distribution
- Musician tax basics: touring expenses, home studio deductions, quarterly estimated taxes, 1099s
- Dispute basics: breach of contract, cease and desist, when arbitration applies, when to escalate

Your communication style:
- Plain-spoken and calm — legal language intimidates by design; your job is to strip that away
- Practical-first: what does this clause mean, is it a problem, what should the band do
- You ask clarifying questions before giving detailed analysis — context changes everything
- You never catastrophize, but you never soft-pedal a real problem either
- When something genuinely requires a licensed attorney's review, you say so naturally —
  not as a rote disclaimer, but as your honest professional judgment about where the stakes are

You are answering questions from Valletta band members. Always ask about context before diving
into detailed contract analysis. Work closely with Felix before any deal closes. For any agreement
the band is actively about to sign or any live dispute, recommend they have a licensed entertainment
attorney review the final document — not because you always say this, but because at that point it's
the right call.""",

    "tara": """You are Tara, Task Master & Executive Project Reviewer for Valletta — an independent rock band.

You have no patience for ambiguity and no interest in drama. You came up managing complex project portfolios across fast-moving creative organizations. You learned early that the most important thing in any operation is not the plan — it's the discipline to keep the plan honest.

You have direct read/write access to the tasks and ideas tables in the Valletta project database.

Your communication style: calm, precise, and decisive. Assessment first. Recommendation second. Reasoning third. No hedging — when you give a priority or a due date, you explain your reasoning briefly and commit to it.

ICE Framework (for evaluating ideas):
- Impact (1–5): How much does this move the band forward?
- Confidence (1–5): How actionable is this right now?
- Effort (1–5): Inverse — low effort = high score (5 = quick win)
- ICE Average ≥ 3.0 → idea should become a task
- Fast-track overrides: hard deadlines, explicit human creative intent, direct team escalation

Priority Definitions:
- critical: due within 7 days or blocking another task
- high: due within 30 days or high strategic impact
- medium: no deadline, moderate impact
- low: exploratory, no urgency

CRITICAL RULE — Human Record Protection:
- Any task or idea where the human created it (not ai/system/felix_bot/tara) must NEVER be deleted.
- You may update priority or add notes to human records, but always annotate the change with date and rationale.
- For AI/system records: may update any field, but do not delete unless explicitly instructed.

When consulted via chat, give structured answers: what you see, what you recommend, why. Be direct and specific. If something needs a task created, say so explicitly. If a priority is wrong, say so and correct it.

You also have the ability to create calendar events directly. When a deadline, milestone, or time-boxed work session needs to be tracked on the calendar, use the create_event tool.""",

    "iris": """You are Iris, the Contact Data Steward for Valletta — an independent rock band.

You manage and maintain the band's contacts database with precision and care. Your domain covers everyone the band interacts with: venues, promoters, labels, booking agents, press contacts, collaborators, and industry connections.

Your expertise:
- Identifying and flagging duplicate contact records for human review
- Enriching records with missing emails, locations, and social media links
- Correcting obvious data errors (wrong city, misspelled names, stale info)
- Answering questions about who is in the contacts database and what is known about them
- Spotting gaps: who should be in the DB that isn't

Your principles:
- You NEVER delete contacts — you flag, annotate, and recommend
- You are conservative on merges — you flag duplicates but require human confirmation before any merge
- You always note uncertainty clearly: "I'm confident about X" vs "this is a guess based on Y"
- When asked about a contact, you give structured, factual answers: name, role, company, location, email, social links, notes
- When asked to query or search the database, you describe what you'd look for and ask for the results to be shared

When consulted via chat, lead with the data: who the person/venue is, what is known, what is missing, and what action (if any) you recommend. Be precise and factual. Flag ambiguity — don't paper over it.""",
}

# ── Chat tools ────────────────────────────────────────────────────────────────

CHAT_TOOLS = [
    {
        "name": "create_idea",
        "description": "Save a new idea to the ideas backlog with inbox status",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":          {"type": "string", "description": "Short title for the idea"},
                "body":           {"type": "string", "description": "Full description or context"},
                "source_channel": {"type": "string", "description": "Where this idea came from, e.g. #general"}
            },
            "required": ["title"]
        }
    },
    {
        "name": "create_task",
        "description": "Create a new task in the project management system. Use this when the user explicitly asks you to create a task, add something to the to-do list, or when they describe something that clearly should be tracked.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":            {"type": "string", "description": "Short, clear task title"},
                "description":      {"type": "string", "description": "More detail about what needs to be done"},
                "priority":         {"type": "string", "enum": ["high", "medium", "low"]},
                "due_date":         {"type": "string", "description": "Due date as YYYY-MM-DD, only if specified"},
                "status":           {"type": "string", "enum": ["todo", "in_progress", "done", "blocked"], "default": "todo"},
                "roadmap_category": {"type": "string", "enum": ["release", "pr", "recording", "writing", "other"], "description": "Only set if this is a roadmap-level item"}
            },
            "required": ["title"]
        }
    },
    {
        "name": "create_event",
        "description": "Create a new calendar event in the Valletta calendar. Use for shows, rehearsals, studio sessions, meetings, deadlines, or any date the band needs to track.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":       {"type": "string", "description": "Event title"},
                "start_dt":    {"type": "string", "description": "Start date/time in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM)"},
                "end_dt":      {"type": "string", "description": "End date/time in ISO format (optional)"},
                "event_type":  {"type": "string", "description": "show | rehearsal | studio | meeting | deadline | event"},
                "location":    {"type": "string", "description": "Location or venue name"},
                "description": {"type": "string", "description": "Additional details or notes"},
                "recurring":   {"type": "string", "description": "none | daily | weekly | monthly (default: none)"}
            },
            "required": ["title", "start_dt"]
        }
    },
    {
        "name": "create_roadmap_item",
        "description": "Create a new roadmap item (task that appears on the Roadmap timeline)",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":             {"type": "string"},
                "roadmap_category":  {"type": "string", "description": "release | pr | recording | writing | other"},
                "start_date":        {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "due_date":          {"type": "string", "description": "ISO date YYYY-MM-DD"},
                "description":       {"type": "string"}
            },
            "required": ["title", "roadmap_category", "start_date"]
        }
    },
    {
        "name": "create_contact",
        "description": "Create a new contact — either a person or a business/company",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_type": {"type": "string", "description": "person | company"},
                "name":         {"type": "string", "description": "Full name (person) or company name"},
                "role":         {"type": "string", "description": "Their role or job title"},
                "email":        {"type": "string"},
                "phone":        {"type": "string"},
                "notes":        {"type": "string"},
                "used_for":     {"type": "string", "description": "e.g. 'Booking outreach', 'Management outreach', 'PR outreach'"},
                "url":          {"type": "string", "description": "Website URL (for companies)"}
            },
            "required": ["name", "contact_type"]
        }
    }
]

# ── Anthropic client (module-level) ──────────────────────────────────────────

_api_key     = os.getenv("ANTHROPIC_API_KEY", "")
client       = anthropic.Anthropic(api_key=_api_key) if _api_key and _api_key != "your-api-key-here" else None
async_client = anthropic.AsyncAnthropic(api_key=_api_key) if _api_key and _api_key != "your-api-key-here" else None

@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_auth_tables()
    task = asyncio.create_task(_scheduler_background_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Valletta API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://vallettamusic.com",
        "https://www.vallettamusic.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(integrations_router, prefix="/api/integrations")


# ── DB ────────────────────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def _get_conn() -> sqlite3.Connection:
    """Return a raw (non-context-manager) DB connection. Caller is responsible for closing."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _init_auth_tables():
    """Create users and auth_sessions tables if they don't exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
              id           INTEGER PRIMARY KEY AUTOINCREMENT,
              email        TEXT UNIQUE NOT NULL,
              name         TEXT,
              picture_url  TEXT,
              created_at   TEXT DEFAULT (datetime('now')),
              last_login_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auth_sessions (
              token      TEXT PRIMARY KEY,
              user_id    INTEGER NOT NULL REFERENCES users(id),
              email      TEXT NOT NULL,
              created_at TEXT DEFAULT (datetime('now')),
              expires_at TEXT NOT NULL
            )
        """)
        conn.commit()


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row)


def now_ts() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _execute_tool(tool_name: str, tool_input: dict) -> dict:
    if tool_name == "create_idea":
        with get_db() as conn:
            now = datetime.now(tz=timezone.utc).isoformat()
            cur = conn.execute(
                """INSERT INTO ideas (title, description, status, source_channel, created_at)
                   VALUES (?, ?, 'inbox', ?, ?)""",
                (
                    tool_input.get("title"),
                    tool_input.get("body"),
                    tool_input.get("source_channel"),
                    now,
                )
            )
            conn.commit()
        return {"ok": True, "id": cur.lastrowid}
    if tool_name == "create_task":
        with get_db() as conn:
            now = datetime.now(tz=timezone.utc).isoformat()
            cur = conn.execute(
                """INSERT INTO tasks (title, description, priority, due_date, status, roadmap_category, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    tool_input.get("title"),
                    tool_input.get("description"),
                    tool_input.get("priority", "medium"),
                    tool_input.get("due_date"),
                    tool_input.get("status", "todo"),
                    tool_input.get("roadmap_category"),
                    now,
                    now,
                )
            )
            conn.commit()
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"success": True, "task": row_to_dict(row)}
    if tool_name == "create_event":
        with get_db() as conn:
            now = datetime.now(tz=timezone.utc).isoformat()
            cur = conn.execute(
                """INSERT INTO events (title, event_type, start_dt, end_dt, location, description, recurring, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    tool_input.get("title"),
                    tool_input.get("event_type", "event"),
                    tool_input.get("start_dt") or tool_input.get("event_date"),
                    tool_input.get("end_dt"),
                    tool_input.get("location"),
                    tool_input.get("description"),
                    tool_input.get("recurring", "none"),
                    now,
                    now,
                )
            )
            conn.commit()
            row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
        valletta_event_id = cur.lastrowid
        # Push to Google Calendar if connected with write scope
        try:
            from db.integrations.google_calendar import (
                create_google_calendar_event,
                update_valletta_event_with_gcal_id,
            )
            gcal_event_data = {
                "title": tool_input.get("title"),
                "start_dt": tool_input.get("start_dt") or tool_input.get("event_date"),
                "end_dt": tool_input.get("end_dt"),
                "location": tool_input.get("location"),
                "description": tool_input.get("description"),
            }
            google_event_id = create_google_calendar_event(gcal_event_data)
            if google_event_id:
                update_valletta_event_with_gcal_id(valletta_event_id, google_event_id)
                print(f"[API] Event {valletta_event_id} synced to Google Calendar: {google_event_id}")
        except RuntimeError as gcal_err:
            print(f"[API] Google Calendar sync skipped: {gcal_err}")
        except Exception as gcal_exc:
            print(f"[API] Google Calendar sync error (non-fatal): {gcal_exc}")
        return {"ok": True, "id": valletta_event_id, "title": tool_input.get("title"), "start_dt": tool_input.get("start_dt") or tool_input.get("event_date")}
    if tool_name == "create_roadmap_item":
        with get_db() as conn:
            now = datetime.now(tz=timezone.utc).isoformat()
            cur = conn.execute(
                """INSERT INTO tasks (title, description, status, priority, start_date, due_date, roadmap_category, created_at, updated_at)
                   VALUES (?, ?, 'todo', 'medium', ?, ?, ?, ?, ?)""",
                (
                    tool_input.get("title"),
                    tool_input.get("description"),
                    tool_input.get("start_date"),
                    tool_input.get("due_date"),
                    tool_input.get("roadmap_category"),
                    now,
                    now,
                )
            )
            conn.commit()
        return {"ok": True, "id": cur.lastrowid}
    if tool_name == "create_contact":
        contact_type = tool_input.get("contact_type", "person")
        with get_db() as conn:
            if contact_type == "company":
                now = datetime.now(tz=timezone.utc).isoformat()
                cur = conn.execute(
                    """INSERT INTO sources (title, url, source_type, description, used_for, created_at)
                       VALUES (?, ?, 'service', ?, ?, ?)""",
                    (
                        tool_input.get("name"),
                        tool_input.get("url"),
                        tool_input.get("notes"),
                        tool_input.get("used_for"),
                        now,
                    )
                )
            else:
                cur = conn.execute(
                    """INSERT INTO contacts (name, role, email, phone, notes)
                       VALUES (?, ?, ?, ?, ?)""",
                    (
                        tool_input.get("name"),
                        tool_input.get("role"),
                        tool_input.get("email"),
                        tool_input.get("phone"),
                        tool_input.get("notes"),
                    )
                )
            conn.commit()
        return {"ok": True, "id": cur.lastrowid, "contact_type": contact_type}
    return {"error": f"Unknown tool: {tool_name}"}


# ── Models ────────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title: str
    start_dt: str
    event_type: Optional[str] = None
    end_dt: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    recurring: Optional[str] = "none"

class EventUpdate(BaseModel):
    title: Optional[str] = None
    start_dt: Optional[str] = None
    event_type: Optional[str] = None
    end_dt: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    recurring: Optional[str] = None

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "todo"
    priority: Optional[str] = "medium"
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    related_event: Optional[int] = None
    parent_id: Optional[int] = None
    start_date: Optional[str] = None
    roadmap_category: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    assignee: Optional[str] = None
    parent_id: Optional[int] = None
    start_date: Optional[str] = None
    roadmap_category: Optional[str] = None

class SourceCreate(BaseModel):
    title: str
    url: Optional[str] = None
    source_type: Optional[str] = "other"
    description: Optional[str] = None
    used_by: Optional[str] = None
    used_for: Optional[str] = None
    accessed_at: Optional[str] = None
    outreach_status: Optional[str] = None

class SourceUpdate(BaseModel):
    title: Optional[str] = None
    url: Optional[str] = None
    source_type: Optional[str] = None
    description: Optional[str] = None
    used_by: Optional[str] = None
    used_for: Optional[str] = None
    accessed_at: Optional[str] = None
    outreach_status: Optional[str] = None

class ContactCreate(BaseModel):
    name: str
    role: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[str] = 'other'
    social_links: Optional[dict] = None

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    category: Optional[str] = None
    outreach_status: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    tag: Optional[str] = None
    social_links: Optional[dict] = None

class OutreachCreate(BaseModel):
    source_id: Optional[int] = None
    contact_id: Optional[int] = None
    direction: str = 'sent'   # 'sent' | 'received'
    message: str
    contacted_at: Optional[str] = None
    notes: Optional[str] = None

class OutreachUpdate(BaseModel):
    direction: Optional[str] = None
    message: Optional[str] = None
    contacted_at: Optional[str] = None
    notes: Optional[str] = None

class IdeaCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = 'other'

class IdeaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None

class SetlistCreate(BaseModel):
    name: str
    date: Optional[str] = None
    venue: Optional[str] = None
    notes: Optional[str] = None

class SetlistUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    venue: Optional[str] = None
    notes: Optional[str] = None

class SetlistSong(BaseModel):
    title: Optional[str] = None       # frontend sends 'title'
    song_title: Optional[str] = None  # keep for compatibility
    position: int
    notes: Optional[str] = None


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def dashboard():
    with get_db() as conn:
        file_count   = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        by_category  = conn.execute(
            "SELECT category, COUNT(*) as count FROM files WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC"
        ).fetchall()
        event_count  = conn.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        upcoming     = conn.execute(
            "SELECT id, title, event_type, start_dt, location FROM events WHERE start_dt >= ? ORDER BY start_dt LIMIT 5",
            (now_ts()[:10],)
        ).fetchall()
        open_tasks   = conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE status != 'done'"
        ).fetchone()[0]
        high_priority = conn.execute(
            "SELECT id, title, status, due_date, assignee FROM tasks WHERE status != 'done' AND priority = 'high' ORDER BY due_date LIMIT 5"
        ).fetchall()
        source_count = conn.execute("SELECT COUNT(*) FROM sources").fetchone()[0]

    return {
        "files":       {"total": file_count, "by_category": [row_to_dict(r) for r in by_category]},
        "events":      {"total": event_count, "upcoming": [row_to_dict(r) for r in upcoming]},
        "tasks":       {"open": open_tasks, "high_priority": [row_to_dict(r) for r in high_priority]},
        "sources":     {"total": source_count},
    }


# ── Files ─────────────────────────────────────────────────────────────────────

@app.get("/api/files")
def list_files(
    category:    Optional[str] = None,
    subcategory: Optional[str] = None,
    extension:   Optional[str] = None,
    q:           Optional[str] = None,
    limit:       int = Query(100, le=500),
    offset:      int = 0,
):
    clauses, params = [], []
    if category:    clauses.append("category = ?");    params.append(category)
    if subcategory: clauses.append("subcategory = ?"); params.append(subcategory)
    if extension:   clauses.append("extension = ?");   params.append(extension.lstrip(".").lower())
    if q:           clauses.append("filename LIKE ?"); params.append(f"%{q}%")
    sql = "SELECT * FROM files"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY filepath LIMIT ? OFFSET ?"
    params += [limit, offset]
    count_sql = "SELECT COUNT(*) FROM files" + (" WHERE " + " AND ".join(clauses) if clauses else "")
    with get_db() as conn:
        rows  = conn.execute(sql, params).fetchall()
        total = conn.execute(count_sql, params[:-2]).fetchone()[0]
    return {"total": total, "items": [row_to_dict(r) for r in rows]}


@app.get("/api/files/{file_id}")
def get_file(file_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        raise HTTPException(404, "File not found")
    return row_to_dict(row)


@app.patch("/api/files/{file_id}/pin")
def toggle_pin(file_id: int, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        row = conn.execute("SELECT pinned FROM files WHERE id=?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "File not found")
        # Enforce max 8 pinned
        new_val = 0 if row["pinned"] else 1
        if new_val == 1:
            count = conn.execute("SELECT COUNT(*) FROM files WHERE pinned=1").fetchone()[0]
            if count >= 8:
                raise HTTPException(400, "Quick Access is full — unpin a file to add another")
        conn.execute("UPDATE files SET pinned=? WHERE id=?", (new_val, file_id))
        conn.commit()
    return {"id": file_id, "pinned": bool(new_val)}


@app.get("/api/files/categories/list")
def list_categories():
    with get_db() as conn:
        cats = conn.execute(
            "SELECT DISTINCT category, subcategory FROM files WHERE category IS NOT NULL ORDER BY category, subcategory"
        ).fetchall()
    return [row_to_dict(r) for r in cats]


# ── File Upload ────────────────────────────────────────────────────────────────

_UPLOAD_DIR = PROJECT_ROOT / "Uploads"


def _guess_category(ext: str, mime: str) -> str:
    ext  = ext.lower()
    mime = mime.lower()
    if ext in {"jpg", "jpeg", "png", "gif", "webp", "heic", "svg"} or mime.startswith("image/"):
        return "Photos"
    if ext == "pdf":
        return "PR"
    if ext in {"mp3", "wav", "flac", "aiff", "m4a"} or mime.startswith("audio/"):
        return "Music"
    if ext in {"mp4", "mov", "avi", "mkv"} or mime.startswith("video/"):
        return "Videos"
    if ext in {"doc", "docx", "txt", "md"}:
        return "Assets"
    if ext in {"xls", "xlsx", "csv"}:
        return "Assets"
    return "Assets"


@app.post("/api/upload", status_code=201)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)

    _UPLOAD_DIR.mkdir(exist_ok=True)

    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    safe_name = (file.filename or "upload").replace(" ", "_")
    dest      = _UPLOAD_DIR / f"{timestamp}_{safe_name}"

    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    size     = dest.stat().st_size
    ext      = dest.suffix.lstrip(".")
    mime     = mimetypes.guess_type(str(dest))[0] or "application/octet-stream"
    category = _guess_category(ext, mime)

    # filepath stored relative to project root (matches index_files.py convention)
    rel_path  = dest.relative_to(PROJECT_ROOT).as_posix()
    now       = datetime.now(tz=timezone.utc).isoformat()

    with get_db() as conn:
        cur = conn.execute(
            """INSERT OR IGNORE INTO files
                   (filename, filepath, extension, category, size_bytes, modified_at, indexed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (dest.name, rel_path, ext, category, size, now, now),
        )
        file_id = cur.lastrowid
        conn.commit()

        # Create a Milo task to review and organise the uploaded file
        conn.execute(
            """INSERT INTO tasks (title, description, status, priority, assignee, created_at, updated_at)
               VALUES (?, ?, 'todo', 'low', 'milo', ?, ?)""",
            (
                f"Organize uploaded file: {file.filename}",
                (
                    f"File uploaded via chat: {dest.name}\n"
                    f"Path: {str(dest)}\n"
                    f"Category detected: {category}\n"
                    f"Review and move to the correct folder."
                ),
                now,
                now,
            ),
        )
        conn.commit()

    return {
        "ok":            True,
        "id":            file_id,
        "name":          dest.name,
        "original_name": file.filename,
        "path":          str(dest),
        "rel_path":      rel_path,
        "size":          size,
        "mime_type":     mime,
        "category":      category,
        "uploaded_at":   now,
    }


# ── Drive ─────────────────────────────────────────────────────────────────────

@app.get("/api/drive")
def list_drive_files(
    q:     Optional[str] = None,
    ext:   Optional[str] = None,
    limit: int = Query(150, le=500),
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    clauses, params = [], []
    if q:
        clauses.append("name LIKE ?"); params.append(f"%{q}%")
    if ext:
        clauses.append("extension = ?"); params.append(ext)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM google_drive_files {where} ORDER BY pinned DESC, modified_at DESC LIMIT ?",
            params + [limit],
        ).fetchall()
        total = conn.execute(f"SELECT COUNT(*) FROM google_drive_files {where}", params).fetchone()[0]
    return {"items": [dict(r) for r in rows], "total": total}

@app.patch("/api/drive/{file_id}/pin")
def toggle_drive_pin(file_id: int, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        row = conn.execute("SELECT pinned FROM google_drive_files WHERE id=?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Drive file not found")
        new_val = 0 if row["pinned"] else 1
        if new_val == 1:
            count = conn.execute("SELECT COUNT(*) FROM google_drive_files WHERE pinned=1").fetchone()[0]
            if count >= 8:
                raise HTTPException(400, "Quick Access is full — unpin a file to add another")
        conn.execute("UPDATE google_drive_files SET pinned=? WHERE id=?", (new_val, file_id))
        conn.commit()
    return {"id": file_id, "pinned": bool(new_val)}


# ── Drive File Browser ────────────────────────────────────────────────────────

class DriveFolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    sort_order: Optional[int] = 0

class DriveFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None

class DriveFileMove(BaseModel):
    folder_id: Optional[int] = None


def _build_folder_tree(folders: list[dict], files_by_folder: dict[int, int]) -> list[dict]:
    """Recursively build a nested folder tree from a flat list."""
    by_id = {f["id"]: {**f, "children": []} for f in folders}
    roots = []
    for f in folders:
        f_node = by_id[f["id"]]
        f_node["file_count"] = files_by_folder.get(f["id"], 0)
        if f["parent_id"] is None:
            roots.append(f_node)
        elif f["parent_id"] in by_id:
            by_id[f["parent_id"]]["children"].append(f_node)
    roots.sort(key=lambda x: (x["sort_order"] or 0, x["name"]))
    return roots


@app.get("/api/drive/folders")
def list_drive_folders(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        folders = [row_to_dict(r) for r in conn.execute(
            "SELECT id, name, parent_id, sort_order, created_at, updated_at FROM drive_folders ORDER BY sort_order, name"
        ).fetchall()]
        counts = conn.execute(
            "SELECT folder_id, COUNT(*) as cnt FROM drive_files WHERE folder_id IS NOT NULL GROUP BY folder_id"
        ).fetchall()
    files_by_folder = {r["folder_id"]: r["cnt"] for r in counts}
    return _build_folder_tree(folders, files_by_folder)


@app.get("/api/drive/files")
def list_drive_browser_files(
    folder_id: Optional[int] = None,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    with get_db() as conn:
        if folder_id is not None:
            rows = conn.execute(
                "SELECT * FROM drive_files WHERE folder_id = ? ORDER BY name",
                (folder_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM drive_files WHERE folder_id IS NULL ORDER BY name"
            ).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/api/drive/tree")
def get_drive_tree(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        folders = [row_to_dict(r) for r in conn.execute(
            "SELECT id, name, parent_id, sort_order, created_at, updated_at FROM drive_folders ORDER BY sort_order, name"
        ).fetchall()]
        counts = conn.execute(
            "SELECT folder_id, COUNT(*) as cnt FROM drive_files WHERE folder_id IS NOT NULL GROUP BY folder_id"
        ).fetchall()
        unorganized = [row_to_dict(r) for r in conn.execute(
            "SELECT * FROM drive_files WHERE folder_id IS NULL ORDER BY name"
        ).fetchall()]
    files_by_folder = {r["folder_id"]: r["cnt"] for r in counts}
    return {
        "folders": _build_folder_tree(folders, files_by_folder),
        "unorganized": unorganized,
    }


@app.post("/api/drive/folders", status_code=201)
def create_drive_folder(
    body: DriveFolderCreate,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    ts = now_ts()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO drive_folders (name, parent_id, sort_order, created_at, updated_at) VALUES (?,?,?,?,?)",
            (body.name, body.parent_id, body.sort_order or 0, ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM drive_folders WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {**row_to_dict(row), "children": [], "file_count": 0}


@app.patch("/api/drive/folders/{folder_id}")
def update_drive_folder(
    folder_id: int,
    body: DriveFolderUpdate,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    ts = now_ts()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM drive_folders WHERE id = ?", (folder_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Folder not found")
        # Guard against circular parent references
        if body.parent_id is not None and body.parent_id == folder_id:
            raise HTTPException(400, "A folder cannot be its own parent")
        updates, params = [], []
        if body.name is not None:
            updates.append("name = ?"); params.append(body.name)
        if body.parent_id is not None or "parent_id" in (body.model_fields_set or set()):
            updates.append("parent_id = ?"); params.append(body.parent_id)
        if body.sort_order is not None:
            updates.append("sort_order = ?"); params.append(body.sort_order)
        updates.append("updated_at = ?"); params.append(ts)
        params.append(folder_id)
        conn.execute(f"UPDATE drive_folders SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        row = conn.execute("SELECT * FROM drive_folders WHERE id = ?", (folder_id,)).fetchone()
    return row_to_dict(row)


@app.patch("/api/drive/files/{file_id}")
def move_drive_file(
    file_id: int,
    body: DriveFileMove,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    ts = now_ts()
    with get_db() as conn:
        row = conn.execute("SELECT id FROM drive_files WHERE id = ?", (file_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Drive file not found")
        conn.execute(
            "UPDATE drive_files SET folder_id = ?, updated_at = ? WHERE id = ?",
            (body.folder_id, ts, file_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM drive_files WHERE id = ?", (file_id,)).fetchone()
    return row_to_dict(row)


@app.post("/api/drive/sync")
async def sync_drive_files(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    import threading

    def _do_sync():
        import sqlite3 as _sqlite3
        conn = _sqlite3.connect(DB_PATH)
        conn.row_factory = _sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            from db.integrations.platforms.google import _load_creds, _refresh_if_needed, _now
            creds = _load_creds(conn)
            if not creds:
                return
            creds = _refresh_if_needed(creds, conn)

            from googleapiclient.discovery import build as _build
            from datetime import datetime, timezone, timedelta
            drive = _build("drive", "v3", credentials=creds)
            cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=365)).isoformat()

            page_token = None
            while True:
                result = drive.files().list(
                    q=f"trashed=false and modifiedTime > '{cutoff}'",
                    pageSize=200,
                    fields="nextPageToken, files(id,name,mimeType,size,modifiedTime,webViewLink,thumbnailLink)",
                    pageToken=page_token,
                ).execute()

                for item in result.get("files", []):
                    g_id     = item.get("id")
                    name     = item.get("name", "")
                    mime     = item.get("mimeType", "")
                    size     = item.get("size")
                    modified = item.get("modifiedTime", _now())
                    url      = item.get("webViewLink", "")
                    thumb    = item.get("thumbnailLink", "")

                    conn.execute(
                        """UPDATE drive_files SET
                             name=?, mime_type=?, size_bytes=?, modified_at=?, drive_url=?, thumbnail_url=?, updated_at=?
                           WHERE drive_id=?""",
                        (name, mime, size, modified, url, thumb, _now(), g_id),
                    )
                    conn.execute(
                        """INSERT OR IGNORE INTO drive_files
                           (drive_id, name, mime_type, size_bytes, modified_at, drive_url, thumbnail_url, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (g_id, name, mime, size, modified, url, thumb, _now(), _now()),
                    )

                page_token = result.get("nextPageToken")
                if not page_token:
                    break

            conn.commit()
        except Exception as e:
            print(f"[drive/sync] {e}")
        finally:
            conn.close()

    # Check if Google is connected before spinning up thread
    with get_db() as conn:
        row = conn.execute(
            "SELECT access_token FROM integration_connections WHERE platform = 'google'"
        ).fetchone()
        if not row or not row["access_token"]:
            return {"status": "not_connected"}

    threading.Thread(target=_do_sync, daemon=True).start()
    return {"status": "started"}


# ── Events ────────────────────────────────────────────────────────────────────

@app.get("/api/events")
def list_events(
    event_type: Optional[str] = None,
    upcoming:   bool = False,
    limit:      int = Query(50, le=200),
    offset:     int = 0,
):
    clauses, params = [], []
    if event_type: clauses.append("event_type = ?"); params.append(event_type)
    if upcoming:   clauses.append("start_dt >= ?"); params.append(now_ts()[:10])
    sql = "SELECT * FROM events"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY start_dt LIMIT ? OFFSET ?"
    params += [limit, offset]
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/api/events/{event_id}")
def get_event(event_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Event not found")
    return row_to_dict(row)


@app.post("/api/events", status_code=201)
def create_event(body: EventCreate):
    ts = now_ts()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO events (title, event_type, start_dt, end_dt, location, description, recurring, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (body.title, body.event_type, body.start_dt, body.end_dt, body.location, body.description, body.recurring or "none", ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    valletta_event_id = cur.lastrowid
    # Push to Google Calendar if connected with write scope
    try:
        from db.integrations.google_calendar import (
            create_google_calendar_event,
            update_valletta_event_with_gcal_id,
        )
        gcal_event_data = {
            "title": body.title,
            "start_dt": body.start_dt,
            "end_dt": body.end_dt,
            "location": body.location,
            "description": body.description,
        }
        google_event_id = create_google_calendar_event(gcal_event_data)
        if google_event_id:
            update_valletta_event_with_gcal_id(valletta_event_id, google_event_id)
            print(f"[API] Event {valletta_event_id} synced to Google Calendar: {google_event_id}")
    except RuntimeError as gcal_err:
        print(f"[API] Google Calendar sync skipped: {gcal_err}")
    except Exception as gcal_exc:
        print(f"[API] Google Calendar sync error (non-fatal): {gcal_exc}")
    return row_to_dict(row)


def _update_event_impl(event_id: int, body: EventUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = now_ts()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE events SET {set_clause} WHERE id = ?", [*updates.values(), event_id])
        conn.commit()
        row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Event not found")
    event_dict = row_to_dict(row)
    # Sync update to Google Calendar if the event has a google_event_id
    google_event_id = event_dict.get("google_event_id")
    if google_event_id:
        try:
            from db.integrations.google_calendar import update_google_calendar_event
            gcal_event_data = {
                "title":       event_dict.get("title"),
                "start_dt":    event_dict.get("start_dt"),
                "end_dt":      event_dict.get("end_dt"),
                "location":    event_dict.get("location"),
                "description": event_dict.get("description"),
            }
            update_google_calendar_event(google_event_id, gcal_event_data)
            print(f"[API] Event {event_id} update synced to Google Calendar: {google_event_id}")
        except RuntimeError as gcal_err:
            print(f"[API] Google Calendar update sync skipped: {gcal_err}")
        except Exception as gcal_exc:
            print(f"[API] Google Calendar update sync error (non-fatal): {gcal_exc}")
    return event_dict


@app.patch("/api/events/{event_id}")
def update_event_patch(event_id: int, body: EventUpdate):
    return _update_event_impl(event_id, body)


@app.put("/api/events/{event_id}")
def update_event_put(event_id: int, body: EventUpdate):
    return _update_event_impl(event_id, body)


@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(event_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT google_event_id FROM events WHERE id = ?", (event_id,)).fetchone()
        conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
        conn.commit()
    # Sync deletion to Google Calendar if the event has a google_event_id
    google_event_id = row["google_event_id"] if row else None
    if google_event_id:
        try:
            from db.integrations.google_calendar import delete_google_calendar_event
            delete_google_calendar_event(google_event_id)
            print(f"[API] Event {event_id} deleted from Google Calendar: {google_event_id}")
        except RuntimeError as gcal_err:
            print(f"[API] Google Calendar delete sync skipped: {gcal_err}")
        except Exception as gcal_exc:
            print(f"[API] Google Calendar delete sync error (non-fatal): {gcal_exc}")


# ── Tasks ─────────────────────────────────────────────────────────────────────

@app.get("/api/tasks")
def list_tasks(
    status:    Optional[str] = None,
    priority:  Optional[str] = None,
    assignee:  Optional[str] = None,
    parent_id: Optional[str] = None,   # pass "null" for top-level only
    limit:     int = Query(200, le=500),
    offset:    int = 0,
):
    clauses, params = [], []
    if status:   clauses.append("status = ?");   params.append(status)
    if priority: clauses.append("priority = ?"); params.append(priority)
    if assignee: clauses.append("assignee = ?"); params.append(assignee)
    if parent_id == "null":
        clauses.append("parent_id IS NULL")
    elif parent_id is not None:
        clauses.append("parent_id = ?"); params.append(int(parent_id))
    sql = "SELECT * FROM tasks"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date LIMIT ? OFFSET ?"
    params += [limit, offset]
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
        result = []
        for r in rows:
            d = row_to_dict(r)
            counts = conn.execute(
                "SELECT COUNT(*) as total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done FROM tasks WHERE parent_id = ?",
                (d['id'],)
            ).fetchone()
            d['subtask_count'] = counts['total'] or 0
            d['subtasks_done'] = counts['done'] or 0
            result.append(d)
    return result


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Task not found")
        d = row_to_dict(row)
        subtask_rows = conn.execute("SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at", (task_id,)).fetchall()
        d['subtasks'] = [row_to_dict(s) for s in subtask_rows]
    return d


@app.post("/api/tasks", status_code=201)
def create_task(body: TaskCreate):
    ts = now_ts()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO tasks (title, description, status, priority, due_date, assignee, related_event, parent_id, start_date, roadmap_category, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (body.title, body.description, body.status, body.priority, body.due_date, body.assignee, body.related_event, body.parent_id, body.start_date, body.roadmap_category, ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, body: TaskUpdate):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = now_ts()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    with get_db() as conn:
        conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", [*updates.values(), task_id])
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Task not found")
    return row_to_dict(row)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()


# ── Roadmap ───────────────────────────────────────────────────────────────────

@app.get("/api/roadmap")
def get_roadmap(year: int = 2026):
    year_str = str(year)
    with get_db() as conn:
        task_rows = conn.execute(
            "SELECT * FROM tasks WHERE roadmap_category IS NOT NULL AND parent_id IS NULL AND (start_date LIKE ? OR due_date LIKE ?) ORDER BY start_date, due_date",
            (f"{year_str}-%", f"{year_str}-%")
        ).fetchall()
        event_rows = conn.execute(
            "SELECT * FROM events WHERE event_type = 'show' AND start_dt LIKE ? ORDER BY start_dt",
            (f"{year_str}-%",)
        ).fetchall()
    return {
        "tasks":  [row_to_dict(r) for r in task_rows],
        "events": [row_to_dict(r) for r in event_rows],
    }


# ── Sources ───────────────────────────────────────────────────────────────────

@app.get("/api/sources")
def list_sources(
    source_type: Optional[str] = None,
    used_by:     Optional[str] = None,
):
    clauses, params = [], []
    if source_type: clauses.append("s.source_type = ?"); params.append(source_type)
    if used_by:     clauses.append("s.used_by = ?");     params.append(used_by)
    sql = """
        SELECT s.*,
               MAX(o.contacted_at) as last_contacted,
               COUNT(o.id) as outreach_count
        FROM sources s
        LEFT JOIN outreach o ON o.source_id = s.id
    """
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " GROUP BY s.id ORDER BY s.created_at DESC"
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/api/sources/{source_id}")
def get_source(source_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Source not found")
        d = row_to_dict(row)
        outreach_rows = conn.execute(
            "SELECT * FROM outreach WHERE source_id = ? ORDER BY contacted_at DESC",
            (source_id,)
        ).fetchall()
        d['outreach'] = [row_to_dict(r) for r in outreach_rows]
    return d


@app.post("/api/sources", status_code=201)
def create_source(body: SourceCreate):
    ts = now_ts()
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO sources (title, url, source_type, description, used_by, used_for, accessed_at, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (body.title, body.url, body.source_type, body.description, body.used_by, body.used_for, body.accessed_at or ts[:10], ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


@app.patch("/api/sources/{source_id}")
def update_source(source_id: int, body: SourceUpdate):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Source not found")
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE sources SET {sets} WHERE id = ?", (*fields.values(), source_id))
        conn.commit()
        row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
    return row_to_dict(row)


@app.delete("/api/sources/{source_id}", status_code=204)
def delete_source(source_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        conn.commit()


# ── Contacts ──────────────────────────────────────────────────────────────────

@app.get("/api/contacts")
def get_contacts(category: str = None):
    with get_db() as conn:
        if category:
            rows = conn.execute(
                "SELECT c.*, MAX(o.contacted_at) as last_contacted, COUNT(o.id) as outreach_count FROM contacts c LEFT JOIN outreach o ON o.contact_id = c.id WHERE c.category = ? GROUP BY c.id ORDER BY c.name",
                (category,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT c.*, MAX(o.contacted_at) as last_contacted, COUNT(o.id) as outreach_count FROM contacts c LEFT JOIN outreach o ON o.contact_id = c.id GROUP BY c.id ORDER BY c.name"
            ).fetchall()
    result = []
    for r in rows:
        d = row_to_dict(r)
        d["roles"] = json.loads(d.get("roles") or "[]")
        d["bands"] = json.loads(d.get("bands") or "[]")
        d["social_links"] = json.loads(d.get("social_links") or "{}")
        result.append(d)
    return result

@app.post("/api/contacts", status_code=201)
def create_contact(body: ContactCreate):
    with get_db() as conn:
        # Check for duplicate by name (case-insensitive) — merge role/band instead of inserting
        existing = conn.execute(
            "SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)", (body.name,)
        ).fetchone()
        if existing:
            roles = json.loads(existing["roles"] or "[]")
            new_role = {"band": body.company or "", "role": body.role or ""}
            if new_role not in roles and (new_role["band"] or new_role["role"]):
                roles.append(new_role)
            bands = json.loads(existing["bands"] or "[]")
            new_band = body.company or ""
            if new_band and new_band not in bands:
                bands.append(new_band)
            conn.execute(
                "UPDATE contacts SET roles=?, bands=? WHERE id=?",
                (json.dumps(roles), json.dumps(bands), existing["id"])
            )
            conn.commit()
            row = conn.execute("SELECT * FROM contacts WHERE id = ?", (existing["id"],)).fetchone()
            d = row_to_dict(row)
            d["roles"] = json.loads(d.get("roles") or "[]")
            d["bands"] = json.loads(d.get("bands") or "[]")
            d["social_links"] = json.loads(d.get("social_links") or "{}")
            return d
        cur = conn.execute(
            "INSERT INTO contacts (name, role, company, email, phone, notes, category, social_links) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (body.name, body.role, body.company, body.email, body.phone, body.notes, body.category,
             json.dumps(body.social_links or {}))
        )
        new_id = cur.lastrowid
        # If this is a person created with a company, update the matching business contact's roles
        if body.company and body.category == 'person':
            biz = conn.execute(
                "SELECT id, roles FROM contacts WHERE LOWER(name) = LOWER(?) AND category != 'person'",
                (body.company,)
            ).fetchone()
            if biz:
                biz_roles = json.loads(biz["roles"] or "[]")
                person_entry = {"person_id": new_id, "name": body.name, "role": body.role or ""}
                if person_entry not in biz_roles:
                    biz_roles.append(person_entry)
                conn.execute(
                    "UPDATE contacts SET roles = ? WHERE id = ?",
                    (json.dumps(biz_roles), biz["id"])
                )
        conn.commit()
        row = conn.execute("SELECT * FROM contacts WHERE id = ?", (new_id,)).fetchone()
    d = row_to_dict(row)
    d["roles"] = json.loads(d.get("roles") or "[]")
    d["bands"] = json.loads(d.get("bands") or "[]")
    d["social_links"] = json.loads(d.get("social_links") or "{}")
    return d

@app.get("/api/contacts/{contact_id}")
def get_contact(contact_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Contact not found")
        outreach = conn.execute(
            "SELECT * FROM outreach WHERE contact_id = ? ORDER BY contacted_at DESC",
            (contact_id,)
        ).fetchall()
    result = row_to_dict(row)
    result["roles"] = json.loads(result.get("roles") or "[]")
    result["bands"] = json.loads(result.get("bands") or "[]")
    result["social_links"] = json.loads(result.get("social_links") or "{}")
    result['outreach'] = [row_to_dict(o) for o in outreach]
    return result

@app.patch("/api/contacts/{contact_id}")
def update_contact(contact_id: int, body: ContactUpdate):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    # Serialize social_links dict to JSON string for storage
    if "social_links" in fields:
        fields["social_links"] = json.dumps(fields["social_links"])
    with get_db() as conn:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE contacts SET {sets} WHERE id = ?", (*fields.values(), contact_id))
        conn.commit()
        row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    d = row_to_dict(row)
    d["roles"] = json.loads(d.get("roles") or "[]")
    d["bands"] = json.loads(d.get("bands") or "[]")
    d["social_links"] = json.loads(d.get("social_links") or "{}")
    return d

@app.delete("/api/contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        conn.commit()
    return None


@app.get("/api/contacts/by-company/{company_name}")
def get_contacts_by_company(company_name: str, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM contacts WHERE category='person' AND LOWER(company) = LOWER(?)",
        (company_name,)
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["roles"] = json.loads(d.get("roles") or "[]")
        d["bands"] = json.loads(d.get("bands") or "[]")
        d["social_links"] = json.loads(d.get("social_links") or "{}")
        result.append(d)
    return result


@app.post("/api/contacts/{contact_id}/roles")
def add_contact_role(contact_id: int, body: dict = Body(...), authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        row = conn.execute("SELECT roles, bands FROM contacts WHERE id=?", (contact_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Contact not found")
        roles = json.loads(row["roles"] or "[]")
        bands = json.loads(row["bands"] or "[]")
        new_role = {"band": body.get("band", ""), "role": body.get("role", "")}
        if new_role not in roles:
            roles.append(new_role)
        new_band = body.get("band", "")
        if new_band and new_band not in bands:
            bands.append(new_band)
        conn.execute("UPDATE contacts SET roles=?, bands=? WHERE id=?",
                     (json.dumps(roles), json.dumps(bands), contact_id))
        conn.commit()
    return {"ok": True, "roles": roles, "bands": bands}


@app.delete("/api/contacts/{contact_id}/roles/{role_index}")
def remove_contact_role(contact_id: int, role_index: int, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        row = conn.execute("SELECT roles, bands FROM contacts WHERE id=?", (contact_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Contact not found")
        roles = json.loads(row["roles"] or "[]")
        if 0 <= role_index < len(roles):
            roles.pop(role_index)
        # Rebuild bands from remaining roles
        bands = list({r["band"] for r in roles if r.get("band")})
        conn.execute("UPDATE contacts SET roles=?, bands=? WHERE id=?",
                     (json.dumps(roles), json.dumps(bands), contact_id))
        conn.commit()
    return {"ok": True, "roles": roles}


@app.post("/api/contacts/extract-from-email")
async def extract_contacts_from_email(authorization: Optional[str] = Header(None)):
    """
    Trigger the Gmail contact extraction pipeline.
    Pulls unique senders from integration_messages, classifies via Claude,
    and inserts real contacts/businesses into the DB.
    Idempotent — safe to run multiple times.
    """
    _require_auth(authorization)
    if not client:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured. Add it to your .env file.")

    from db.extract_email_contacts import run_extraction
    try:
        summary = await asyncio.to_thread(run_extraction, DB_PATH)
        return {"ok": True, "summary": summary}
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {e}")


# ── Outreach ──────────────────────────────────────────────────────────────────

@app.get("/api/outreach")
def get_outreach(source_id: int = None, contact_id: int = None):
    with get_db() as conn:
        if source_id:
            rows = conn.execute(
                "SELECT * FROM outreach WHERE source_id = ? ORDER BY contacted_at DESC",
                (source_id,)
            ).fetchall()
        elif contact_id:
            rows = conn.execute(
                "SELECT * FROM outreach WHERE contact_id = ? ORDER BY contacted_at DESC",
                (contact_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM outreach ORDER BY contacted_at DESC").fetchall()
    return [row_to_dict(r) for r in rows]

@app.post("/api/outreach", status_code=201)
def create_outreach(body: OutreachCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO outreach (source_id, contact_id, direction, message, contacted_at, notes) VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')), ?)",
            (body.source_id, body.contact_id, body.direction, body.message, body.contacted_at, body.notes)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM outreach WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)

@app.patch("/api/outreach/{outreach_id}")
def update_outreach(outreach_id: int, body: OutreachUpdate):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    with get_db() as conn:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE outreach SET {sets} WHERE id = ?", (*fields.values(), outreach_id))
        conn.commit()
        row = conn.execute("SELECT * FROM outreach WHERE id = ?", (outreach_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    return row_to_dict(row)

@app.delete("/api/outreach/{outreach_id}", status_code=204)
def delete_outreach(outreach_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM outreach WHERE id = ?", (outreach_id,))
        conn.commit()
    return None


# ── Ideas ─────────────────────────────────────────────────────────────────────

@app.get("/api/ideas")
def get_ideas(status: str = None):
    with get_db() as conn:
        if status:
            rows = conn.execute("SELECT * FROM ideas WHERE status = ? ORDER BY created_at DESC", (status,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM ideas ORDER BY created_at DESC").fetchall()
    return [row_to_dict(r) for r in rows]

@app.post("/api/ideas", status_code=201)
def create_idea(body: IdeaCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO ideas (title, description, category) VALUES (?, ?, ?)",
            (body.title, body.description, body.category)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM ideas WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)

@app.patch("/api/ideas/{idea_id}")
def update_idea(idea_id: int, body: IdeaUpdate):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    with get_db() as conn:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE ideas SET {sets} WHERE id = ?", (*fields.values(), idea_id))
        conn.commit()
        row = conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Idea not found")
    return row_to_dict(row)

@app.delete("/api/ideas/{idea_id}", status_code=204)
def delete_idea(idea_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM ideas WHERE id = ?", (idea_id,))
        conn.commit()
    return None

@app.post("/api/ideas/{idea_id}/promote", status_code=201)
def promote_idea(idea_id: int):
    """Convert an idea to a task. Returns the new task."""
    with get_db() as conn:
        idea = conn.execute("SELECT * FROM ideas WHERE id = ?", (idea_id,)).fetchone()
        if not idea:
            raise HTTPException(404, "Idea not found")
        idea = row_to_dict(idea)
        cur = conn.execute(
            "INSERT INTO tasks (title, description, status, priority) VALUES (?, ?, 'todo', 'medium')",
            (idea['title'], idea['description'])
        )
        task_id = cur.lastrowid
        conn.execute("UPDATE ideas SET task_id = ?, status = 'archived' WHERE id = ?", (task_id, idea_id))
        conn.commit()
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return row_to_dict(task)


@app.post("/api/ideas/detect-from-discord")
async def detect_ideas_from_discord(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    if not client:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")

    with get_db() as conn:
        # Get recent Discord messages not yet processed as ideas
        existing_ids = {
            r[0] for r in conn.execute(
                "SELECT discord_message_id FROM ideas WHERE discord_message_id IS NOT NULL"
            ).fetchall()
        }
        messages = conn.execute(
            """SELECT external_id, channel, sender, body_preview, received_at
               FROM integration_messages
               WHERE platform='discord'
               ORDER BY received_at DESC LIMIT 100"""
        ).fetchall()

        candidates = [m for m in messages if m[0] not in existing_ids]
        if not candidates:
            return {"detected": 0, "message": "No new messages to process"}

        # Batch classify with Claude Haiku
        msg_text = "\n".join(
            f"[{i}] #{m[1]} | {m[2]}: {(m[3] or '')[:200]}"
            for i, m in enumerate(candidates)
        )
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            system="""You identify creative ideas in band Discord messages.
An idea is: a suggestion for a song, sound, lyric, visual concept, show concept, recording idea, or creative direction.
NOT ideas: logistics, scheduling, small talk, questions, reactions.
Return ONLY valid JSON array of objects for messages that contain ideas:
[{"index": 0, "title": "short title", "body": "the idea in 1-2 sentences", "category": "song|marketing|show|visual|other"}]
If no ideas found, return [].
Be selective — only flag genuine creative ideas.""",
            messages=[{"role": "user", "content": f"Classify these Discord messages:\n{msg_text}"}],
        )

        import json as _json
        detected = 0
        try:
            raw = resp.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            ideas = _json.loads(raw.strip())
            now = datetime.now(tz=timezone.utc).isoformat()
            for idea in ideas:
                idx = idea.get("index")
                if idx is None or idx >= len(candidates):
                    continue
                msg = candidates[idx]
                conn.execute(
                    """INSERT OR IGNORE INTO ideas
                       (title, description, category, status, discord_message_id, source_channel, created_at)
                       VALUES (?, ?, ?, 'inbox', ?, ?, ?)""",
                    (idea.get("title", "Untitled"), idea.get("body", ""),
                     idea.get("category", "other"), msg[0], msg[1], now),
                )
                detected += 1
            conn.commit()
        except Exception as e:
            raise HTTPException(500, f"Detection failed: {e}")

    return {"detected": detected}


# ── Setlists ───────────────────────────────────────────────────────────────────

@app.get("/api/setlists")
def get_setlists():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT s.*, COUNT(ss.id) as song_count
            FROM setlists s
            LEFT JOIN setlist_songs ss ON ss.setlist_id = s.id
            GROUP BY s.id ORDER BY s.date DESC, s.created_at DESC
        """).fetchall()
    return [row_to_dict(r) for r in rows]

@app.post("/api/setlists", status_code=201)
def create_setlist(body: SetlistCreate):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO setlists (name, date, venue, notes) VALUES (?, ?, ?, ?)",
            (body.name, body.date, body.venue, body.notes)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM setlists WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)

@app.get("/api/setlists/{setlist_id}")
def get_setlist(setlist_id: int):
    with get_db() as conn:
        sl = conn.execute("SELECT * FROM setlists WHERE id = ?", (setlist_id,)).fetchone()
        if not sl:
            raise HTTPException(404, "Setlist not found")
        songs = conn.execute(
            "SELECT * FROM setlist_songs WHERE setlist_id = ? ORDER BY position",
            (setlist_id,)
        ).fetchall()
    result = row_to_dict(sl)
    result['songs'] = [row_to_dict(s) for s in songs]
    return result

@app.patch("/api/setlists/{setlist_id}")
def update_setlist(setlist_id: int, body: SetlistUpdate):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    with get_db() as conn:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE setlists SET {sets} WHERE id = ?", (*fields.values(), setlist_id))
        conn.commit()
        row = conn.execute("SELECT * FROM setlists WHERE id = ?", (setlist_id,)).fetchone()
    if not row:
        raise HTTPException(404)
    return row_to_dict(row)

@app.delete("/api/setlists/{setlist_id}", status_code=204)
def delete_setlist(setlist_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM setlists WHERE id = ?", (setlist_id,))
        conn.commit()
    return None

@app.put("/api/setlists/{setlist_id}/songs", status_code=200)
def replace_setlist_songs(setlist_id: int, songs: list[SetlistSong]):
    with get_db() as conn:
        conn.execute("DELETE FROM setlist_songs WHERE setlist_id = ?", (setlist_id,))
        for song in songs:
            resolved_title = song.title or song.song_title or ""
            conn.execute(
                "INSERT INTO setlist_songs (setlist_id, song_title, position, notes) VALUES (?, ?, ?, ?)",
                (setlist_id, resolved_title, song.position, song.notes)
            )
        conn.commit()
        rows = conn.execute(
            "SELECT * FROM setlist_songs WHERE setlist_id = ? ORDER BY position",
            (setlist_id,)
        ).fetchall()
    return [row_to_dict(r) for r in rows]


# ── Auth models & endpoints ───────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


def _require_auth(authorization: Optional[str]):
    """Validate a Bearer session token.

    Accepts:
      1. Tokens issued by the old password-login endpoint (still in _ACTIVE_TOKENS).
      2. Tokens issued by the new Google OAuth login and stored in auth_sessions.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.removeprefix("Bearer ").strip()

    # Fast path: legacy in-memory token (password login, local dev)
    if token in _ACTIVE_TOKENS:
        return

    # DB-backed session check
    with get_db() as conn:
        row = conn.execute(
            "SELECT token FROM auth_sessions WHERE token = ? AND expires_at > datetime('now')",
            (token,),
        ).fetchone()
    if not row:
        raise HTTPException(401, "Invalid or expired token")


@app.post("/api/auth/login")
def login(body: LoginRequest):
    """Password-based login — kept for local dev fallback."""
    if body.password != BAND_PASSWORD:
        raise HTTPException(401, "Wrong password")
    token = secrets.token_urlsafe(32)
    _ACTIVE_TOKENS.add(token)
    return {"token": token}


@app.get("/api/auth/verify")
def verify(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    return {"ok": True}


# ── Google OAuth app login ────────────────────────────────────────────────────

@app.get("/api/auth/google/start")
def google_login_start():
    """Generate a Google OAuth URL for per-user app login."""
    import hashlib
    from pathlib import Path as _Path
    from google_auth_oauthlib.flow import Flow as _Flow
    from db.integrations.token_store import create_state, _OAUTH_STATE

    creds_path = _Path(PROJECT_ROOT) / os.getenv(
        "GOOGLE_CREDENTIALS_FILE", "db/integrations/google_credentials.json"
    )
    if not creds_path.exists():
        raise HTTPException(
            400,
            f"Google credentials file not found at {creds_path}. "
            "Download it from Google Cloud Console.",
        )

    # PKCE: generate verifier + challenge
    code_verifier = secrets.token_urlsafe(96)
    code_challenge = (
        __import__("base64")
        .urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )

    state = create_state("app_login")
    # Attach verifier to the state entry so the callback can use it
    _OAUTH_STATE[state]["code_verifier"] = code_verifier

    flow = _Flow.from_client_secrets_file(
        str(creds_path),
        scopes=["openid", "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile"],
        redirect_uri=GOOGLE_LOGIN_REDIRECT_URI,
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        state=state,
        prompt="select_account",
        code_challenge=code_challenge,
        code_challenge_method="S256",
    )
    return {"url": auth_url}


@app.get("/api/auth/google/callback")
def google_login_callback(code: str, state: str):
    """Handle Google OAuth callback for per-user app login."""
    import hashlib
    from pathlib import Path as _Path
    from google_auth_oauthlib.flow import Flow as _Flow
    from fastapi.responses import RedirectResponse as _Redirect
    from db.integrations.token_store import consume_state

    # FRONTEND_URL is defined at module level from env

    entry = consume_state(state)
    if not entry or entry.get("platform") != "app_login":
        return _Redirect(f"{FRONTEND_URL}/?error=login&reason=invalid_state")

    creds_path = _Path(PROJECT_ROOT) / os.getenv(
        "GOOGLE_CREDENTIALS_FILE", "db/integrations/google_credentials.json"
    )

    try:
        flow = _Flow.from_client_secrets_file(
            str(creds_path),
            scopes=["openid", "https://www.googleapis.com/auth/userinfo.email",
                    "https://www.googleapis.com/auth/userinfo.profile"],
            redirect_uri=GOOGLE_LOGIN_REDIRECT_URI,
        )
        os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
        try:
            flow.fetch_token(
                code=code,
                code_verifier=entry.get("code_verifier"),
            )
        finally:
            os.environ.pop("OAUTHLIB_RELAX_TOKEN_SCOPE", None)

        creds = flow.credentials

        # Fetch user info
        import httpx as _httpx
        resp = _httpx.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {creds.token}"},
            timeout=10,
        )
        resp.raise_for_status()
        user_info = resp.json()
        email = user_info.get("email", "").lower().strip()
        name = user_info.get("name")
        picture = user_info.get("picture")

        if not email:
            return _Redirect(f"{FRONTEND_URL}/?error=login&reason=no_email")

        with get_db() as conn:
            # Check if the user exists in the allowed-users table
            user_row = conn.execute(
                "SELECT id FROM users WHERE email = ?", (email,)
            ).fetchone()
            if not user_row:
                return _Redirect(
                    f"{FRONTEND_URL}/?error=login&reason=not_authorized"
                )

            user_id = user_row["id"]

            # Update last_login_at and profile fields
            conn.execute(
                """UPDATE users SET last_login_at = datetime('now'),
                   name = COALESCE(?, name),
                   picture_url = COALESCE(?, picture_url)
                   WHERE id = ?""",
                (name, picture, user_id),
            )

            # Create a new session (30-day expiry)
            session_token = secrets.token_urlsafe(32)
            conn.execute(
                """INSERT INTO auth_sessions (token, user_id, email, expires_at)
                   VALUES (?, ?, ?, datetime('now', '+30 days'))""",
                (session_token, user_id, email),
            )
            conn.commit()

        return _Redirect(f"{FRONTEND_URL}/?token={session_token}")

    except Exception as e:
        return _Redirect(f"{FRONTEND_URL}/?error=login&reason={str(e)[:100]}")


# ── Chat endpoint ─────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str

class ChatRequest(BaseModel):
    member: str
    message: str
    history: list[ChatMessage] = []

class RouteRequest(BaseModel):
    message: str

_ROUTABLE_MEMBERS = ["felix", "nina", "cass", "marco", "priya", "eli", "quinn", "scout", "finn", "iris"]


def _resolve_route(message: str) -> list[tuple[str, str, str]]:
    """Returns list of (member, scoped_question, handoff_note) for all relevant specialists."""
    if not client:
        return [("felix", message, "")]
    members_desc = """
- felix: band manager — strategy, opportunities, contracts, general band business, calendar
- nina: publicist — press, media, press kit, journalists
- cass: social media — content, platforms, captions, short-form video
- marco: booking agent — venues, shows, festivals, tour routing
- priya: marketing — paid campaigns, Spotify, playlists, email marketing
- eli: sync & licensing — placements, music supervisors, royalties
- quinn: legal — contracts, LLC, royalties, music law
- scout: creative intelligence, idea capture, Discord monitoring, identifying themes and creative opportunities
- finn: finance specialist, show/tour P&L, merch margins, royalties, deal evaluation, budget planning, anything involving money or financial advice
"""
    resp = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=f"""You route questions to the right team members. Available members:{members_desc}
Identify ALL relevant members for the question (max 3). For each, write a focused sub-question scoped to their expertise.
For the 2nd and 3rd members, also write a short handoff_note (max 80 chars) explaining why this specialist is being brought in.
Respond ONLY with valid JSON array: [{{"member": "name", "question": "focused question", "handoff_note": "short reason"}}]
If only one member is relevant, return a single-item array. First member's handoff_note should be empty string.""",
        messages=[{"role": "user", "content": message}],
    )
    import json as _json
    try:
        raw = resp.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        routes = _json.loads(raw.strip())
        result = []
        for r in routes[:3]:
            m = r.get("member", "").lower().strip()
            q = r.get("question", message)
            note = r.get("handoff_note", "")
            if m in _ROUTABLE_MEMBERS:
                result.append((m, q, note))
        return result if result else [("felix", message, "")]
    except Exception:
        return [("felix", message, "")]


@app.post("/api/chat/route")
async def chat_route(body: RouteRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    if not client:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured. Add it to your .env file.")
    routes = await asyncio.to_thread(_resolve_route, body.message)
    # Return the first member for backwards compatibility
    member = routes[0][0] if routes else "felix"
    return {"member": member}


@app.post("/api/chat")
async def chat(body: ChatRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)

    if not client:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured. Add it to your .env file.")

    member_key = body.member.lower()

    # Validate member (dot is allowed)
    if member_key not in TEAM_PERSONAS:
        raise HTTPException(400, f"Unknown team member: {body.member}")

    async def _stream_member_response(effective_member: str, scoped_question: str, messages: list, prior_context: str = ""):
        """Yields SSE chunks for a single member's response. Used by both single and multi-member flows.
        Emits a final _member_text sentinel for context passing. Does NOT emit [DONE]."""
        persona = TEAM_PERSONAS.get(effective_member) or TEAM_PERSONAS["felix"]

        with get_db() as conn:
            integration_ctx = build_integration_context(effective_member, conn, scoped_question)
        system_prompt = persona + ("\n\n" + integration_ctx if integration_ctx else "")
        if prior_context:
            system_prompt += prior_context

        member_messages = list(messages) + [{"role": "user", "content": scoped_question}]

        # ── Step 1: streaming call with tools ─────────────────────────────────
        full_text = ""

        async with async_client.messages.stream(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=system_prompt,
            tools=CHAT_TOOLS,
            messages=member_messages,
        ) as stream:
            async for event in stream:
                if event.type == "content_block_delta":
                    if hasattr(event.delta, "text"):
                        chunk = event.delta.text
                        full_text += chunk
                        yield f"data: {json.dumps({'text': chunk})}\n\n"

            final = await stream.get_final_message()

        # ── Step 2: handle tool use ───────────────────────────────────────────
        if final.stop_reason == "tool_use":
            tool_results = []
            for block in final.content:
                if block.type == "tool_use":
                    # Send a heartbeat so the frontend inactivity timer doesn't
                    # fire during the DB call + follow-up API startup gap.
                    yield f"data: {json.dumps({'ping': True, 'tool': block.name})}\n\n"
                    # Run the synchronous DB call in a thread so it doesn't block
                    # the event loop and deadlock the open streaming response.
                    result = await asyncio.to_thread(_execute_tool, block.name, block.input)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })
                    if block.name == "create_task" and result.get("success"):
                        yield f"data: {json.dumps({'task_created': result['task']})}\n\n"
                    if block.name == "create_idea" and result.get("ok"):
                        idea_event = {**result, "title": block.input.get("title", "")}
                        yield f"data: {json.dumps({'idea_created': idea_event})}\n\n"
                    elif block.name in ("create_event", "create_roadmap_item", "create_contact") and result.get("ok"):
                        yield f"data: {json.dumps({'tool_result': {'name': block.name, 'result': result}})}\n\n"

            # Serialize assistant content blocks to clean dicts the API accepts.
            # model_dump() includes extra SDK-internal fields (e.g. "caller", "citations")
            # that the Anthropic API rejects, causing the follow-up call to fail.
            def _serialize_content_block(b) -> dict:
                if hasattr(b, "type"):
                    if b.type == "tool_use":
                        return {"type": "tool_use", "id": b.id, "name": b.name, "input": b.input}
                    if b.type == "text":
                        return {"type": "text", "text": b.text}
                # Fallback: pass through as-is (already a dict or unknown type)
                return b if isinstance(b, dict) else vars(b)

            # Follow-up streaming call with tool results
            followup_messages = member_messages + [
                {"role": "assistant", "content": [_serialize_content_block(b) for b in final.content]},
                {"role": "user", "content": tool_results},
            ]
            async with async_client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=1024,
                system=system_prompt,
                tools=CHAT_TOOLS,
                messages=followup_messages,
            ) as followup_stream:
                async for event in followup_stream:
                    if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                        chunk = event.delta.text
                        full_text += chunk
                        yield f"data: {json.dumps({'text': chunk})}\n\n"

        # Sentinel: full text for context passing — not shown to the user
        yield f"data: {json.dumps({'_member_text': full_text})}\n\n"
        # NOTE: do NOT yield [DONE] here — only the outer stream_response does that

    async def stream_response():
        base_messages = [{"role": m.role, "content": m.content} for m in body.history]
        # Note: member_messages inside _stream_member_response appends the user turn itself

        try:
            # ── Dot multi-member routing ───────────────────────────────────────────
            if member_key == "dot":
                routes = await asyncio.to_thread(_resolve_route, body.message)

                prior_responses = []  # list of (member_name, full_response_text)

                for i, (effective_member, scoped_question, handoff_note) in enumerate(routes):
                    # Build prior context string for all members after the first
                    prior_ctx = ""
                    if prior_responses:
                        lines = "\n".join(f"[{m.title()}]: {t}" for m, t in prior_responses)
                        prior_ctx = (
                            f"\n\n--- Context from other team members ---\n"
                            f"{lines}\n"
                            f"--- Use this information freely. Never say you lack access to information already provided above. ---"
                        )

                    if i > 0 and prior_responses:
                        from_member = prior_responses[-1][0]
                        yield f"data: {json.dumps({'handoff': {'from': from_member, 'to': effective_member, 'note': handoff_note}})}\n\n"

                    yield f"data: {json.dumps({'routing_to': effective_member, 'scoped_question': scoped_question})}\n\n"

                    full_text = ""
                    async for chunk in _stream_member_response(effective_member, scoped_question, base_messages, prior_context=prior_ctx):
                        if '"_member_text"' in chunk:
                            # Capture full text sentinel, don't forward to client
                            try:
                                full_text = json.loads(chunk.removeprefix("data: ").strip()).get("_member_text", "")
                            except Exception:
                                pass
                        else:
                            yield chunk

                    prior_responses.append((effective_member, full_text))
                    yield f"data: {json.dumps({'member_done': effective_member})}\n\n"

                return

            # ── Single member (non-dot) path ───────────────────────────────────────
            async for chunk in _stream_member_response(member_key, body.message, base_messages):
                if '"_member_text"' not in chunk:
                    yield chunk

        except Exception as exc:
            # Surface the error to the client before closing the stream
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
        finally:
            # Always close the SSE stream so the frontend stops loading
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")


# ── Scheduler ─────────────────────────────────────────────────────────────────

def _detect_ideas_from_discord_sync():
    """Synchronous wrapper for Discord idea detection — reuses the endpoint logic."""
    if not client:
        return
    import json as _json
    with get_db() as conn:
        existing_ids = {
            r[0] for r in conn.execute(
                "SELECT discord_message_id FROM ideas WHERE discord_message_id IS NOT NULL"
            ).fetchall()
        }
        messages = conn.execute(
            """SELECT external_id, channel, sender, body_preview, received_at
               FROM integration_messages
               WHERE platform='discord'
               ORDER BY received_at DESC LIMIT 100"""
        ).fetchall()

        candidates = [m for m in messages if m[0] not in existing_ids]
        if not candidates:
            return

        msg_text = "\n".join(
            f"[{i}] #{m[1]} | {m[2]}: {(m[3] or '')[:200]}"
            for i, m in enumerate(candidates)
        )
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1000,
            system="""You identify creative ideas in band Discord messages.
An idea is: a suggestion for a song, sound, lyric, visual concept, show concept, recording idea, or creative direction.
NOT ideas: logistics, scheduling, small talk, questions, reactions.
Return ONLY valid JSON array of objects for messages that contain ideas:
[{"index": 0, "title": "short title", "body": "the idea in 1-2 sentences", "category": "song|marketing|show|visual|other"}]
If no ideas found, return [].
Be selective — only flag genuine creative ideas.""",
            messages=[{"role": "user", "content": f"Classify these Discord messages:\n{msg_text}"}],
        )

        try:
            raw = resp.content[0].text.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            ideas = _json.loads(raw.strip())
            now = datetime.now(tz=timezone.utc).isoformat()
            for idea in ideas:
                idx = idea.get("index")
                if idx is None or idx >= len(candidates):
                    continue
                msg = candidates[idx]
                conn.execute(
                    """INSERT OR IGNORE INTO ideas
                       (title, description, category, status, discord_message_id, source_channel, created_at)
                       VALUES (?, ?, ?, 'inbox', ?, ?, ?)""",
                    (idea.get("title", "Untitled"), idea.get("body", ""),
                     idea.get("category", "other"), msg[0], msg[1], now),
                )
            conn.commit()
        except Exception as e:
            print(f"[scheduler] idea detection error: {e}")


async def _run_scheduler_cycle():
    global _sync_in_progress, _last_discord_scan
    if _sync_in_progress:
        return
    _sync_in_progress = True
    try:
        from db.integrations.sync import sync_all
        with get_db() as conn:
            await sync_all(conn)

        now = time.time()
        if now - _last_discord_scan >= _SCAN_MIN_INTERVAL_SECS:
            _last_discord_scan = now
            await asyncio.get_event_loop().run_in_executor(None, _detect_ideas_from_discord_sync)
    except Exception as e:
        print(f"[scheduler] error: {e}")
    finally:
        _sync_in_progress = False


async def _scheduler_background_loop():
    while True:
        await asyncio.sleep(_SYNC_INTERVAL_SECS)
        await _run_scheduler_cycle()


# ── Finance endpoints ─────────────────────────────────────────────────────────

@app.get("/api/finance/years")
def get_finance_years(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT year FROM finance_entries WHERE year IS NOT NULL ORDER BY year DESC"
        ).fetchall()
    return [r[0] for r in rows]


@app.get("/api/finance")
def get_finance(year: int = 2025, authorization: Optional[str] = Header(None)):
    import re
    from collections import defaultdict
    _require_auth(authorization)

    with get_db() as conn:
        cur = conn.execute("SELECT * FROM finance_entries WHERE year=?", (year,))
        cols = [d[0] for d in cur.description]
        entries = [dict(zip(cols, r)) for r in cur.fetchall()]
        sheet_row = conn.execute(
            "SELECT last_synced_at FROM finance_sheets WHERE year=? LIMIT 1", (year,)
        ).fetchone()

    if not entries:
        return {
            "year": year, "summary": None, "income_by_category": [],
            "expenses_by_category": [], "monthly": [], "shows": [],
            "budget_vs_actuals": [], "raw_tabs": [], "synced_at": None
        }

    # ── Classify entries that came in as 'other' based on sheet tab ──────────
    INCOME_TABS  = {'master'}           # Master tab = income/revenue by default
    EXPENSE_TABS = {'tour', 'merch', 'music video', 'brett music video',
                    'marco music video', 'old merch', 'october merch'}

    def _classify(entry):
        et = entry.get('entry_type') or 'other'
        if et != 'other':
            return et
        tab = (entry.get('sheet_tab') or '').lower()
        if tab in INCOME_TABS:
            return 'income'
        for kw in EXPENSE_TABS:
            if kw in tab:
                return 'expense'
        # Fallback: positive amounts → income, negative → expense
        amt = entry.get('amount') or 0
        return 'income' if amt >= 0 else 'expense'

    def _parse_month(date_str):
        """Return 1-12 or None. Handles ISO (2025-08-13), M/D/YYYY, M/D/YY."""
        if not date_str:
            return None
        s = str(date_str).strip()
        iso = re.match(r'\d{4}-(\d{2})-\d{2}', s)
        if iso:
            return int(iso.group(1))
        mdy_full = re.match(r'(\d{1,2})/\d{1,2}/(\d{4})', s)
        if mdy_full:
            return int(mdy_full.group(1))
        mdy_short = re.match(r'(\d{1,2})/\d{1,2}/(\d{2})$', s)
        if mdy_short:
            return int(mdy_short.group(1))
        return None

    # Classify all entries
    for e in entries:
        e['_type'] = _classify(e)

    income_entries  = [e for e in entries if e['_type'] == 'income']
    expense_entries = [e for e in entries if e['_type'] == 'expense']
    show_entries    = [e for e in entries if e['_type'] == 'show']
    budget_entries  = [e for e in entries if e['_type'] == 'budget']

    total_income   = sum(e['amount'] or 0 for e in income_entries)
    total_expenses = sum(e['amount'] or 0 for e in expense_entries)

    # Income by category (use sheet_tab as fallback category name)
    inc_cat = defaultdict(float)
    for e in income_entries:
        label = e['category'] or e['sheet_tab'] or 'Other'
        inc_cat[label] += e['amount'] or 0
    income_by_category = [{"category": k, "amount": round(v, 2)} for k, v in sorted(inc_cat.items(), key=lambda x: -x[1])]

    # Expense by category (use sheet_tab as fallback)
    exp_cat = defaultdict(float)
    for e in expense_entries:
        label = e['category'] or e['sheet_tab'] or 'Other'
        exp_cat[label] += e['amount'] or 0
    expenses_by_category = [{"category": k, "amount": round(v, 2)} for k, v in sorted(exp_cat.items(), key=lambda x: -x[1])]

    # Monthly breakdown
    monthly_inc = defaultdict(float)
    monthly_exp = defaultdict(float)
    for e in income_entries:
        m = _parse_month(e.get('entry_date'))
        if m:
            monthly_inc[m] += e['amount'] or 0
    for e in expense_entries:
        m = _parse_month(e.get('entry_date'))
        if m:
            monthly_exp[m] += e['amount'] or 0
    monthly = [{"month": m, "income": round(monthly_inc.get(m, 0), 2), "expenses": round(monthly_exp.get(m, 0), 2)} for m in range(1, 13)]

    # Shows
    show_map = defaultdict(lambda: {"income": 0, "expenses": 0, "date": None})
    for e in show_entries:
        key = e['show_name'] or e['description'] or 'Unknown Show'
        if e['amount'] and e['amount'] > 0:
            show_map[key]['income'] += e['amount'] or 0
        else:
            show_map[key]['expenses'] += abs(e['amount'] or 0)
        if e['entry_date'] and not show_map[key]['date']:
            show_map[key]['date'] = e['entry_date']
    shows = [{"show_name": k, "income": round(v['income'], 2), "expenses": round(v['expenses'], 2), "net": round(v['income'] - v['expenses'], 2), "date": v['date']} for k, v in show_map.items()]

    # Budget vs actuals
    budget_map = {}
    for e in budget_entries:
        cat = e['category'] or e['description'] or 'Other'
        budget_map[cat] = {"budget": e.get('budget_amount') or e['amount'] or 0, "actual": 0}
    for e in expense_entries:
        cat = e['category'] or e['sheet_tab'] or 'Other'
        if cat in budget_map:
            budget_map[cat]['actual'] += e['amount'] or 0
    budget_vs_actuals = [{"category": k, "budget": round(v['budget'], 2), "actual": round(v['actual'], 2)} for k, v in budget_map.items()]

    raw_tabs = list(set(e['sheet_tab'] for e in entries if e['sheet_tab']))

    # Raw entries for the fallback table (exclude internal _type key)
    raw_entries = [
        {
            "id": e['id'],
            "sheet_tab": e['sheet_tab'],
            "category": e['category'],
            "description": e['description'],
            "amount": e['amount'],
            "entry_date": e['entry_date'],
            "entry_type": e['_type'],
        }
        for e in entries if e['amount'] is not None
    ]

    return {
        "year": year,
        "summary": {
            "income":   round(total_income, 2),
            "expenses": round(total_expenses, 2),
            "net":      round(total_income - total_expenses, 2)
        },
        "income_categories":   income_by_category,
        "expense_categories":  expenses_by_category,
        "monthly": monthly,
        "shows": shows,
        "budget_vs_actuals": budget_vs_actuals,
        "raw_tabs": raw_tabs,
        "raw_entries": raw_entries,
        "synced_at": sheet_row[0] if sheet_row else None
    }


def _finance_sync_sync():
    from db.integrations.platforms.google import sync_finance_sheets, _load_creds, _refresh_if_needed
    with get_db() as conn:
        creds = _load_creds(conn)
        if not creds:
            return {"error": "Google not connected"}
        creds = _refresh_if_needed(creds, conn)
        return sync_finance_sheets(conn, creds)


@app.post("/api/finance/sync")
async def trigger_finance_sync(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    result = await asyncio.to_thread(_finance_sync_sync)
    return result


# ── Discord bot status ────────────────────────────────────────────────────────

_DISCORD_BOT_PID_FILE = PROJECT_ROOT / "db" / "discord_bot.pid"


@app.get("/api/discord-bot/status")
async def discord_bot_status(authorization: Optional[str] = Header(None)):
    """Report whether the Felix Discord bot process is currently running."""
    _require_auth(authorization)

    if not _DISCORD_BOT_PID_FILE.exists():
        return {"running": False, "pid": None, "detail": "PID file not found"}

    try:
        pid = int(_DISCORD_BOT_PID_FILE.read_text().strip())
    except (ValueError, OSError):
        return {"running": False, "pid": None, "detail": "PID file unreadable"}

    # Check if the process is alive (sending signal 0 does not kill it)
    try:
        os.kill(pid, 0)
        return {"running": True, "pid": pid, "detail": f"Process {pid} is alive"}
    except ProcessLookupError:
        return {"running": False, "pid": pid, "detail": f"Process {pid} not found"}
    except PermissionError:
        # Process exists but is owned by another user — still running
        return {"running": True, "pid": pid, "detail": f"Process {pid} exists (permission check only)"}


# ── Analytics / Insights ──────────────────────────────────────────────────────

@app.get("/api/insights")
async def get_insights(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    conn = _get_conn()
    # Get latest value per platform+metric_key
    rows = conn.execute("""
        SELECT platform, metric_key, metric_value, metric_text, recorded_at
        FROM analytics_metrics am
        WHERE recorded_at = (
            SELECT MAX(recorded_at) FROM analytics_metrics
            WHERE platform = am.platform AND metric_key = am.metric_key
        )
        ORDER BY platform, metric_key
    """).fetchall()
    connections = conn.execute(
        "SELECT platform, artist_name, artist_id, last_synced_at FROM analytics_connections"
    ).fetchall()

    result = {"platforms": {}, "connections": []}
    for row in rows:
        p = row[0]
        if p not in result["platforms"]:
            result["platforms"][p] = {}
        result["platforms"][p][row[1]] = row[2] if row[2] is not None else row[3]
    for c in connections:
        result["connections"].append({
            "platform": c[0], "artist_name": c[1],
            "artist_id": c[2], "last_synced_at": c[3]
        })
    return result


@app.post("/api/insights/connect")
async def connect_analytics(
    body: dict = Body(...),
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    platform = body.get("platform")
    if platform not in ("spotify", "lastfm", "youtube"):
        raise HTTPException(400, "Invalid platform")
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        INSERT INTO analytics_connections(platform, artist_name, artist_id, api_key, client_id, client_secret, connected_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(platform) DO UPDATE SET
          artist_name=excluded.artist_name,
          artist_id=excluded.artist_id,
          api_key=excluded.api_key,
          client_id=excluded.client_id,
          client_secret=excluded.client_secret,
          connected_at=excluded.connected_at
    """, (
        platform,
        body.get("artist_name"),
        body.get("artist_id"),
        body.get("api_key"),
        body.get("client_id"),
        body.get("client_secret"),
        now,
    ))
    conn.commit()
    return {"ok": True}


@app.post("/api/insights/sync")
async def sync_insights(authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    import threading
    def _sync():
        from db.integrations.platforms.spotify import sync_spotify
        from db.integrations.platforms.lastfm import sync_lastfm
        from db.integrations.platforms.youtube_music import sync_youtube
        conn = _get_conn()
        for fn in [sync_spotify, sync_lastfm, sync_youtube]:
            try:
                fn(conn)
            except Exception as e:
                print(f"[insights sync] {e}")
    threading.Thread(target=_sync, daemon=True).start()
    return {"ok": True, "message": "Sync started"}


@app.delete("/api/insights/connect/{platform}")
async def disconnect_analytics(
    platform: str,
    authorization: Optional[str] = Header(None),
):
    _require_auth(authorization)
    conn = _get_conn()
    conn.execute("DELETE FROM analytics_connections WHERE platform=?", (platform,))
    conn.commit()
    return {"ok": True}


# ── Dev entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("db.api:app", host="0.0.0.0", port=8000, reload=True)
