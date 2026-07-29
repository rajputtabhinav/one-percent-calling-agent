# API Contracts

Base URL: `{PUBLIC_BASE_URL}` · REST under `/api/v1` · JSON unless noted.
All DTOs are zod schemas in `packages/shared/src` — this document is the human-readable view.

**Auth:** session cookie `dh_session` (httpOnly, signed). All `/api/v1/*` routes require it except `auth/*`. Webhooks and media WS use their own validation. Errors: `{ "error": { "code": string, "message": string } }` with 4xx/5xx.

## Auth

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/v1/auth/status` | → `{ needsSetup: boolean, authenticated: boolean }` |
| POST | `/api/v1/auth/setup` | `{ username, password, displayName?, agentName? }` → `{ owner }` · 403 once owner exists |
| POST | `/api/v1/auth/login` | `{ username, password }` → `{ owner }` + sets cookie · rate-limited 5/min |
| POST | `/api/v1/auth/logout` | → `{ ok: true }` + clears cookie |
| GET | `/api/v1/auth/me` | → `{ owner: { id, username, displayName, agentName } }` |
| POST | `/api/v1/auth/ws-ticket` | → `{ ticket }` (60 s, single purpose: dashboard WS) |

## Contacts

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/contacts?q&sort&limit&offset` | search name/phone, sort `recent|familiarity|name` |
| POST | `/api/v1/contacts` | `{ name, phone, relationshipLabel?, notes? }` (phone normalized to E.164) |
| GET | `/api/v1/contacts/:id` | includes scores + counters |
| PATCH | `/api/v1/contacts/:id` | partial update |
| DELETE | `/api/v1/contacts/:id` | cascades memories/events (calls kept, contact nulled) |
| GET | `/api/v1/contacts/:id/timeline` | relationship_events newest-first |

## Calls

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/calls` | `{ to, contactId?, personalityId?, goal?, record? }` → `{ call }` (dials immediately) |
| GET | `/api/v1/calls?direction&status&contactId&q&from&to&limit&offset` | `q` searches transcript FTS + numbers |
| GET | `/api/v1/calls/:id` | call + contact + personality + summary + reflection presence flags |
| POST | `/api/v1/calls/:id/hangup` | ends an active call |
| GET | `/api/v1/calls/:id/transcript` | ordered segments |
| GET | `/api/v1/calls/:id/events` | call_events for live-screen replay |
| GET | `/api/v1/calls/:id/summary` | 404 until post-call pipeline finishes |
| GET | `/api/v1/calls/:id/reflection` | reflection report |
| GET | `/api/v1/calls/active` | currently live calls (from session manager) |

## Recordings

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/recordings?limit&offset` | joined with call + contact |
| GET | `/api/v1/recordings/:id` | metadata |
| GET | `/api/v1/recordings/:id/audio` | audio bytes, supports `Range` (seekable `<audio>`) |
| DELETE | `/api/v1/recordings/:id` | removes file + row |

## Transcripts

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/transcripts/search?q&limit` | Postgres FTS (`websearch_to_tsquery`) with `ts_headline` snippets, grouped by call |

## Memories

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/memories?contactId&kind&q&active&limit&offset` | `q` = semantic search (embeds query) |
| POST | `/api/v1/memories` | `{ content, kind, contactId?, importance? }` (embeds on write) |
| PATCH | `/api/v1/memories/:id` | edit content (re-embeds) / importance / active |
| DELETE | `/api/v1/memories/:id` | hard delete |

## Personalities

CRUD at `/api/v1/personalities` · `{ name, description, systemPrompt, style: { pace, warmth, formality, humor, empathy }, voice }` · built-ins are editable but not deletable.

## Knowledge

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/knowledge/upload` | multipart file (pdf/docx/txt/md, ≤25 MB) → `{ document }` (async processing) |
| GET | `/api/v1/knowledge` | documents with status/chunk counts |
| DELETE | `/api/v1/knowledge/:id` | document + chunks |
| GET | `/api/v1/knowledge/search?q&limit` | semantic chunk search with doc titles |

## Analytics

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/analytics/overview` | totals, avg duration, avg quality, memory counts, relationship aggregates |
| GET | `/api/v1/analytics/timeseries?days=30` | per-day calls in/out, talk seconds |
| GET | `/api/v1/analytics/emotions?days=30` | emotion distribution over time |
| GET | `/api/v1/analytics/quality?days=90` | reflection score trends (quality, EQ, memory effectiveness) |
| GET | `/api/v1/analytics/relationships` | top contacts by familiarity/trust + growth |

## Settings & secrets

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/settings` | full effective settings (defaults ⊕ overrides) |
| PUT | `/api/v1/settings` | partial deep-merge of known keys (zod-validated) |
| GET | `/api/v1/settings/secrets` | `{ key, configured, preview }[]` — never plaintext |
| PUT | `/api/v1/settings/secrets` | `{ key, value }` (encrypts) · empty value deletes |
| GET | `/api/v1/settings/audit?limit&offset` | audit log page |
| GET | `/api/v1/health` | `{ ok, db, redis, version }` (no auth) |

### Settings keys (defaults in `shared/settings.ts`)

`telephony.provider` (`twilio|exotel`), `telephony.fromNumber`, `telephony.defaultCountryCode` (`+91`),
`voice.voice` (`marin`), `voice.realtimeModel` (`gpt-realtime`),
`ai.chatModel` (`gpt-4o`), `ai.miniModel` (`gpt-4o-mini`), `ai.embeddingModel` (`text-embedding-3-small`),
`ai.disclosure` (`on_ask|always|never`), `ai.strategist` (bool), `ai.temperature`,
`call.record` (bool), `call.announceRecording` (bool), `call.maxDurationMinutes`,
`inbound.enabled`, `inbound.unknownPolicy` (`allow|reject`), `inbound.greetingHint`,
`memory.autoCapture`, `memory.maxInjected`, `memory.minImportance`, `memory.halfLifeDays`,
`prompt.identityTemplate` (owner-editable system prompt skeleton), `personality.defaultId`.

### Secret keys

`openai.apiKey`, `twilio.accountSid`, `twilio.authToken`, `exotel.sid`, `exotel.apiKey`, `exotel.apiToken`, `exotel.subdomain`.

## Webhooks (no session; provider validation)

| Path | Source | Purpose |
|---|---|---|
| POST `/webhooks/twilio/voice/outbound?callId=` | Twilio | answered → TwiML `<Connect><Stream>` (+ optional recording announcement) |
| POST `/webhooks/twilio/voice/inbound` | Twilio | inbound call → resolve contact, prep, TwiML stream |
| POST `/webhooks/twilio/status?callId=` | Twilio | lifecycle: initiated/ringing/answered/completed |
| POST `/webhooks/twilio/recording?callId=` | Twilio | recording ready → download to storage |
| POST `/webhooks/exotel/passthru` | Exotel | status reconciliation |
| GET/POST `/webhooks/exotel/voicebot?callId=` | Exotel | voicebot applet handshake |

## WebSockets

### `/ws/dashboard?ticket=…`
Client→server: `{ "type": "subscribe", "callId": "uuid" | "*" }`.
Server→client envelope: `{ "type": string, "callId": string, "tsMs": number, "data": … }` — types:

| Type | Data |
|---|---|
| `call.status` | `{ status, direction, contactName?, to, from, startedAt? }` |
| `transcript.partial` | `{ speaker: "ai", text }` (streaming assistant words) |
| `transcript.segment` | `{ id, speaker, text, startedMs, endedMs }` (final) |
| `emotion.update` | `{ label, intensity, valence, arousal, trend }` |
| `thought` | `{ kind: "strategy"|"observation", text }` |
| `memory.recall` | `{ memories: [{ id, kind, content, score }] , trigger }` |
| `tool` | `{ name, args, result?, durationMs }` |
| `adaptation` | `{ reason, directive }` |
| `latency` | `{ turnMs, avgMs }` |
| `call.ended` | `{ durationSeconds, status }` |
| `postcall.done` | `{ summaryReady, reflectionReady }` |

### `/ws/twilio-media?callId&token` · `/ws/exotel-media?callId&token`
Provider media protocols (Twilio Media Streams JSON / Exotel Voicebot JSON). Token = HMAC(callId, exp) minted at dial time, 4 h TTL, constant-time compared.
