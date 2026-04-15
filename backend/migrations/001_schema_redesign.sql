-- === FILE: backend/migrations/001_schema_redesign.sql ===

-- ══════════════════════════════════════════════════════
-- PHASE 1: Users (unchanged)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id   TEXT UNIQUE,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- PHASE 2: Pages (scene separated out)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT DEFAULT '📄',
  color         TEXT DEFAULT '#6366f1',
  layout_mode   TEXT DEFAULT 'canvas'
    CHECK (layout_mode IN ('canvas', 'notebook')),
  is_archived   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pages_user ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_archived ON pages(is_archived);

CREATE TABLE IF NOT EXISTS page_scenes (
  page_id     UUID PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  scene_data  JSONB NOT NULL DEFAULT '{"elements":[],"appState":{},"files":{}}',
  version     INTEGER DEFAULT 1,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_visual_context (
  page_id            UUID PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  background_color   TEXT DEFAULT '#0e0e1a',
  theme              TEXT DEFAULT 'dark',
  dominant_colors    TEXT[] DEFAULT '{}',
  layout_pattern     TEXT DEFAULT 'freeform',
  reading_direction  TEXT DEFAULT 'top-to-bottom',
  density            TEXT DEFAULT 'sparse',
  bounds             JSONB DEFAULT '{"minX":0,"minY":0,"maxX":1920,"maxY":1080}',
  element_count      INTEGER DEFAULT 0,
  last_analyzed      TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_viewports (
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  page_id    UUID REFERENCES pages(id) ON DELETE CASCADE,
  scroll_x   FLOAT DEFAULT 0,
  scroll_y   FLOAT DEFAULT 0,
  zoom       FLOAT DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);

-- ══════════════════════════════════════════════════════
-- PHASE 3: Notes (no canvas positions)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  page_id             UUID REFERENCES pages(id) ON DELETE SET NULL,
  raw_text            TEXT NOT NULL,
  title               TEXT,
  summary             TEXT,
  tags                TEXT[] DEFAULT '{}',
  tasks               TEXT[] DEFAULT '{}',
  entities            TEXT[] DEFAULT '{}',
  content_type        TEXT DEFAULT 'note'
    CHECK (content_type IN ('note','code','url','thought','question','clip')),
  source_url          TEXT,
  source_title        TEXT,
  capture_type        TEXT DEFAULT 'manual',
  processing_status   TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','done','failed')),
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_page ON notes(page_id);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(processing_status);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON notes USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

-- Embeddings in separate table
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS note_embeddings (
  note_id    UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  embedding  vector(768) NOT NULL,
  model      TEXT DEFAULT 'gemini-embedding-001',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_ivfflat
  ON note_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ══════════════════════════════════════════════════════
-- PHASE 4: Canvas Element Registry
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS canvas_regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  label       TEXT,
  description TEXT,
  color       TEXT,
  region_type TEXT DEFAULT 'cluster'
    CHECK (region_type IN ('cluster','section','timeline-segment','comparison-column','freeform')),
  layout_hint TEXT DEFAULT 'auto',
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regions_page ON canvas_regions(page_id);

CREATE TABLE IF NOT EXISTS canvas_element_registry (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id        UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  element_id     TEXT NOT NULL,
  element_type   TEXT NOT NULL
    CHECK (element_type IN ('note-card','composed-text','diagram-node','diagram-arrow','sticky','freehand','image','group')),
  content_source TEXT DEFAULT 'user-draw'
    CHECK (content_source IN ('note','ai-compose','ai-diagram','user-draw','clip')),
  note_id        UUID REFERENCES notes(id) ON DELETE SET NULL,
  region_id      UUID REFERENCES canvas_regions(id) ON DELETE SET NULL,
  cached_x       FLOAT,
  cached_y       FLOAT,
  cached_width   FLOAT,
  cached_height  FLOAT,
  style_snapshot JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (page_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_registry_page ON canvas_element_registry(page_id);
CREATE INDEX IF NOT EXISTS idx_registry_note ON canvas_element_registry(note_id);
CREATE INDEX IF NOT EXISTS idx_registry_region ON canvas_element_registry(region_id);

-- ══════════════════════════════════════════════════════
-- PHASE 5: Graph (edges)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS note_edges (
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

CREATE INDEX IF NOT EXISTS idx_edges_source ON note_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON note_edges(target_id);

-- ══════════════════════════════════════════════════════
-- PHASE 6: Document Flow (notebook mode)
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS page_documents (
  page_id        UUID PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  default_font   TEXT DEFAULT 'Virgil',
  content_width  INTEGER DEFAULT 840,
  line_height    FLOAT DEFAULT 1.5,
  left_padding   INTEGER DEFAULT 40,
  right_padding  INTEGER DEFAULT 40,
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_type      TEXT DEFAULT 'paragraph',
  text_content    TEXT,
  order_key       FLOAT NOT NULL DEFAULT 0,
  depth           INTEGER DEFAULT 0,
  parent_block_id UUID REFERENCES page_blocks(id) ON DELETE SET NULL,
  note_id         UUID REFERENCES notes(id) ON DELETE SET NULL,
  attrs           JSONB DEFAULT '{}',
  provenance      JSONB DEFAULT '{}',
  version         INTEGER DEFAULT 1,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_by      TEXT DEFAULT 'user',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocks_page ON page_blocks(page_id, order_key);
CREATE INDEX IF NOT EXISTS idx_blocks_note ON page_blocks(note_id);

CREATE TABLE IF NOT EXISTS block_references (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id      UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id     UUID NOT NULL REFERENCES page_blocks(id) ON DELETE CASCADE,
  ref_type     TEXT NOT NULL,
  ref_id       TEXT NOT NULL,
  start_offset INTEGER DEFAULT 0,
  end_offset   INTEGER,
  label        TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inline_embeds (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id          UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id         UUID NOT NULL REFERENCES page_blocks(id) ON DELETE CASCADE,
  embed_type       TEXT NOT NULL,
  target_page_id   UUID REFERENCES pages(id) ON DELETE SET NULL,
  target_note_id   UUID REFERENCES notes(id) ON DELETE SET NULL,
  target_block_id  UUID REFERENCES page_blocks(id) ON DELETE SET NULL,
  url              TEXT,
  inline_position  JSONB DEFAULT '{}',
  display_mode     TEXT DEFAULT 'inline-card',
  width            INTEGER,
  height           INTEGER,
  attrs            JSONB DEFAULT '{}',
  created_by       TEXT DEFAULT 'user',
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- PHASE 7: Support tables
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chat_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  context_type TEXT DEFAULT 'home',
  context_id   TEXT,
  messages     JSONB DEFAULT '[]',
  title        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  theme      TEXT,
  model      TEXT,
  groq_model TEXT,
  similarity_threshold FLOAT,
  embedding_dimensions INTEGER,
  auto_layout  BOOLEAN,
  auto_connect BOOLEAN,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type  TEXT NOT NULL,
  status      TEXT DEFAULT 'running',
  input_data  JSONB DEFAULT '{}',
  output_data JSONB DEFAULT '{}',
  errors      JSONB DEFAULT '[]',
  started_at  TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS page_revisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  scene_data  JSONB DEFAULT '{}',
  viewport    JSONB,
  ops         JSONB DEFAULT '[]',
  source      TEXT DEFAULT 'manual',
  changed_by  TEXT DEFAULT 'user',
  message     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS page_operation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID REFERENCES pages(id) ON DELETE CASCADE,
  op_type     TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  payload     JSONB DEFAULT '{}',
  actor       TEXT DEFAULT 'user',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════════════
-- FUNCTIONS: Vector search
-- ══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.65,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  page_id UUID,
  title TEXT,
  summary TEXT,
  raw_text TEXT,
  tags TEXT[],
  tasks TEXT[],
  entities TEXT[],
  content_type TEXT,
  source_url TEXT,
  processing_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.user_id, n.page_id, n.title, n.summary,
    n.raw_text, n.tags, n.tasks, n.entities,
    n.content_type, n.source_url, n.processing_status,
    n.metadata, n.created_at, n.updated_at,
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
  target_page_id UUID,
  match_threshold FLOAT DEFAULT 0.65,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  page_id UUID,
  title TEXT,
  summary TEXT,
  raw_text TEXT,
  tags TEXT[],
  tasks TEXT[],
  entities TEXT[],
  content_type TEXT,
  source_url TEXT,
  processing_status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql AS 
$$
BEGIN
  RETURN QUERY
  SELECT
    n.id, n.user_id, n.page_id, n.title, n.summary,
    n.raw_text, n.tags, n.tasks, n.entities,
    n.content_type, n.source_url, n.processing_status,
    n.metadata, n.created_at, n.updated_at,
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

-- Block ordering helpers
CREATE OR REPLACE FUNCTION mnemos_next_order_key(
  p_page_id UUID,
  p_prev_block_id UUID DEFAULT NULL,
  p_next_block_id UUID DEFAULT NULL
)
RETURNS FLOAT
LANGUAGE plpgsql AS 
$$
DECLARE
  prev_key FLOAT;
  next_key FLOAT;
  max_key FLOAT;
BEGIN
  IF p_prev_block_id IS NOT NULL THEN
    SELECT order_key INTO prev_key FROM page_blocks WHERE id = p_prev_block_id;
  END IF;
  IF p_next_block_id IS NOT NULL THEN
    SELECT order_key INTO next_key FROM page_blocks WHERE id = p_next_block_id;
  END IF;

  IF prev_key IS NULL AND next_key IS NULL THEN
    SELECT COALESCE(MAX(order_key), 0) INTO max_key
    FROM page_blocks WHERE page_id = p_page_id AND NOT is_deleted;
    RETURN max_key + 1000.0;
  END IF;

  IF prev_key IS NULL THEN RETURN next_key - 1000.0; END IF;
  IF next_key IS NULL THEN RETURN prev_key + 1000.0; END IF;

  RETURN (prev_key + next_key) / 2.0;
END;
$$
;

CREATE OR REPLACE FUNCTION mnemos_rebalance_page_blocks(p_page_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS 
$$
DECLARE
  rec RECORD;
  counter INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT id FROM page_blocks
    WHERE page_id = p_page_id
    ORDER BY order_key, created_at
  LOOP
    counter := counter + 1;
    UPDATE page_blocks SET order_key = counter * 1000.0, updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END;
$$
;