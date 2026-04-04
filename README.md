# Valletta Command Center

A custom-built band management platform for **Valletta** — a real, working rock band. This is not a template. It is a purpose-built command center that replaced a collection of scattered Google Docs, spreadsheets, group chats, and sticky notes with a single integrated system the whole band actually uses.

---

## What It Is

A full-stack web application that gives Valletta a single place to manage everything: shows, finances, contacts, tasks, creative ideas, press, inventory, and team coordination. The backend syncs live data from Google Calendar, Google Sheets, Google Drive, Square, Spotify, Last.fm, YouTube, Instagram, TikTok, and Discord. The frontend is a fast, local-first React app.

The wildcard: the entire "team" — band manager, publicist, booking agent, social strategist, legal advisor, finance specialist, and more — is powered by named AI personas with distinct personalities, domain knowledge, and direct write access to the database. You can chat with Felix (the band manager) in the app, and the same Felix lives in your Discord server, handling mentions in real time.

---

## Features

### Dashboard
Real-time summary of open tasks, upcoming events, high-priority items, and file counts. The band's current state at a glance.

### Calendar
Full calendar view with event creation, editing, and deletion. Events sync bidirectionally with **Google Calendar** — create an event in the app, it appears in GCal. Recurring events supported. Event types: show, rehearsal, recording, press, deadline, meeting.

### Shows
Dedicated show tracker synced from a **Google Sheets** tour spreadsheet. Tracks venue, city, state, status (Confirmed/Hold/Pending/Cancelled), capacity, guarantee, promoter, and contact per show. One-click re-sync pulls the latest from the source sheet.

### Inventory
Merch and product inventory synced from **Square**. Tracks catalog items, stock levels, and orders. Products are grouped by category (T-Shirts, Tops, Hats, CDs, Vinyl, Tapes, Accessories) with color-coded stock badges. Includes a Bandcamp order importer — paste a CSV export and orders land in the same view alongside Square data.

### Contacts
A full CRM for the band's industry network: venues, promoters, press contacts, booking agents, musicians, collaborators. Supports categorization, social links, city/state, outreach status, and a full outreach log. AI-assisted contact extraction — paste an email, the system extracts structured contact data automatically.

### Tasks
Full task management with status, priority, due date, assignee, parent/subtask relationships, and file attachments. Tasks support comments with @mention tagging. Separate roadmap view renders tasks as a timeline by category (release, PR, recording, writing).

### Ideas
A lightweight idea inbox for capturing creative and strategic ideas. Ideas can be manually created, auto-detected from Discord messages (Scout scans channels), and promoted to tasks. ICE scoring (Impact × Confidence × Effort) via Tara determines what gets prioritized.

### Files & Drive
Local file browser indexed by category and extension with pinned Quick Access slots. A separate Google Drive browser maps Drive files into a custom folder hierarchy managed by Milo. Files can be attached to tasks and events.

### Finance
Synced from **Google Sheets** finance/budget spreadsheets. Tracks income, expenses, show P&L, and category totals by year. Multiple sheet tabs are parsed and stored. Finn (AI finance specialist) has live access to this data in chat.

### Press & Media
A press archive that saves full article content, metadata (title, author, publication, date, summary, image), and the original URL. Nina (AI publicist) can save articles directly from chat by URL — paste a link and she scrapes and stores it automatically.

### Insights / Analytics
Streaming metrics from **Spotify** (followers, monthly listeners), **Last.fm** (play counts), and **YouTube** (subscribers, views). Historical snapshots stored for trend analysis.

### Setlists
Build and manage setlists tied to specific shows. Attach notes per song, link setlists to calendar events.

### Team Chat (AI Team)
The centrepiece of the system. A multi-persona AI chat interface backed by **Anthropic Claude**. Each team member is a named persona with a deep system prompt defining their personality, domain knowledge, and capabilities. Chat responses stream via **SSE** (Server-Sent Events). Every persona has live access to the band's data — calendar, tasks, contacts, shows, inventory, finance — injected as context at inference time.

**The team:**

| Persona | Role |
|---------|------|
| Felix | Band manager — strategy, deals, calendar, general band business |
| Nina | Publicist — press releases, media pitching, press kit |
| Cass | Social media strategist — content calendar, platform strategy |
| Marco | Booking agent — venues, shows, tour routing, deal evaluation |
| Priya | Marketing specialist — paid campaigns, Spotify pitching, playlist outreach |
| Eli | Sync & licensing agent — music supervisor pitching, PRO royalties |
| Quinn | Music industry legal advisor — contracts, management agreements, royalties |
| Finn | Finance specialist — show P&L, merch margins, deal evaluation |
| Tara | Task master & project reviewer — ICE scoring, priority management |
| Iris | Contact data steward — deduplication, enrichment, outreach coverage |
| Scout | Creative intelligence — idea capture, Discord pattern analysis |
| Dot | Orchestrator — routes questions to the right team member |

Personas with tool access can **create tasks, calendar events, contacts, and ideas directly from chat**. Felix creates an event, it immediately syncs to Google Calendar. The chat is not a chatbot overlay — it's a write-capable interface to the entire system.

### Felix Discord Bot
Felix lives in the band's Discord server. Mention `@Felix` in any channel and he responds with his full persona and live band context. He silently consults other specialists before responding — a lightweight routing call decides which team members (Quinn for legal, Marco for booking, Finn for finance, etc.) should weigh in, then Felix synthesizes their input into a single response.

Felix handles file attachments: images via vision, PDFs extracted and summarized, spreadsheets read and analyzed. He auto-detects press article URLs and saves them to the media archive.

### Integrations Hub
OAuth flows for Google (Calendar, Drive, Gmail, Sheets), Discord, Instagram, and TikTok. API key connections for Square, Spotify, Last.fm, and YouTube. Full token storage and refresh handling. Background sync across all connected platforms.

### Scheduled AI Agents
Three background agents run on schedule:

- **Tara** — Hourly task review. Scans open tasks, evaluates priority using ICE scoring, surfaces what needs attention.
- **Iris** — Daily contact audit. Checks for duplicates, missing fields, stale outreach status.
- **Milo** — Monthly file organization pass. Indexes and categorizes project assets.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12+, FastAPI, Uvicorn |
| Database | SQLite (single file, local-first) |
| Frontend | React 18, Vite, inline styles |
| AI | Anthropic Claude API (Sonnet for chat, Haiku for routing) |
| Discord | discord.py |
| Google | Calendar API, Drive API, Sheets API (OAuth 2.0) |
| Commerce | Square API (catalog, inventory, orders) |
| Analytics | Spotify Web API, Last.fm API, YouTube Data API |
| Streaming | Server-Sent Events (SSE) for real-time AI chat |
| Deployment | nginx, systemd (Linux) / launchd (macOS) |

---

## Architecture

The system is **local-first by design**: a single SQLite file is the source of truth, with external platforms treated as sync targets rather than primary stores.

```
Browser (React/Vite)
    │
    ├── SSE stream → /api/chat (FastAPI)
    │       └── Claude API (Sonnet) with tool use
    │               └── SQLite write-back (tasks, events, contacts, ideas)
    │
    ├── REST → /api/* (FastAPI)
    │
    └── Background scheduler (hourly)
            ├── Integration sync (Google, Square, Instagram, TikTok)
            ├── Analytics sync (Spotify, Last.fm, YouTube)
            └── AI agent runs (Tara, Iris, Milo)

Discord (discord.py bot)
    └── @Felix mention
            ├── Claude Haiku: consultation routing
            ├── Specialist consultations (parallel)
            └── Claude Sonnet: Felix synthesized response
                    └── Tool use → SQLite + Google Calendar sync
```

**SSE streaming:** Chat responses stream token-by-token from Claude to the browser. Multi-member conversations chain responses, passing context forward between personas.

**Context injection:** Every AI call is augmented with live database context — upcoming events, open tasks, recent contacts, shows, inventory, finance summaries — scoped to what each persona actually needs. A shared `band_context` table lets any team member save facts that persist across all future conversations.

**Tool use:** Personas use Claude's tool use feature to write back to the database mid-conversation. The API handles tool execution server-side and continues the stream transparently.

---

## The AI Team — The Unique Part

Most bands use a chatbot to answer generic questions. This gives the band a **persistent, opinionated team** where each member has a distinct voice, domain expertise, and the ability to take action.

Felix doesn't just give advice — he creates the calendar event. Tara doesn't just suggest priorities — she writes the updated priority to the database. Nina doesn't just say "save this article" — she scrapes it and stores the full text. The personas have agency.

The same personas are available in two surfaces: the **in-app Team Chat** and the **Discord bot**. When a topic spans multiple domains, the system routes automatically. Ask about a contract for a show? Felix consults Quinn (legal) and Marco (booking) simultaneously, then synthesizes.

---

## Screenshots

_Coming soon._

---

## Environment Variables

This is a **private band tool** built specifically for Valletta. The codebase is shared for reference and to demonstrate the architecture.

Required `.env` variables:

```env
# Core
ANTHROPIC_API_KEY=        # Claude API (required — powers all AI features)
BAND_PASSWORD=            # Simple shared password auth

# Google OAuth (Calendar, Drive, Sheets)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_LOGIN_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173

# Square (inventory)
SQUARE_APP_ID=
SQUARE_APP_SECRET=
SQUARE_REDIRECT_URI=
SQUARE_ENV=production     # or sandbox

# Spotify
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Last.fm
LASTFM_API_KEY=

# YouTube Data API
YOUTUBE_API_KEY=
```

The Discord bot token is stored in the SQLite database via the Integrations settings page, not in the env file.

---

## Running Locally

```bash
# Install Python dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd app && npm install && cd ..

# Start everything
./start.sh
```

Starts the FastAPI backend on `:8000` and the Vite dev server on `:5173`.

- UI: `http://localhost:5173`
- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

---

_Built by and for Valletta._
