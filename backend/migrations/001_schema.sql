-- === FILE: backend/migrations/001_schema.sql ===

-- Mnemos v4 — Knowledge ≠ Presentation
-- Run in Supabase SQL Editor on clean database

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════
-- USERS
-- ══════════════════════════════════════════

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id   TEXT UNIQUE,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════
-- KNOWLEDGE LAYER
-- No visual data. No position data.
-- "What do you know?" lives here.
-- ══════════════════════════════════════════

CREATE TABLE items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Original capture
    source_text   TEXT NOT NULL,
    source_url    TEXT,
    source_title  TEXT,
    source_type   TEXT DEFAULT 'manual'
        CHECK (source_type IN ('manual','extension','api','import')),

    -- AI-extracted
    title         TEXT,
    summary       TEXT,
    content_type  TEXT DEFAULT 'note'
        CHECK (content_type IN ('note','code','url','thought','question','snippet')),
    tags          TEXT[] DEFAULT '{}',
    entities      TEXT[] DEFAULT '{}',
    tasks         TEXT[] DEFAULT '{}',

    -- Processing
    status        TEXT DEFAULT 'pending'
        CHECK (status IN ('pending','processing','ready','error')),

    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_items_owner ON items(owner_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_tags ON items USING GIN(tags);
CREATE INDEX idx_items_created ON items(created_at DESC);

CREATE TABLE item_embeddings (
    item_id    UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    vector     vector(768) NOT NULL,
    model      TEXT DEFAULT 'gemini-embedding-001',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_item_emb_ivfflat
    ON item_embeddings USING ivfflat (vector vector_cosine_ops)
    WITH (lists = 100);

CREATE TABLE item_connections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    to_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    rel_type    TEXT DEFAULT 'related'
        CHECK (rel_type IN ('related','depends_on','extends',
                            'contradicts','summarizes','example_of')),
    label       TEXT,
    score       FLOAT DEFAULT 0.0,
    created_by  TEXT DEFAULT 'system'
        CHECK (created_by IN ('system','user','curator')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (from_id, to_id),
    CHECK (from_id != to_id)
);

CREATE INDEX idx_conn_from ON item_connections(from_id);
CREATE INDEX idx_conn_to ON item_connections(to_id);

-- ══════════════════════════════════════════
-- PRESENTATION LAYER
-- "How do you view it?" lives here.
-- ══════════════════════════════════════════

CREATE TABLE workspaces (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    slug          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    description   TEXT,
    icon          TEXT DEFAULT '📄',
    color         TEXT DEFAULT '#6366f1',
    is_archived   BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (owner_id, slug)
);

CREATE INDEX idx_ws_owner ON workspaces(owner_id);

-- M:N — same item can appear on multiple workspaces
CREATE TABLE workspace_items (
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ DEFAULT now(),
    added_by      TEXT DEFAULT 'system',
    PRIMARY KEY (workspace_id, item_id)
);

-- Canvas scene — Excalidraw JSON (rendered cache, NOT source of truth for items)
CREATE TABLE canvas_state (
    workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    scene         JSONB NOT NULL DEFAULT '{"elements":[],"appState":{"viewBackgroundColor":"#0e0e1a","theme":"dark"},"files":{}}',
    background    TEXT DEFAULT '#0e0e1a',
    theme         TEXT DEFAULT 'dark',
    version       INTEGER DEFAULT 0,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Item positions on canvas — THIS is the source of truth for "where"
CREATE TABLE canvas_placements (
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    x             FLOAT NOT NULL DEFAULT 0,
    y             FLOAT NOT NULL DEFAULT 0,
    w             FLOAT NOT NULL DEFAULT 360,
    h             FLOAT NOT NULL DEFAULT 240,
    element_ids   TEXT[] DEFAULT '{}',
    updated_at    TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (workspace_id, item_id)
);

-- Non-item canvas elements (AI-generated diagrams, composed text, stickies)
CREATE TABLE canvas_objects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL
        CHECK (kind IN ('text','diagram','sticky','shape','image')),
    origin          TEXT DEFAULT 'user'
        CHECK (origin IN ('user','ai')),
    excalidraw_ids  TEXT[] DEFAULT '{}',
    x               FLOAT,
    y               FLOAT,
    w               FLOAT,
    h               FLOAT,
    content         TEXT,
    meta            JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_canvas_obj_ws ON canvas_objects(workspace_id);

-- ══════════════════════════════════════════
-- SUPPORT LAYER
-- ══════════════════════════════════════════

CREATE TABLE board_ops (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    op            TEXT NOT NULL,
    actor         TEXT DEFAULT 'ai' CHECK (actor IN ('ai','user','system')),
    targets       TEXT[] DEFAULT '{}',
    data          JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_ws_ver ON board_ops(workspace_id, version);

CREATE TABLE conversations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    title         TEXT,
    messages      JSONB DEFAULT '[]',
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conv_owner ON conversations(owner_id);

CREATE TABLE user_preferences (
    owner_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme                 TEXT DEFAULT 'dark',
    primary_model         TEXT DEFAULT 'gemini-2.5-flash',
    secondary_model       TEXT DEFAULT 'llama-3.3-70b-versatile',
    similarity_threshold  FLOAT DEFAULT 0.65,
    auto_layout           BOOLEAN DEFAULT TRUE,
    auto_connect          BOOLEAN DEFAULT TRUE,
    updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════
-- VECTOR SEARCH FUNCTIONS
-- ══════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_items(
    query_vector  vector(768),
    threshold     FLOAT DEFAULT 0.65,
    max_results   INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID, owner_id UUID, title TEXT, summary TEXT,
    source_text TEXT, tags TEXT[], content_type TEXT,
    source_url TEXT, status TEXT, created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
    RETURN QUERY
    SELECT
        i.id, i.owner_id, i.title, i.summary,
        i.source_text, i.tags, i.content_type,
        i.source_url, i.status, i.created_at,
        1 - (ie.vector <=> query_vector) AS similarity
    FROM items i
    JOIN item_embeddings ie ON ie.item_id = i.id
    WHERE 1 - (ie.vector <=> query_vector) > threshold
    ORDER BY ie.vector <=> query_vector
    LIMIT max_results;
END;
$$
;

CREATE OR REPLACE FUNCTION search_items_in_workspace(
    query_vector      vector(768),
    target_ws_id      UUID,
    threshold         FLOAT DEFAULT 0.65,
    max_results       INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID, owner_id UUID, title TEXT, summary TEXT,
    source_text TEXT, tags TEXT[], content_type TEXT,
    source_url TEXT, status TEXT, created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
    RETURN QUERY
    SELECT
        i.id, i.owner_id, i.title, i.summary,
        i.source_text, i.tags, i.content_type,
        i.source_url, i.status, i.created_at,
        1 - (ie.vector <=> query_vector) AS similarity
    FROM items i
    JOIN item_embeddings ie ON ie.item_id = i.id
    JOIN workspace_items wi ON wi.item_id = i.id
    WHERE wi.workspace_id = target_ws_id
        AND 1 - (ie.vector <=> query_vector) > threshold
    ORDER BY ie.vector <=> query_vector
    LIMIT max_results;
END;
$$
;

-- Seed inbox
INSERT INTO workspaces (slug, display_name, description, icon, color)
VALUES ('inbox', 'Inbox', 'Default workspace for unrouted items', '📥', '#6b7280');