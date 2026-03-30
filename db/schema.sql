-- Valletta Project Database Schema
-- Maintained by Rex

-- ─────────────────────────────────────────
-- FILES
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT    NOT NULL,
    filepath      TEXT    NOT NULL UNIQUE,  -- relative to project root
    extension     TEXT,
    category      TEXT,   -- Music, Videos, Photos, Assets, PR, Audio Clips, Social Media
    subcategory   TEXT,   -- Masters, Bounces, Music Videos, etc.
    size_bytes    INTEGER,
    created_at    TEXT,   -- ISO 8601
    modified_at   TEXT,   -- ISO 8601
    indexed_at    TEXT    NOT NULL,
    notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_files_category   ON files(category);
CREATE INDEX IF NOT EXISTS idx_files_extension  ON files(extension);
CREATE INDEX IF NOT EXISTS idx_files_filepath   ON files(filepath);

-- ─────────────────────────────────────────
-- TAGS  (many-to-many: files <-> tags)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS file_tags (
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    tag_id   INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

-- ─────────────────────────────────────────
-- CALENDAR EVENTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    event_type    TEXT,   -- show, rehearsal, recording, press, deadline, meeting, other
    start_dt      TEXT    NOT NULL,  -- ISO 8601 datetime
    end_dt        TEXT,              -- ISO 8601 datetime
    location      TEXT,
    description   TEXT,
    recurring     TEXT,   -- none | daily | weekly | monthly
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start_dt    ON events(start_dt);
CREATE INDEX IF NOT EXISTS idx_events_event_type  ON events(event_type);

-- Files attached to an event (e.g. setlist, contract)
CREATE TABLE IF NOT EXISTS event_files (
    event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    file_id   INTEGER NOT NULL REFERENCES files(id)  ON DELETE CASCADE,
    PRIMARY KEY (event_id, file_id)
);

-- ─────────────────────────────────────────
-- TASKS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT NOT NULL DEFAULT 'todo',  -- todo | in_progress | done | blocked
    priority      TEXT NOT NULL DEFAULT 'medium', -- low | medium | high
    due_date      TEXT,   -- ISO 8601 date
    assignee      TEXT,   -- team member name
    related_event     INTEGER REFERENCES events(id) ON DELETE SET NULL,
    parent_id         INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    start_date        TEXT,   -- ISO date; roadmap span start
    roadmap_category  TEXT,   -- release | pr | recording | writing | other | NULL (not on roadmap)
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date  ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks(assignee);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);

-- Files attached to a task
CREATE TABLE IF NOT EXISTS task_files (
    task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, file_id)
);

-- Comments on a task (supports @mention tagging in body)
CREATE TABLE IF NOT EXISTS task_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author      TEXT NOT NULL,   -- team member or band member name
    body        TEXT NOT NULL,   -- comment text, may contain @mentions
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);

-- ─────────────────────────────────────────
-- SOURCES
-- Any reference material used by the team that brought real value:
-- web pages, tools, documents, contacts, services.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    url          TEXT,
    source_type  TEXT NOT NULL DEFAULT 'other',
                 -- web | document | tool | service | contact | other
    description  TEXT,              -- what it is and why it was useful
    used_by      TEXT,              -- team member name
    used_for     TEXT,              -- task or context it was used in
    accessed_at  TEXT,              -- ISO 8601 date when first used
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_source_type ON sources(source_type);
CREATE INDEX IF NOT EXISTS idx_sources_used_by     ON sources(used_by);

-- ─────────────────────────────────────────
-- INTEGRATIONS
-- Gmail, Discord, Instagram, TikTok, YouTube
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_connections (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    platform         TEXT NOT NULL UNIQUE,  -- google | discord | instagram | tiktok
    status           TEXT NOT NULL DEFAULT 'disconnected',  -- disconnected | connected | error
    access_token     TEXT,
    refresh_token    TEXT,
    token_expires_at TEXT,   -- ISO 8601 UTC
    token_scope      TEXT,
    account_label    TEXT,   -- shown in UI: email address or @handle
    last_sync_at     TEXT,   -- ISO 8601 UTC
    last_error       TEXT,
    connected_at     TEXT,
    updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    platform     TEXT NOT NULL,       -- gmail | discord
    external_id  TEXT NOT NULL,       -- Gmail message ID / Discord snowflake
    channel      TEXT,                -- Discord channel name / Gmail label
    sender       TEXT,
    subject      TEXT,                -- Gmail only
    body_preview TEXT,                -- first 500 chars, plain text
    url          TEXT,
    received_at  TEXT NOT NULL,       -- ISO 8601, from source
    synced_at    TEXT NOT NULL,
    UNIQUE(platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_intmsg_platform     ON integration_messages(platform);
CREATE INDEX IF NOT EXISTS idx_intmsg_received_at  ON integration_messages(received_at);

CREATE TABLE IF NOT EXISTS integration_posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    platform      TEXT NOT NULL,      -- instagram | tiktok | youtube
    external_id   TEXT NOT NULL,
    post_type     TEXT,               -- post | reel | video | short
    caption       TEXT,               -- truncated at 500 chars
    url           TEXT,
    thumbnail_url TEXT,
    published_at  TEXT NOT NULL,      -- ISO 8601
    synced_at     TEXT NOT NULL,
    UNIQUE(platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_intpost_platform     ON integration_posts(platform);
CREATE INDEX IF NOT EXISTS idx_intpost_published_at ON integration_posts(published_at);

CREATE TABLE IF NOT EXISTS integration_metrics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    platform    TEXT NOT NULL,
    metric_type TEXT NOT NULL,        -- post | account
    external_id TEXT,                 -- NULL for account-level
    data        TEXT NOT NULL,        -- JSON blob: {"likes":123,"views":4567,...}
    period      TEXT,                 -- snapshot | daily_28d | weekly
    measured_at TEXT NOT NULL,        -- ISO 8601
    UNIQUE(platform, metric_type, external_id, measured_at)
);
CREATE INDEX IF NOT EXISTS idx_intmet_platform    ON integration_metrics(platform);
CREATE INDEX IF NOT EXISTS idx_intmet_measured_at ON integration_metrics(measured_at);

-- ─────────────────────────────────────────
-- IDEAS
-- Captures raw ideas before they become tasks.
-- category: song | marketing | show | visual | other
-- status:   open | archived | inbox
--   inbox   = auto-detected from Discord (not yet reviewed)
--   open    = acknowledged, in consideration
--   archived = dismissed or promoted to a task
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ideas (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT NOT NULL,
  description         TEXT,
  category            TEXT DEFAULT 'other',  -- song | marketing | show | visual | other
  status              TEXT DEFAULT 'open',   -- open | archived | inbox
  created_at          TEXT DEFAULT (datetime('now')),
  task_id             INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  -- Discord idea detection fields (populated by POST /api/ideas/detect-from-discord)
  discord_message_id  TEXT,   -- external_id from integration_messages
  source_channel      TEXT    -- Discord channel name
);
-- Migration note: discord_message_id and source_channel were added via ALTER TABLE
-- to the live DB after initial creation.
CREATE INDEX IF NOT EXISTS idx_ideas_discord_msg ON ideas(discord_message_id) WHERE discord_message_id IS NOT NULL;

-- ─────────────────────────────────────────
-- SETLISTS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setlists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  date       TEXT,            -- ISO date of the show
  venue      TEXT,
  notes      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS setlist_songs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  song_title TEXT NOT NULL,
  position   INTEGER NOT NULL,
  notes      TEXT
);
CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist_id ON setlist_songs(setlist_id);

-- ─────────────────────────────────────────
-- OUTREACH
-- Tracks outreach status on sources and logs all messages.
-- outreach_status on sources: not_contacted | contacted | in_progress | closed
-- direction on outreach: sent | received
-- ─────────────────────────────────────────

-- NOTE: outreach_status column is added to sources via migration:
-- ALTER TABLE sources ADD COLUMN outreach_status TEXT DEFAULT 'not_contacted';

-- ─────────────────────────────────────────
-- CONTACTS
-- Individual/person contacts (band contacts).
-- category: musician | venue | promoter | press | management | other
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT,                        -- e.g. "Booking Agent", "Venue Owner", "Journalist"
  company     TEXT,                        -- optional company they work at
  email       TEXT,
  phone       TEXT,
  notes       TEXT,
  category    TEXT DEFAULT 'other',        -- musician | venue | promoter | press | management | other
  outreach_status TEXT DEFAULT 'not_contacted',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

-- NOTE: contact_id column is added to outreach via migration:
-- ALTER TABLE outreach ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE;
-- CREATE INDEX IF NOT EXISTS idx_outreach_contact_id ON outreach(contact_id);

-- Migration: tag, city, state columns added to contacts
-- ALTER TABLE contacts ADD COLUMN tag TEXT DEFAULT 'Other';
-- ALTER TABLE contacts ADD COLUMN city TEXT;
-- ALTER TABLE contacts ADD COLUMN state TEXT;

-- Migration: social_links column added to contacts
-- ALTER TABLE contacts ADD COLUMN social_links TEXT DEFAULT '{}';

CREATE TABLE IF NOT EXISTS outreach (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  contact_id   INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'received'
  message      TEXT NOT NULL,
  contacted_at TEXT DEFAULT (datetime('now')),
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_source_id  ON outreach(source_id);
CREATE INDEX IF NOT EXISTS idx_outreach_contact_id ON outreach(contact_id);

-- Google Calendar sync column (migration)
ALTER TABLE events ADD COLUMN google_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_google_event_id ON events(google_event_id) WHERE google_event_id IS NOT NULL;

-- Pinned files (migration)
ALTER TABLE files ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

-- Google Drive files
CREATE TABLE IF NOT EXISTS google_drive_files (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    google_file_id TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    mime_type      TEXT,
    extension      TEXT,
    size_bytes     INTEGER,
    modified_at    TEXT,
    web_url        TEXT,
    icon_url       TEXT,
    pinned         INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gdrive_pinned ON google_drive_files(pinned);

-- ─────────────────────────────────────────
-- DRIVE FILE BROWSER
-- UI folder hierarchy (Milo-managed, not tied to Drive structure)
-- drive_files maps google_drive_files into the folder tree
-- ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drive_folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    parent_id   INTEGER REFERENCES drive_folders(id) ON DELETE CASCADE,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drive_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    drive_id        TEXT UNIQUE,           -- Google Drive file ID
    name            TEXT NOT NULL,         -- Display name
    mime_type       TEXT,                  -- Google MIME type
    drive_url       TEXT,                  -- Direct link to open in Drive
    thumbnail_url   TEXT,                  -- Optional thumbnail
    folder_id       INTEGER REFERENCES drive_folders(id) ON DELETE SET NULL,
    size_bytes      INTEGER,
    modified_at     TEXT,                  -- Last modified in Drive
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drive_files_folder ON drive_files(folder_id);
CREATE INDEX IF NOT EXISTS idx_drive_files_drive_id ON drive_files(drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_folders_parent ON drive_folders(parent_id);

-- Seed: top-level folders (safe to re-run)
INSERT OR IGNORE INTO drive_folders (id, name, parent_id, sort_order) VALUES
  (1, 'Art & Design', NULL, 1),
  (2, 'Music',        NULL, 2),
  (3, 'Photos',       NULL, 3),
  (4, 'Merch',        NULL, 4),
  (5, 'Press & EPK',  NULL, 5),
  (6, 'Videos',       NULL, 6),
  (7, 'Social Media', NULL, 7),
  (8, 'Touring',      NULL, 8),
  (9, 'Business',     NULL, 9);

-- ─────────────────────────────────────────
-- FINANCE
-- Synced from Google Sheets finance/budget spreadsheets
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  year           INTEGER NOT NULL,
  sheet_tab      TEXT,
  row_index      INTEGER,
  entry_type     TEXT,
  category       TEXT,
  description    TEXT,
  amount         REAL,
  entry_date     TEXT,
  show_name      TEXT,
  budget_amount  REAL,
  google_file_id TEXT,
  raw_row        TEXT,
  created_at     TEXT,
  updated_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_entries_key
  ON finance_entries(google_file_id, sheet_tab, row_index);

CREATE TABLE IF NOT EXISTS finance_sheets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  google_file_id TEXT UNIQUE,
  name           TEXT,
  year           INTEGER,
  last_synced_at TEXT
);

-- ─────────────────────────────────────────
-- ANALYTICS
-- Spotify, Last.fm, YouTube metrics
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_metrics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,  -- 'spotify' | 'lastfm' | 'youtube'
  metric_key    TEXT NOT NULL,  -- e.g. 'followers', 'listeners', 'subscribers'
  metric_value  REAL,
  metric_text   TEXT,
  recorded_at   TEXT NOT NULL,
  raw_json      TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_platform_key_date
  ON analytics_metrics(platform, metric_key, recorded_at);

CREATE TABLE IF NOT EXISTS analytics_connections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT UNIQUE NOT NULL,  -- 'spotify' | 'lastfm' | 'youtube'
  artist_name   TEXT,
  artist_id     TEXT,   -- platform-specific ID (Spotify artist ID, Last.fm artist name, YouTube channel ID)
  api_key       TEXT,   -- for API-key-based platforms
  client_id     TEXT,   -- for OAuth platforms
  client_secret TEXT,   -- for OAuth platforms (store as plaintext for now, local app)
  connected_at  TEXT,
  last_synced_at TEXT
);

-- ─────────────────────────────────────────
-- MEDIA — Press articles and clippings
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_articles (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    url             TEXT NOT NULL UNIQUE,
    title           TEXT,
    author          TEXT,
    publication     TEXT,       -- e.g. "Rolling Stone", "Pitchfork"
    published_date  TEXT,       -- ISO date string from article metadata
    summary         TEXT,       -- og:description or first paragraph
    content         TEXT,       -- full article body text (plain text, stripped of HTML)
    image_url       TEXT,       -- og:image
    scraped_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_articles_published ON media_articles(published_date);
CREATE INDEX IF NOT EXISTS idx_media_articles_scraped ON media_articles(scraped_at DESC);

-- ─────────────────────────────────────────
-- SQUARE INTEGRATION
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS square_catalog_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    square_id       TEXT UNIQUE NOT NULL,       -- Square catalog object ID
    name            TEXT NOT NULL,
    description     TEXT,
    sku             TEXT,
    price_cents     INTEGER,                    -- price in cents
    category        TEXT,
    image_url       TEXT,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS square_inventory (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    catalog_item_id TEXT NOT NULL,              -- references square_catalog_items.square_id
    location_id     TEXT,
    location_name   TEXT,
    quantity        REAL DEFAULT 0,
    state           TEXT DEFAULT 'IN_STOCK',    -- IN_STOCK | SOLD | WASTE | etc
    calculated_at   TEXT,
    updated_at      TEXT,
    UNIQUE(catalog_item_id, location_id)
);

CREATE TABLE IF NOT EXISTS square_orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    square_id       TEXT UNIQUE NOT NULL,
    location_id     TEXT,
    state           TEXT,                       -- OPEN | COMPLETED | CANCELED
    total_cents     INTEGER,
    item_count      INTEGER,
    customer_name   TEXT,
    fulfillment_type TEXT,                      -- PICKUP | SHIPMENT | DELIVERY
    fulfillment_state TEXT,
    created_at      TEXT,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS square_order_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id        TEXT NOT NULL,              -- references square_orders.square_id
    catalog_item_id TEXT,
    name            TEXT NOT NULL,
    quantity        REAL,
    base_price_cents INTEGER,
    total_cents     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_square_orders_created ON square_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_square_inventory_item ON square_inventory(catalog_item_id);

-- ─────────────────────────────────────────
-- APP USERS & AUTH SESSIONS
-- Per-user Google OAuth login for the app.
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT,
  picture_url  TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  email      TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
