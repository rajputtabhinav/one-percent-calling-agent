# 1% — Digital Human AI Calling Agent

**Architecture Reference** · v1.0 · Single-owner personal platform

A digital human that makes and receives phone calls, holds natural conversations, remembers
everything across calls, reads emotion, adapts personality, and reflects on itself to improve.
Not a SaaS. Not a call center. Not a CRM. One owner.

---

## 1. Design philosophy → engineering decisions

| Priority | Decision |
|---|---|
| Conversation quality | OpenAI Realtime API (speech-to-speech) as the primary voice engine — no STT→LLM→TTS relay for the hot path, so prosody, laughter, hesitation and interruption handling are native. |
| Voice realism | G.711 μ-law passthrough end-to-end (phone network native codec), server-side VAD barge-in with Twilio `clear` + Realtime `response.cancel` + `conversation.item.truncate`, natural-speech prompt contract. |
| Long-term memory | pgvector HNSW semantic memory, scored by `similarity × importance × recency × reinforcement`, injected pre-call, extracted post-call, deduplicated by supersession. |
| Low latency | Single hop: PSTN ⇄ Twilio Media Streams (WS) ⇄ API process ⇄ OpenAI Realtime (WS). No transcoding except μ-law table lookups. Latency measured per turn (speech-stop → first audio byte) and surfaced live. |
| Emotional intelligence | Per-utterance emotion classifier (async sidecar, never blocks audio) feeding a live adaptation loop that rewrites the Realtime session instructions mid-call. |
| Relationship memory | Contact-scoped familiarity/trust scores, relationship event timeline, last-summaries and reflection advice injected into every call with that person. |

**Non-goals:** multi-tenancy, billing, teams, campaign dialers, IVR trees.

---

## 2. System overview

```
                                   ┌───────────────────────────────────────────────┐
                                   │              OWNER'S BROWSER                  │
                                   │   Next.js 15 · TypeScript · Tailwind · shadcn │
                                   │   Dashboard │ Live Call Screen │ Settings …   │
                                   └────────┬───────────────────────────┬──────────┘
                                            │ HTTPS /api/* (proxied)    │ WSS /ws/dashboard (ticket auth)
                                            ▼                           ▼
┌──────────────┐  REST + Webhooks  ┌────────────────────────────────────────────────┐
│   Twilio     │◄─────────────────►│                API  (Fastify 5)                │
│  (telephony) │  WSS media stream │ ┌────────────┐ ┌──────────────┐ ┌────────────┐ │
└──────────────┘◄─────────────────►│ │ Telephony  │ │  Realtime    │ │   Voice    │ │
┌──────────────┐                   │ │ Abstraction│ │  Call        │ │ Abstraction│ │
│   Exotel     │◄─────────────────►│ │ twilio     │ │  Orchestrator│ │ openai-    │ │
│  (telephony) │                   │ │ exotel     │ │  (session,   │ │ realtime   │ │
└──────────────┘                   │ │ sip (stub) │ │  barge-in,   │ │ (g711_ulaw)│ │
┌──────────────┐    WSS realtime   │ └────────────┘ │  tools,      │ └────────────┘ │
│ OpenAI       │◄─────────────────►│ ┌────────────┐ │  latency)    │ ┌────────────┐ │
│ Realtime/REST│                   │ │ Engines:   │ └──────────────┘ │ Jobs       │ │
└──────────────┘                   │ │ memory ·   │ ┌──────────────┐ │ (BullMQ)   │ │
                                   │ │ emotion ·  │ │ Dashboard WS │ │ post-call  │ │
                                   │ │ personality│ │ hub (live    │ │ pipeline   │ │
                                   │ │ relationship│ │ events)      │ └────────────┘ │
                                   │ │ reflection │ └──────────────┘                 │
                                   │ │ knowledge  │                                  │
                                   │ └────────────┘                                  │
                                   └───────┬───────────────────┬─────────────────────┘
                                           ▼                   ▼
                                ┌─────────────────┐   ┌─────────────────┐   ┌──────────────┐
                                │ PostgreSQL 16   │   │     Redis 7     │   │ ./storage    │
                                │ + pgvector      │   │ sessions · jobs │   │ recordings · │
                                │ (system of      │   │ call prep cache │   │ uploads      │
                                │  record + RAG)  │   │ pub/sub         │   │ (local disk) │
                                └─────────────────┘   └─────────────────┘   └──────────────┘
```

Everything runs in Docker Compose on the owner's machine/VPS. A tunnel (cloudflared/ngrok) or a
public host exposes `PUBLIC_BASE_URL` for telephony webhooks and media WebSockets.

### Monorepo layout

```
1%/
├── apps/
│   ├── api/                      # Fastify 5 backend (TypeScript, CJS build via tsup)
│   │   ├── migrations/           # Plain SQL migrations, applied on boot
│   │   ├── src/
│   │   │   ├── ai/               # OpenAI clients, prompt builder, emotion/summarize/reflect/extract
│   │   │   ├── auth/             # Single-owner auth (argon2id, Redis sessions)
│   │   │   ├── db/               # pg pool + migration runner
│   │   │   ├── jobs/             # BullMQ queue + post-call worker pipeline
│   │   │   ├── lib/              # crypto (AES-256-GCM), g711, phone, tokens, audit, logger
│   │   │   ├── modules/          # contacts, calls, recordings, transcripts, memories,
│   │   │   │                     # personalities, knowledge, reflections, analytics, settings
│   │   │   ├── realtime/         # CallSession orchestrator, session manager, dashboard WS hub
│   │   │   ├── telephony/        # provider abstraction: twilio, exotel, sip + webhook routes
│   │   │   └── voice/            # voice provider abstraction: openai-realtime session
│   │   └── test/                 # vitest unit + route tests
│   └── web/                      # Next.js 15 App Router frontend
│       └── src/
│           ├── app/(auth)/       # /login, /setup
│           ├── app/(app)/        # dashboard, calls, recordings, transcripts, memories,
│           │                     # knowledge, personalities, analytics, settings
│           ├── components/ui/    # shadcn-style primitives (owned, Radix-based)
│           ├── components/       # domain components (live transcript, emotion meter, …)
│           └── lib/              # API client, dashboard WS client, formatters
├── packages/
│   └── shared/                   # zod schemas, DTOs, WS event protocol, enums (single source of truth)
├── docs/                         # ARCHITECTURE, API, DEPLOYMENT, TESTING, ROADMAP
├── storage/                      # recordings/, uploads/ (gitignored, volume-mounted)
└── docker-compose.yml            # db (pgvector), redis, api, web
```

---

## 3. The live call pipeline (the heart)

### 3.1 Outbound call sequence

```
Owner UI          API                        Twilio                 OpenAI Realtime
  │  POST /calls    │                           │                        │
  ├────────────────►│ 1. create call row        │                        │
  │                 │ 2. PREP: contact, memories│                        │
  │                 │    relationship, advice,  │                        │
  │                 │    personality → system   │                        │
  │                 │    prompt → Redis cache   │                        │
  │                 │ 3. calls.create(to,from,  │                        │
  │                 │    url=/webhooks/twilio/  │                        │
  │                 │    voice/outbound)        │                        │
  │                 ├──────────────────────────►│  dials PSTN            │
  │                 │ 4. answered → TwiML       │                        │
  │                 │◄──────────────────────────┤                        │
  │                 │  <Connect><Stream wss://  │                        │
  │                 │   …/ws/twilio-media?      │                        │
  │                 │   callId&token>           │                        │
  │                 │ 5. media WS connects      │                        │
  │                 │◄══════════════════════════╡                        │
  │                 │ 6. open Realtime WS, send session.update           │
  │                 │    (instructions, voice, g711_ulaw, server_vad,    │
  │                 │     tools)                ├───────────────────────►│
  │                 │ 7. μ-law frames ⇄ both ways (base64 passthrough)   │
  │  live events    │ 8. transcripts, emotion, thoughts, latency         │
  │◄════════════════╡    → dashboard WS + call_events table              │
```

### 3.2 In-call event loop (orchestrator responsibilities)

| Trigger | Action |
|---|---|
| Twilio `media` | Forward μ-law b64 → Realtime `input_audio_buffer.append`. |
| Realtime `response.audio.delta` | Forward → Twilio `media` (+ `mark` every flush for playback tracking). Record first-byte latency vs. last `speech_stopped`. |
| Realtime `speech_started` (user barge-in) | If assistant speaking: Twilio `clear`, Realtime `response.cancel`, `conversation.item.truncate` at last played ms. |
| `input_audio_transcription.completed` | Persist human transcript segment → async emotion classify → adaptation check → strategist thought. |
| `response.audio_transcript.done` / `response.done` | Persist AI segment, token usage; if `end_call` pending → hang up. |
| `response.function_call_arguments.done` | Execute tool (`search_memory`, `save_memory`, `search_knowledge`, `log_follow_up`, `end_call`), emit `function_call_output`, `response.create`. Broadcast as AI thought. |
| Emotion shift detected | Cooldown-gated `session.update` appending an adaptation directive ("caller sounds frustrated — slow down, acknowledge"). |
| Twilio `stop` / status `completed` | Finalize: durations, latency avg, tokens → enqueue post-call pipeline. |

### 3.3 Latency budget (target ≤ 1.2 s perceived turn gap)

| Leg | Budget |
|---|---|
| PSTN → Twilio → API (media frame) | ~150 ms |
| Realtime VAD end-of-speech detection | ~500 ms (configurable `silence_duration_ms`) |
| Realtime first audio token | ~300–500 ms |
| API → Twilio → PSTN playback start | ~150 ms |

Measured per turn as `speech_stopped → first response.audio.delta`, averaged into `calls.latency_ms_avg`, streamed live to the call screen.

### 3.4 Post-call pipeline (BullMQ, sequential steps, idempotent upserts)

```
call completed ──► [summarize] ──► [extract memories] ──► [reflect] ──► [update relationship] ──► [analytics rollup]
                    gpt-4o JSON     dedupe/supersede        scores +      familiarity/trust        analytics_daily
                    summary, key    embed (1536d)           advice        deltas + timeline        upsert
                    points,                                 (embedded     event
                    follow-ups                              for reuse)
```

Every step writes its own table; a failure mid-pipeline is retried by BullMQ and never loses the recording/transcript.

---

## 4. Engines

### 4.1 Memory engine
- **Store:** `memories` rows — kind (`fact|preference|event|relationship|identity|commitment|other`), content, importance (0–1), confidence, `vector(1536)` embedding (`text-embedding-3-small`), contact scope, source call.
- **Write paths:** post-call extraction (LLM with strict JSON schema), in-call `save_memory` tool, manual CRUD in UI.
- **Read path (pre-call + in-call tool):** `score = 0.55·cosine + 0.25·importance + 0.15·recency(half-life) + 0.05·log(1+references)`; top-K (default 12) injected into the system prompt; each retrieval bumps `reference_count`/`last_referenced_at` (reinforcement).
- **Supersession:** extraction marks contradicted memories inactive via `supersedes_id` instead of deleting — full audit trail.

### 4.2 Relationship engine
- `contacts.familiarity_score` grows with talk time and conversational depth (log-capped, 0–100); `trust_score` moves with reflection sentiment and kept/missed commitments.
- `relationship_events` timeline (first call, milestones, score deltas, notable moments) — rendered in UI and summarized into the prompt ("you have spoken 14 times; last week she mentioned her exam").

### 4.3 Emotion engine
- Sidecar classifier (`gpt-4o-mini`, strict JSON) per finalized human utterance → label (happy/angry/excited/frustrated/stressed/confused/sad/neutral), intensity, valence, arousal.
- Persisted on the segment + `call_events`; aggregated into `calls.emotion_timeline`.
- **Adaptation loop:** significant shifts (cooldown 20 s) rewrite Realtime instructions live; the change is broadcast as an "adaptation" thought so the owner sees *why* the AI changed tone.

### 4.4 Personality engine
- `personalities` rows: system prompt block, speaking style sliders (pace, warmth, formality, humor, empathy), Realtime voice id.
- Five built-ins seeded (Professional, Friendly, Casual, Technical, Advisor); unlimited custom ones; per-call override at dial time; default in Settings.

### 4.5 Reflection engine
- Post-call LLM critique → what worked, what failed, missed opportunities, memory-usage assessment, emotion-read assessment, numeric scores (conversation quality, emotional intelligence, memory effectiveness, goal completion) + **one reusable advice paragraph**, embedded.
- Next call with that contact (or globally) retrieves top advice by similarity to the call goal → the agent literally learns from its own mistakes.

### 4.6 Knowledge base
- Upload PDF/DOCX/TXT/MD → parse (pdf-parse / mammoth) → paragraph-aware chunking (~1,800 chars, 300 overlap) → embed → `document_chunks`.
- In-call `search_knowledge` tool + Knowledge page test-search. Doc titles are listed in the prompt so the model knows what it *can* look up.

---

## 5. Voice & telephony abstraction

```ts
// voice/types.ts
interface VoiceSession {
  start(opts: VoiceSessionOptions): Promise<void>;   // instructions, voice, tools, audio codec
  sendAudio(b64: string): void;                       // caller → model
  on(event: VoiceEvent, handler): void;               // audio.delta, transcript.*, tool_call, vad.*, error, closed
  updateInstructions(append: string): void;           // live adaptation
  cancelResponse(): void; truncatePlayback(ms): void; // barge-in
  close(): Promise<void>;
}
```
Primary implementation: **OpenAIRealtimeVoice** (`g711_ulaw` in/out, server VAD, function tools).
The interface is codec-explicit so an ElevenLabs/Cartesia pipeline provider can be added without touching the orchestrator.

```ts
// telephony/types.ts
interface TelephonyProvider {
  name: 'twilio' | 'exotel' | 'sip';
  startOutboundCall(req): Promise<{ providerCallId }>;
  hangup(providerCallId): Promise<void>;
  startRecording?(providerCallId): Promise<void>;
  verifyWebhook(req): boolean;                        // signature validation
}
```
- **Twilio** (complete): REST dial, `<Connect><Stream>` bidirectional media, dual-channel call recording + download, signature validation, status callbacks.
- **Exotel** (complete): Connect API dial into a Voicebot-applet flow, bidirectional WS (16-bit 8 kHz PCM ⇄ μ-law transcode via in-process G.711 tables), Passthru status callbacks.
- **SIP** (stub): interface-conformant placeholder with a documented drachtio/Asterisk integration path (μ-law RTP maps 1:1 onto the existing pipeline).

Media WebSockets authenticate with short-lived HMAC tokens minted per call (telephony providers can't send cookies).

---

## 6. Database schema (PostgreSQL 16 + pgvector)

Full DDL lives in `apps/api/migrations/0001_init.sql`. Entity map:

```
owner ─1:1─ (the single user)
contacts ──< calls ──1:1── recordings
   │           ├──< transcript_segments (tsvector FTS)
   │           ├──< call_events (live-screen replay)
   │           ├──1:1── call_summaries
   │           └──1:1── reflections (advice_embedding vector)
   ├──< memories (embedding vector, supersession chain)
   └──< relationship_events
personalities ──< calls
documents ──< document_chunks (embedding vector)
audit_logs · analytics_daily · settings · secrets · schema_migrations
```

| Table | Purpose / notable columns |
|---|---|
| `owner` | Single row. `username`, `password_hash` (argon2id), `display_name`, `agent_name` (what the digital human calls itself). |
| `secrets` | Provider API keys, AES-256-GCM encrypted (`iv`,`tag`,`data`) under `MASTER_KEY`. Never returned unmasked. |
| `settings` | Key→JSONB overrides (models, voice, recording, memory knobs, prompt template, inbound policy, disclosure mode). |
| `contacts` | `phone_e164` unique, relationship label, notes, `familiarity_score`, `trust_score`, interaction counters, first/last interaction. |
| `relationship_events` | Timeline: kind, description, score deltas, optional call link. |
| `personalities` | `system_prompt`, `style` JSONB (pace/warmth/formality/humor/empathy 0–1), `voice`, `is_builtin`. |
| `calls` | direction, status, provider + `provider_call_sid`, numbers, contact, personality, `goal`, timestamps, `duration_seconds`, `emotion_timeline` JSONB, `latency_ms_avg`, `tokens_used`, `quality_score`, `metadata`. |
| `recordings` | provider sid, local `file_path`, duration, size, channels, status. |
| `transcript_segments` | `speaker` (`human|ai`), text, `started_ms/ended_ms` offsets, per-utterance `emotion` JSONB, generated `ts tsvector` + GIN index for search. |
| `call_events` | Append-only live-screen events (`thought|memory_recall|tool_call|emotion|adaptation|latency|state`) with `ts_ms`, JSONB payload — powers replay. |
| `call_summaries` | summary, `key_points`, `follow_ups`, `important_memories` JSONB. |
| `memories` | kind, content, importance, confidence, `embedding vector(1536)` (HNSW cosine), contact scope, `supersedes_id`, `is_active`, reinforcement counters. |
| `reflections` | went_well/went_poorly/missed_opportunities JSONB, assessments, `scores` JSONB, `advice` + `advice_embedding vector(1536)`. |
| `documents` / `document_chunks` | KB files; chunks with `embedding vector(1536)` HNSW. |
| `audit_logs` | action, resource, ip, UA, detail JSONB. |
| `analytics_daily` | per-day rollup: call counts, talk time, avg quality, emotion distribution, memories created, tokens. |

**Indexes:** HNSW (`vector_cosine_ops`) on all three embedding columns; GIN on transcript tsvector; btree on `calls(started_at desc)`, `calls(contact_id)`, `memories(contact_id, is_active)`, `call_events(call_id, ts_ms)`.

**Sessions** live in Redis (`sess:{sid}`, 30-day sliding TTL), not Postgres. Call-prep context is cached in Redis (`callprep:{callId}`, 15 min TTL) so webhooks answer TwiML in <50 ms.

---

## 7. API surface (contract detail in `docs/API.md`)

- REST under `/api/v1` — auth, contacts, personalities, calls (+initiate/hangup), recordings (+ranged audio streaming), transcripts (+FTS search), memories (+semantic search), knowledge (+upload/search), reflections, analytics, settings/secrets, audit.
- Webhooks under `/webhooks/{twilio|exotel}/…` — signature-validated, form-encoded.
- WebSockets: `/ws/dashboard` (ticket-auth live events), `/ws/twilio-media`, `/ws/exotel-media` (HMAC call tokens).
- All request/response DTOs and WS events are zod schemas in `packages/shared` — the API validates with them and the web app imports the inferred types. One source of truth.

---

## 8. Security model

| Layer | Implementation |
|---|---|
| AuthN | Single owner, first-run `/setup` creates the account. argon2id hashes. Opaque session id in httpOnly/SameSite=Lax signed cookie → Redis. |
| AuthZ | Everything under `/api/v1` requires the session (except auth + webhooks). Single-tenant: no roles. |
| Secrets at rest | AES-256-GCM with 32-byte `MASTER_KEY` (env). Stored per-key with fresh IV + auth tag. UI shows masked previews only. |
| Webhooks | Twilio HMAC-SHA1 signature validation against `PUBLIC_BASE_URL`; Exotel token check; media WS short-lived HMAC tokens; dashboard WS 60 s tickets. |
| Rate limiting | Global 300 req/min/IP; `/auth/login` 5/min (brute-force guard). |
| Audit | Every auth event and mutating request → `audit_logs` (action, resource, ip, UA). Viewable in Settings. |
| Transport | TLS terminated by the tunnel/reverse proxy; cookies `Secure` when `PUBLIC_BASE_URL` is https. |
| Compliance posture | Recording announcement toggle, AI-disclosure policy (`on_ask` default: never lies about being an AI when asked directly). The owner is responsible for local call-recording/disclosure law. |

---

## 9. Technology choices — rationale

| Choice | Why |
|---|---|
| OpenAI Realtime (speech-to-speech) over STT→LLM→TTS | 1 model hop instead of 3; native prosody/interruptions; μ-law support matches PSTN exactly. The voice abstraction keeps the relay option open. |
| Fastify 5 | First-class WebSocket + hooks, fastest Node HTTP framework, schema-driven validation fits zod contracts. |
| Plain SQL migrations + `pg` | pgvector operators (`<=>`), generated tsvector columns and HNSW indexes are first-class in SQL; no ORM impedance for a single-owner schema. |
| Redis + BullMQ | Sessions, prep cache, and a real job pipeline with retries for the post-call chain. |
| BullMQ workers in-process | One container to operate for one owner; the queue boundary still allows extracting a worker container later (documented in ROADMAP). |
| Next.js App Router, all-client data pages + SWR | The app is a real-time cockpit behind auth — client fetching + WS push fits better than RSC caching. `/api` proxied through Next rewrites so cookies stay same-origin. |
| WebRTC path | Reserved via Twilio Voice JS SDK (rides Twilio's WebRTC infra — no custom SFU). Dashboard realtime is WebSocket in v1; the browser softphone is ROADMAP P1. |

---

## 10. Failure modes & handling

| Failure | Behavior |
|---|---|
| OpenAI Realtime WS drops mid-call | One reconnect attempt with context re-prime; on failure: polite TwiML `<Say>` apology + graceful hangup; call marked `failed` with error. |
| Telephony webhook unreachable (tunnel down) | Call never connects; status callbacks reconcile on next delivery; UI shows actionable error. |
| Post-call job crash | BullMQ retry ×3 exponential; failed jobs visible in logs; pipeline steps are idempotent upserts. |
| No OpenAI key configured | Calls refuse to start with a clear settings-link error; KB upload parks documents in `failed` with reason. |
| Emotion/strategist sidecar errors | Swallowed + logged — never block the audio path. |
| Postgres down | Health endpoint reports degraded; API refuses new calls; active call audio path keeps running (DB writes buffered to call end where possible). |
```
