-- ══════════════════════════════════════════════════════
-- Mnemos v3 — Fresh Database Setup
-- Run this in Supabase SQL Editor on a clean database
-- ══════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════════════
-- 1. USERS
-- ══════════════════════════════════════════════════════

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id   TEXT UNIQUE,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- 2. PAGES
-- ══════════════════════════════════════════════════════

CREATE TABLE pages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    description   TEXT,
    icon          TEXT DEFAULT '📄',
    color         TEXT DEFAULT '#6366f1',
    is_archived   BOOLEAN DEFAULT FALSE,
    scene_data    JSONB NOT NULL DEFAULT '{"elements":[],"appState":{"viewBackgroundColor":"#0e0e1a","theme":"dark"},"files":{}}',
    scene_version INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pages_user ON pages(user_id);
CREATE INDEX idx_pages_archived ON pages(is_archived);

-- ══════════════════════════════════════════════════════
-- 3. NOTES
-- ══════════════════════════════════════════════════════

CREATE TABLE notes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    page_id           UUID REFERENCES pages(id) ON DELETE SET NULL,
    raw_text          TEXT NOT NULL,
    title             TEXT,
    summary           TEXT,
    tags              TEXT[] DEFAULT '{}',
    tasks             TEXT[] DEFAULT '{}',
    entities          TEXT[] DEFAULT '{}',
    content_type      TEXT DEFAULT 'note'
        CHECK (content_type IN ('note','code','url','thought','question','clip')),
    source_url        TEXT,
    source_title      TEXT,
    capture_type      TEXT DEFAULT 'manual',
    processing_status TEXT DEFAULT 'pending'
        CHECK (processing_status IN ('pending','processing','done','failed')),
    canvas_x          FLOAT,
    canvas_y          FLOAT,
    canvas_width      FLOAT DEFAULT 360,
    canvas_height     FLOAT DEFAULT 240,
    element_ids       TEXT[] DEFAULT '{}',
    metadata          JSONB DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_page ON notes(page_id);
CREATE INDEX idx_notes_status ON notes(processing_status);
CREATE INDEX idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX idx_notes_created ON notes(created_at DESC);

-- ══════════════════════════════════════════════════════
-- 4. NOTE_EMBEDDINGS
-- ══════════════════════════════════════════════════════

CREATE TABLE note_embeddings (
    note_id    UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    embedding  vector(768) NOT NULL,
    model      TEXT DEFAULT 'gemini-embedding-001',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_embeddings_ivfflat
    ON note_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ══════════════════════════════════════════════════════
-- 5. NOTE_EDGES
-- ══════════════════════════════════════════════════════

CREATE TABLE note_edges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_id   UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    edge_type   TEXT DEFAULT 'related'
        CHECK (edge_type IN ('related','depends_on','extends','contradicts','summarizes','example_of')),
    label       TEXT,
    strength    FLOAT DEFAULT 0.0,
    created_by  TEXT DEFAULT 'processor',
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (source_id, target_id),
    CHECK (source_id != target_id)
);

CREATE INDEX idx_edges_source ON note_edges(source_id);
CREATE INDEX idx_edges_target ON note_edges(target_id);

-- ══════════════════════════════════════════════════════
-- 6. SCENE_OPERATIONS
-- ══════════════════════════════════════════════════════

CREATE TABLE scene_operations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    op_type     TEXT NOT NULL
        CHECK (op_type IN (
            'add_elements','update_elements','delete_elements',
            'move_elements','add_note_card','remove_note_card',
            'add_diagram','set_background','user_sync','full_rebuild'
        )),
    actor       TEXT DEFAULT 'ai' CHECK (actor IN ('ai','user','system')),
    element_ids TEXT[] DEFAULT '{}',
    payload     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ops_page_version ON scene_operations(page_id, version);

-- ══════════════════════════════════════════════════════
-- 7. CHAT_HISTORY
-- ══════════════════════════════════════════════════════

CREATE TABLE chat_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    page_id      UUID REFERENCES pages(id) ON DELETE SET NULL,
    context_type TEXT DEFAULT 'home',
    messages     JSONB DEFAULT '[]',
    title        TEXT,
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- 8. SETTINGS
-- ══════════════════════════════════════════════════════

CREATE TABLE settings (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme                TEXT DEFAULT 'dark',
    model                TEXT DEFAULT 'gemini-2.5-flash',
    groq_model           TEXT DEFAULT 'llama-3.3-70b-versatile',
    similarity_threshold FLOAT DEFAULT 0.65,
    auto_layout          BOOLEAN DEFAULT TRUE,
    auto_connect         BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMPTZ DEFAULT now(),
    updated_at           TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- FUNCTIONS: Vector Search
-- ══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_notes(
    query_embedding vector(768),
    match_threshold FLOAT DEFAULT 0.65,
    match_count     INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID, user_id UUID, page_id UUID,
    title TEXT, summary TEXT, raw_text TEXT,
    tags TEXT[], content_type TEXT,
    source_url TEXT, processing_status TEXT,
    metadata JSONB, created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
    RETURN QUERY
    SELECT
        n.id, n.user_id, n.page_id,
        n.title, n.summary, n.raw_text,
        n.tags, n.content_type,
        n.source_url, n.processing_status,
        n.metadata, n.created_at,
        1 - (ne.embedding <=> query_embedding) AS similarity
    FROM notes n
    JOIN note_embeddings ne ON ne.note_id = n.id
    WHERE 1 - (ne.embedding <=> query_embedding) > match_threshold
    ORDER BY ne.embedding <=> query_embedding
    LIMIT match_count;
END;
$$
;

CREATE OR REPLACE FUNCTION match_notes_in_page(
    query_embedding vector(768),
    target_page_id  UUID,
    match_threshold FLOAT DEFAULT 0.65,
    match_count     INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID, user_id UUID, page_id UUID,
    title TEXT, summary TEXT, raw_text TEXT,
    tags TEXT[], content_type TEXT,
    source_url TEXT, processing_status TEXT,
    metadata JSONB, created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
    RETURN QUERY
    SELECT
        n.id, n.user_id, n.page_id,
        n.title, n.summary, n.raw_text,
        n.tags, n.content_type,
        n.source_url, n.processing_status,
        n.metadata, n.created_at,
        1 - (ne.embedding <=> query_embedding) AS similarity
    FROM notes n
    JOIN note_embeddings ne ON ne.note_id = n.id
    WHERE n.page_id = target_page_id
        AND 1 - (ne.embedding <=> query_embedding) > match_threshold
    ORDER BY ne.embedding <=> query_embedding
    LIMIT match_count;
END;
$$
;

-- ══════════════════════════════════════════════════════
-- SEED: Default Uncategorized page
-- ══════════════════════════════════════════════════════

INSERT INTO pages (name, description, icon, color)
VALUES ('Uncategorized', 'Default page for unrouted notes', '📥', '#6b7280');

-- ══════════════════════════════════════════════════════
-- DONE — Verify
-- ══════════════════════════════════════════════════════

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;