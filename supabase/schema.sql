-- Munir database schema. Run once in the Supabase SQL editor.
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists sources (
  id text primary key,
  title text not null,
  author text,
  publisher text,
  lang text not null default 'en',
  license text,
  url text,
  pages int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists chunks (
  id text primary key,
  source_id text not null references sources(id) on delete cascade,
  path text,
  page int,
  lang text not null default 'en',
  text text not null,
  tsv tsvector generated always as (to_tsvector('english', coalesce(path,'') || ' ' || text)) stored,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists chunks_tsv_idx on chunks using gin (tsv);
create index if not exists chunks_emb_idx on chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_source_idx on chunks (source_id);

create table if not exists verified_answers (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  q_canon text not null,
  q_ar text,
  q_embedding vector(1536),
  answer text not null,
  answer_lang text not null default 'ar',
  answer_en text not null,
  translations jsonb not null default '{}'::jsonb,
  source_title text not null,
  source_locator text,
  source_quote text not null check (length(trim(source_quote)) > 0),
  author_name text not null,
  status text not null default 'published' check (status in ('published','withdrawn')),
  verification jsonb,
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists va_emb_idx on verified_answers using hnsw (q_embedding vector_cosine_ops);

create table if not exists notebooks (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  lang text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists claims (
  nonce text primary key,
  session_id text not null,
  code text unique not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  session_id text,
  notebook_id uuid references notebooks(id) on delete set null,
  kiosk text,
  lang text,
  q_text text,
  q_en text,
  q_ar text,
  tier text not null,
  level text,
  stage text,
  nusuk text,
  answer jsonb,
  chunk_ids text[],
  va_id uuid,
  latency jsonb,
  flags jsonb,
  is_eval boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists interactions_session_idx on interactions (session_id);
create index if not exists interactions_notebook_idx on interactions (notebook_id);
create index if not exists interactions_created_idx on interactions (created_at desc);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid references interactions(id) on delete set null,
  notebook_id uuid references notebooks(id) on delete set null,
  session_id text,
  q_text text,
  q_en text,
  q_ar text,
  lang text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  va_id uuid references verified_answers(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists tickets_status_idx on tickets (status, created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor text,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists eval_results (
  case_id text not null,
  run int not null,
  system text not null,
  tier text,
  payload jsonb,
  created_at timestamptz not null default now(),
  primary key (case_id, run, system)
);

-- The app talks to the database only from the server with the service role key.
-- Row Level Security is enabled with no policies, so the public anon key can read nothing.
alter table sources enable row level security;
alter table chunks enable row level security;
alter table verified_answers enable row level security;
alter table notebooks enable row level security;
alter table claims enable row level security;
alter table interactions enable row level security;
alter table tickets enable row level security;
alter table reports enable row level security;
alter table audit_log enable row level security;
alter table eval_results enable row level security;

create or replace function match_chunks(q vector(1536), k int)
returns table (id text, source_id text, path text, page int, text text, similarity float)
language sql stable as $$
  select c.id, c.source_id, c.path, c.page, c.text, 1 - (c.embedding <=> q) as similarity
  from chunks c join sources s on s.id = c.source_id
  where s.active and c.embedding is not null
  order by c.embedding <=> q
  limit k;
$$;

-- Keyword search. Terms are OR-ed (a long natural question rarely contains every term of the passage)
-- and ranked by cover density, so passages matching more of the question come first.
create or replace function search_chunks(q text, k int)
returns table (id text, source_id text, path text, page int, text text, rank float)
language sql stable as $$
  with query as (
    select nullif(replace(plainto_tsquery('english', q)::text, '&', '|'), '')::tsquery as tsq
  )
  select c.id, c.source_id, c.path, c.page, c.text, ts_rank_cd(c.tsv, query.tsq)::float as rank
  from chunks c join sources s on s.id = c.source_id, query
  where s.active and query.tsq is not null and c.tsv @@ query.tsq
  order by rank desc
  limit k;
$$;

create or replace function match_verified(q vector(1536), k int)
returns table (id uuid, code text, q_canon text, answer text, answer_lang text, answer_en text, translations jsonb,
               source_title text, source_locator text, source_quote text, author_name text, similarity float)
language sql stable as $$
  select v.id, v.code, v.q_canon, v.answer, v.answer_lang, v.answer_en, v.translations,
         v.source_title, v.source_locator, v.source_quote, v.author_name, 1 - (v.q_embedding <=> q) as similarity
  from verified_answers v
  where v.status = 'published' and v.q_embedding is not null
  order by v.q_embedding <=> q
  limit k;
$$;
