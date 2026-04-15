-- Mnemos schema migration: notebook-flow + robust canvas interoperability
-- Safe for existing deployments: uses IF NOT EXISTS / additive ALTER statements.

begin;

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Core enums
-- ---------------------------------------------------------------------------
do $$
begin
	if not exists (select 1 from pg_type where typname = 'mnemos_block_type') then
		create type mnemos_block_type as enum (
			'paragraph',
			'heading1',
			'heading2',
			'heading3',
			'bullet_item',
			'numbered_item',
			'check_item',
			'quote',
			'code',
			'callout',
			'diagram',
			'embed_page',
			'embed_note',
			'divider',
			'table',
			'canvas_fragment'
		);
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_type where typname = 'mnemos_ref_type') then
		create type mnemos_ref_type as enum (
			'note',
			'page',
			'block',
			'element',
			'edge',
			'cluster',
			'url',
			'citation',
			'task',
			'tag',
			'mention'
		);
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_type where typname = 'mnemos_anchor_mode') then
		create type mnemos_anchor_mode as enum (
			'inline',
			'beside',
			'float_left',
			'float_right',
			'full_width',
			'fixed'
		);
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_type where typname = 'mnemos_wrap_mode') then
		create type mnemos_wrap_mode as enum (
			'none',
			'rect',
			'polygon'
		);
	end if;
end $$;

do $$
begin
	if not exists (select 1 from pg_type where typname = 'mnemos_revision_source') then
		create type mnemos_revision_source as enum (
			'autosave',
			'compose',
			'manual',
			'migration',
			'sync'
		);
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- Base tables (compat with existing code)
-- ---------------------------------------------------------------------------
create table if not exists users (
	id uuid primary key default gen_random_uuid(),
	google_id text unique,
	email text not null,
	name text,
	avatar_url text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists pages (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade,
	name text not null,
	description text,
	icon text not null default '📄',
	color text not null default '#6366f1',
	is_archived boolean not null default false,
	canvas_data jsonb not null default '{"elements":[],"appState":{},"files":{}}'::jsonb,
	notebook_data jsonb not null default '{"elements":[],"appState":{},"files":{}}'::jsonb,
	viewport jsonb not null default '{"x":0,"y":0,"zoom":1}'::jsonb,
	layout_mode text not null default 'hybrid',
	flow_scroll_mode text not null default 'infinite-vertical',
	content_width integer not null default 840,
	last_activity timestamptz not null default now(),
	note_count integer not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint pages_layout_mode_chk check (layout_mode in ('canvas', 'notebook', 'hybrid')),
	constraint pages_scroll_mode_chk check (flow_scroll_mode in ('infinite-vertical', 'paged')),
	constraint pages_content_width_chk check (content_width between 360 and 2400)
);

create table if not exists notes (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade,
	page_id uuid references pages(id) on delete set null,
	raw_text text not null,
	title text,
	summary text,
	tags text[] not null default '{}',
	tasks text[] not null default '{}',
	entities text[] not null default '{}',
	content_type text not null default 'note',
	capture_type text not null default 'manual',
	source_url text,
	embedding vector(768),
	processing_status text not null default 'pending',
	cluster_id uuid,
	centrality double precision,
	is_bridge boolean not null default false,
	canvas_x double precision,
	canvas_y double precision,
	canvas_width integer,
	canvas_height integer,
	metadata jsonb not null default '{}'::jsonb,
	source_reference jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists note_edges (
	id uuid primary key default gen_random_uuid(),
	source_id uuid not null references notes(id) on delete cascade,
	target_id uuid not null references notes(id) on delete cascade,
	edge_type text not null default 'related',
	label text,
	strength double precision not null default 0.0,
	created_by text not null default 'user',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint note_edges_distinct_chk check (source_id <> target_id)
);

create table if not exists clusters (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	label text not null,
	description text,
	color text not null default '#6366f1',
	center_x double precision,
	center_y double precision,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists canvas_elements (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	element_type text not null,
	content text,
	canvas_data jsonb not null default '{}'::jsonb,
	position_x double precision not null default 0,
	position_y double precision not null default 0,
	width double precision,
	height double precision,
	style jsonb not null default '{}'::jsonb,
	z_index integer not null default 0,
	anchor_mode mnemos_anchor_mode not null default 'fixed',
	wrap_mode mnemos_wrap_mode not null default 'none',
	context_block_id uuid,
	created_by text not null default 'user',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists chat_history (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade,
	context_type text not null default 'home',
	context_id uuid,
	title text,
	messages jsonb not null default '[]'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table if not exists settings (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade,
	model text,
	theme text,
	temperature double precision,
	extras jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint settings_one_per_user unique (user_id)
);

create table if not exists agent_runs (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete set null,
	page_id uuid references pages(id) on delete set null,
	agent_type text not null,
	status text not null default 'running',
	input jsonb not null default '{}'::jsonb,
	output jsonb not null default '{}'::jsonb,
	error text,
	started_at timestamptz not null default now(),
	completed_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notebook / fixed-width flow model
-- ---------------------------------------------------------------------------
create table if not exists page_documents (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null unique references pages(id) on delete cascade,
	user_id uuid references users(id) on delete set null,
	default_font text not null default '16px "Assistant"',
	content_width integer not null default 840,
	line_height double precision not null default 1.5,
	left_padding integer not null default 24,
	right_padding integer not null default 24,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint page_documents_content_width_chk check (content_width between 360 and 2400)
);

create table if not exists page_blocks (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	document_id uuid references page_documents(id) on delete set null,
	parent_block_id uuid references page_blocks(id) on delete set null,
	order_key numeric(30,12) not null,
	depth smallint not null default 0,
	block_type mnemos_block_type not null default 'paragraph',
	text_content text,
	attrs jsonb not null default '{}'::jsonb,
	line_start integer,
	line_end integer,
	char_start integer,
	char_end integer,
	layout_bbox jsonb not null default '{}'::jsonb,
	inline_allow_wrap boolean not null default true,
	excalidraw_anchor_mode mnemos_anchor_mode not null default 'inline',
	excalidraw_wrap_mode mnemos_wrap_mode not null default 'rect',
	source_note_id uuid references notes(id) on delete set null,
	source_page_id uuid references pages(id) on delete set null,
	provenance jsonb not null default '{}'::jsonb,
	metadata jsonb not null default '{}'::jsonb,
	is_deleted boolean not null default false,
	version integer not null default 1,
	created_by text not null default 'user',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint page_blocks_depth_chk check (depth between 0 and 12),
	constraint page_blocks_line_range_chk check (
		(line_start is null and line_end is null) or
		(line_start is not null and line_end is not null and line_end >= line_start)
	),
	constraint page_blocks_char_range_chk check (
		(char_start is null and char_end is null) or
		(char_start is not null and char_end is not null and char_end >= char_start)
	)
);

create table if not exists block_references (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	block_id uuid not null references page_blocks(id) on delete cascade,
	ref_type mnemos_ref_type not null,
	ref_id text not null,
	start_offset integer not null default 0,
	end_offset integer,
	label text,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	constraint block_references_offset_chk check (
		end_offset is null or end_offset > start_offset
	)
);

create table if not exists inline_embeds (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	block_id uuid not null references page_blocks(id) on delete cascade,
	embed_type text not null,
	target_page_id uuid references pages(id) on delete set null,
	target_note_id uuid references notes(id) on delete set null,
	target_block_id uuid references page_blocks(id) on delete set null,
	target_element_id uuid references canvas_elements(id) on delete set null,
	url text,
	inline_position jsonb not null default '{}'::jsonb,
	display_mode text not null default 'inline-card',
	width integer,
	height integer,
	attrs jsonb not null default '{}'::jsonb,
	created_by text not null default 'user',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint inline_embeds_target_chk check (
		target_page_id is not null
		or target_note_id is not null
		or target_block_id is not null
		or target_element_id is not null
		or url is not null
	)
);

create table if not exists canvas_bindings (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	block_id uuid not null references page_blocks(id) on delete cascade,
	element_id uuid not null references canvas_elements(id) on delete cascade,
	anchor_mode mnemos_anchor_mode not null default 'inline',
	wrap_mode mnemos_wrap_mode not null default 'rect',
	anchor_line integer,
	offset_x double precision not null default 0,
	offset_y double precision not null default 0,
	z_index integer not null default 0,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint canvas_bindings_unique_element unique (page_id, element_id)
);

create table if not exists page_revisions (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	document_id uuid references page_documents(id) on delete set null,
	revision_no bigserial,
	scene_data jsonb not null default '{}'::jsonb,
	viewport jsonb,
	ops jsonb not null default '[]'::jsonb,
	source mnemos_revision_source not null default 'autosave',
	changed_by text,
	message text,
	created_at timestamptz not null default now()
);

create table if not exists page_operation_log (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	op_type text not null,
	target_type text,
	target_id text,
	payload jsonb not null default '{}'::jsonb,
	actor text,
	request_id text,
	created_at timestamptz not null default now()
);

create table if not exists layout_cache (
	id uuid primary key default gen_random_uuid(),
	page_id uuid not null references pages(id) on delete cascade,
	cache_key text not null,
	content_hash text not null,
	width integer not null,
	font_key text,
	layout_data jsonb not null default '{}'::jsonb,
	expires_at timestamptz,
	created_at timestamptz not null default now(),
	constraint layout_cache_unique unique (page_id, cache_key)
);

-- ---------------------------------------------------------------------------
-- Compatibility ALTERs for existing deployments
-- ---------------------------------------------------------------------------
alter table pages add column if not exists layout_mode text not null default 'hybrid';
alter table pages add column if not exists flow_scroll_mode text not null default 'infinite-vertical';
alter table pages add column if not exists content_width integer not null default 840;
alter table pages add column if not exists notebook_data jsonb not null default '{"elements":[],"appState":{},"files":{}}'::jsonb;

alter table notes add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table notes add column if not exists source_reference jsonb not null default '{}'::jsonb;
alter table notes add column if not exists canonical_block_id uuid;

alter table canvas_elements add column if not exists z_index integer not null default 0;
alter table canvas_elements add column if not exists anchor_mode mnemos_anchor_mode not null default 'fixed';
alter table canvas_elements add column if not exists wrap_mode mnemos_wrap_mode not null default 'none';
alter table canvas_elements add column if not exists context_block_id uuid;

-- FK constraints added with guarded DO blocks (Postgres has no IF NOT EXISTS here)
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'notes_canonical_block_id_fkey'
	) then
		alter table notes
			add constraint notes_canonical_block_id_fkey
			foreign key (canonical_block_id) references page_blocks(id) on delete set null;
	end if;
end $$;

do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'canvas_elements_context_block_id_fkey'
	) then
		alter table canvas_elements
			add constraint canvas_elements_context_block_id_fkey
			foreign key (context_block_id) references page_blocks(id) on delete set null;
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists idx_pages_user_lower_name
	on pages(user_id, lower(name));

create index if not exists idx_pages_user_archived_activity
	on pages(user_id, is_archived, last_activity desc);

create index if not exists idx_notes_page_created
	on notes(page_id, created_at desc);

create index if not exists idx_notes_processing_status
	on notes(processing_status, created_at desc);

create index if not exists idx_notes_cluster
	on notes(cluster_id);

create index if not exists idx_notes_canvas_xy
	on notes(page_id, canvas_x, canvas_y);

create index if not exists idx_notes_tags_gin
	on notes using gin(tags);

create index if not exists idx_notes_metadata_gin
	on notes using gin(metadata);

create index if not exists idx_notes_embedding
	on notes using ivfflat (embedding vector_cosine_ops)
	with (lists = 100);

create index if not exists idx_note_edges_source
	on note_edges(source_id);

create index if not exists idx_note_edges_target
	on note_edges(target_id);

create index if not exists idx_canvas_elements_page_pos
	on canvas_elements(page_id, position_x, position_y);

create index if not exists idx_canvas_elements_context_block
	on canvas_elements(context_block_id);

create index if not exists idx_page_blocks_page_order
	on page_blocks(page_id, order_key);

create index if not exists idx_page_blocks_parent
	on page_blocks(parent_block_id);

create index if not exists idx_page_blocks_type
	on page_blocks(block_type);

create index if not exists idx_page_blocks_not_deleted
	on page_blocks(page_id, is_deleted, order_key);

create index if not exists idx_block_references_block
	on block_references(block_id, start_offset);

create index if not exists idx_block_references_target
	on block_references(ref_type, ref_id);

create index if not exists idx_block_references_metadata
	on block_references using gin(metadata);

create index if not exists idx_inline_embeds_block
	on inline_embeds(block_id);

create index if not exists idx_inline_embeds_targets
	on inline_embeds(target_page_id, target_note_id, target_block_id, target_element_id);

create index if not exists idx_canvas_bindings_block
	on canvas_bindings(page_id, block_id);

create index if not exists idx_page_revisions_page_created
	on page_revisions(page_id, created_at desc);

create index if not exists idx_page_operation_log_page_created
	on page_operation_log(page_id, created_at desc);

create index if not exists idx_layout_cache_page_expires
	on layout_cache(page_id, expires_at);

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------
create or replace function mnemos_set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

do $$
begin
	if not exists (select 1 from pg_trigger where tgname = 'trg_pages_updated_at') then
		create trigger trg_pages_updated_at before update on pages
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_notes_updated_at') then
		create trigger trg_notes_updated_at before update on notes
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_edges_updated_at') then
		create trigger trg_edges_updated_at before update on note_edges
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_clusters_updated_at') then
		create trigger trg_clusters_updated_at before update on clusters
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_canvas_elements_updated_at') then
		create trigger trg_canvas_elements_updated_at before update on canvas_elements
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_chat_history_updated_at') then
		create trigger trg_chat_history_updated_at before update on chat_history
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_settings_updated_at') then
		create trigger trg_settings_updated_at before update on settings
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_agent_runs_updated_at') then
		create trigger trg_agent_runs_updated_at before update on agent_runs
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_page_documents_updated_at') then
		create trigger trg_page_documents_updated_at before update on page_documents
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_page_blocks_updated_at') then
		create trigger trg_page_blocks_updated_at before update on page_blocks
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_inline_embeds_updated_at') then
		create trigger trg_inline_embeds_updated_at before update on inline_embeds
			for each row execute function mnemos_set_updated_at();
	end if;

	if not exists (select 1 from pg_trigger where tgname = 'trg_canvas_bindings_updated_at') then
		create trigger trg_canvas_bindings_updated_at before update on canvas_bindings
			for each row execute function mnemos_set_updated_at();
	end if;
end $$;

-- ---------------------------------------------------------------------------
-- Utility functions for robust in-between insertion and flow maintenance
-- ---------------------------------------------------------------------------
create or replace function mnemos_next_order_key(
	p_page_id uuid,
	p_prev_block_id uuid default null,
	p_next_block_id uuid default null
)
returns numeric
language plpgsql
as $$
declare
	prev_key numeric(30,12);
	next_key numeric(30,12);
	max_key numeric(30,12);
begin
	if p_prev_block_id is not null then
		select order_key
			into prev_key
			from page_blocks
		 where id = p_prev_block_id
			 and page_id = p_page_id;
	end if;

	if p_next_block_id is not null then
		select order_key
			into next_key
			from page_blocks
		 where id = p_next_block_id
			 and page_id = p_page_id;
	end if;

	if prev_key is null and next_key is null then
		select coalesce(max(order_key), 0)
			into max_key
			from page_blocks
		 where page_id = p_page_id
			 and is_deleted = false;
		return max_key + 1000;
	elsif prev_key is null then
		return next_key - 1000;
	elsif next_key is null then
		return prev_key + 1000;
	elsif next_key <= prev_key then
		return prev_key + 0.000001;
	else
		return (prev_key + next_key) / 2;
	end if;
end;
$$;

create or replace function mnemos_rebalance_page_blocks(p_page_id uuid)
returns void
language plpgsql
as $$
begin
	with ranked as (
		select id, row_number() over (order by order_key, created_at, id) as rn
			from page_blocks
		 where page_id = p_page_id
	)
	update page_blocks b
		 set order_key = (ranked.rn * 1000)::numeric(30,12)
		from ranked
	 where b.id = ranked.id;
end;
$$;

create or replace function mnemos_ensure_page_document()
returns trigger
language plpgsql
as $$
begin
	insert into page_documents(page_id, user_id, content_width)
	values (new.id, new.user_id, coalesce(new.content_width, 840))
	on conflict (page_id)
	do update
		set user_id = excluded.user_id,
				content_width = greatest(360, least(2400, excluded.content_width));
	return new;
end;
$$;

do $$
begin
	if not exists (select 1 from pg_trigger where tgname = 'trg_pages_ensure_document') then
		create trigger trg_pages_ensure_document
			after insert on pages
			for each row execute function mnemos_ensure_page_document();
	end if;
end $$;

-- Backfill page_documents for existing pages.
insert into page_documents(page_id, user_id, content_width)
select p.id, p.user_id, coalesce(p.content_width, 840)
from pages p
on conflict (page_id) do nothing;

commit;
