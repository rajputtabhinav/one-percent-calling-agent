-- 1% · Digital Human AI Calling Agent · initial schema
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Single owner ─────────────────────────────────────────────────────────────
CREATE TABLE owner (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text NOT NULL DEFAULT 'Owner',
  agent_name    text NOT NULL DEFAULT 'Aarav',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Encrypted secrets (AES-256-GCM under MASTER_KEY) ─────────────────────────
CREATE TABLE secrets (
  key        text PRIMARY KEY,
  iv         text NOT NULL,
  tag        text NOT NULL,
  data       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Settings overrides (defaults live in code) ───────────────────────────────
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Contacts & relationship engine ───────────────────────────────────────────
CREATE TABLE contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  phone_e164           text NOT NULL UNIQUE,
  relationship_label   text,
  notes                text,
  familiarity_score    real NOT NULL DEFAULT 0,
  trust_score          real NOT NULL DEFAULT 50,
  interaction_count    integer NOT NULL DEFAULT 0,
  first_interaction_at timestamptz,
  last_interaction_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_name_trgm_idx ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX contacts_last_interaction_idx ON contacts (last_interaction_at DESC NULLS LAST);

CREATE TABLE relationship_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  call_id           uuid,
  kind              text NOT NULL,
  description       text NOT NULL,
  delta_familiarity real NOT NULL DEFAULT 0,
  delta_trust       real NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX relationship_events_contact_idx ON relationship_events (contact_id, created_at DESC);

-- ── Personalities ────────────────────────────────────────────────────────────
CREATE TABLE personalities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL UNIQUE,
  description   text NOT NULL DEFAULT '',
  system_prompt text NOT NULL,
  style         jsonb NOT NULL DEFAULT '{"pace":0.5,"warmth":0.5,"formality":0.5,"humor":0.3,"empathy":0.6}',
  voice         text NOT NULL DEFAULT 'marin',
  is_builtin    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Calls ────────────────────────────────────────────────────────────────────
CREATE TABLE calls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction         text NOT NULL CHECK (direction IN ('inbound','outbound')),
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','ringing','in_progress','completed','failed','no_answer','busy','canceled')),
  provider          text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio','exotel','sip')),
  provider_call_sid text,
  contact_id        uuid REFERENCES contacts(id) ON DELETE SET NULL,
  from_number       text NOT NULL DEFAULT '',
  to_number         text NOT NULL DEFAULT '',
  personality_id    uuid REFERENCES personalities(id) ON DELETE SET NULL,
  goal              text,
  started_at        timestamptz,
  answered_at       timestamptz,
  ended_at          timestamptz,
  duration_seconds  integer NOT NULL DEFAULT 0,
  latency_ms_avg    integer,
  tokens_used       integer NOT NULL DEFAULT 0,
  quality_score     real,
  emotion_timeline  jsonb NOT NULL DEFAULT '[]',
  error             text,
  metadata          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calls_created_idx ON calls (created_at DESC);
CREATE INDEX calls_contact_idx ON calls (contact_id, created_at DESC);
CREATE INDEX calls_provider_sid_idx ON calls (provider_call_sid);
CREATE INDEX calls_status_idx ON calls (status);

-- ── Recordings ───────────────────────────────────────────────────────────────
CREATE TABLE recordings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                uuid NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
  provider_recording_sid text,
  file_path              text,
  duration_seconds       integer NOT NULL DEFAULT 0,
  size_bytes             bigint NOT NULL DEFAULT 0,
  channels               integer NOT NULL DEFAULT 2,
  format                 text NOT NULL DEFAULT 'wav',
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- ── Transcripts ──────────────────────────────────────────────────────────────
CREATE TABLE transcript_segments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  seq        integer NOT NULL,
  speaker    text NOT NULL CHECK (speaker IN ('human','ai')),
  text       text NOT NULL,
  started_ms integer NOT NULL DEFAULT 0,
  ended_ms   integer,
  emotion    jsonb,
  ts         tsvector GENERATED ALWAYS AS (to_tsvector('simple', text)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, seq)
);
CREATE INDEX transcript_segments_call_idx ON transcript_segments (call_id, seq);
CREATE INDEX transcript_segments_ts_idx ON transcript_segments USING gin (ts);

-- ── Live-screen event log (replay) ───────────────────────────────────────────
CREATE TABLE call_events (
  id         bigserial PRIMARY KEY,
  call_id    uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  ts_ms      integer NOT NULL,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_events_call_idx ON call_events (call_id, ts_ms);

-- ── Summaries ────────────────────────────────────────────────────────────────
CREATE TABLE call_summaries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            uuid NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
  summary            text NOT NULL,
  key_points         jsonb NOT NULL DEFAULT '[]',
  follow_ups         jsonb NOT NULL DEFAULT '[]',
  important_memories jsonb NOT NULL DEFAULT '[]',
  model              text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── Long-term memory ─────────────────────────────────────────────────────────
CREATE TABLE memories (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id         uuid REFERENCES contacts(id) ON DELETE CASCADE,
  kind               text NOT NULL DEFAULT 'fact'
                     CHECK (kind IN ('fact','preference','event','relationship','identity','commitment','other')),
  content            text NOT NULL,
  importance         real NOT NULL DEFAULT 0.5,
  confidence         real NOT NULL DEFAULT 0.9,
  embedding          vector(1536),
  source_call_id     uuid REFERENCES calls(id) ON DELETE SET NULL,
  last_referenced_at timestamptz,
  reference_count    integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  supersedes_id      uuid REFERENCES memories(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memories_contact_idx ON memories (contact_id, is_active, created_at DESC);
CREATE INDEX memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);

-- ── Reflections (self-improvement) ───────────────────────────────────────────
CREATE TABLE reflections (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id              uuid NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
  went_well            jsonb NOT NULL DEFAULT '[]',
  went_poorly          jsonb NOT NULL DEFAULT '[]',
  missed_opportunities jsonb NOT NULL DEFAULT '[]',
  memory_assessment    text NOT NULL DEFAULT '',
  emotion_assessment   text NOT NULL DEFAULT '',
  advice               text NOT NULL DEFAULT '',
  advice_embedding     vector(1536),
  scores               jsonb NOT NULL DEFAULT '{}',
  model                text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reflections_advice_embedding_idx ON reflections USING hnsw (advice_embedding vector_cosine_ops);

-- ── Knowledge base ───────────────────────────────────────────────────────────
CREATE TABLE documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  filename    text NOT NULL,
  mime        text NOT NULL,
  size_bytes  bigint NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','failed')),
  error       text,
  chunk_count integer NOT NULL DEFAULT 0,
  file_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  seq         integer NOT NULL,
  content     text NOT NULL,
  token_count integer NOT NULL DEFAULT 0,
  embedding   vector(1536),
  UNIQUE (document_id, seq)
);
CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- ── Audit & analytics ────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  owner_id    uuid,
  action      text NOT NULL,
  resource    text NOT NULL DEFAULT '',
  resource_id text,
  ip          text,
  user_agent  text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);

CREATE TABLE analytics_daily (
  day               date PRIMARY KEY,
  calls_total       integer NOT NULL DEFAULT 0,
  calls_inbound     integer NOT NULL DEFAULT 0,
  calls_outbound    integer NOT NULL DEFAULT 0,
  duration_total_s  integer NOT NULL DEFAULT 0,
  avg_quality       real,
  emotions          jsonb NOT NULL DEFAULT '{}',
  memories_created  integer NOT NULL DEFAULT 0,
  tokens_used       integer NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
