# 1% — Digital Human AI Calling Agent

A personal digital human that **makes and receives real phone calls**, holds natural
conversations on the OpenAI Realtime API, **remembers everyone it talks to**, reads emotions and
adapts mid-call, records and transcribes everything, and **critiques itself after every call** to
get better.

Single owner. Not a SaaS. Not a call center. Not a CRM.

```
Phone ⇄ Twilio/Exotel ⇄ media WebSocket ⇄ Realtime voice engine (g711 μ-law, server VAD)
                              │
        live dashboard ⇄ WS hub: transcript · emotions · AI thoughts · memory recalls · latency
                              │
        post-call pipeline: summary → memory extraction → reflection → relationship → analytics
```

## What's inside

| Area | Highlights |
|---|---|
| Calling | Outbound + inbound, live call screen, barge-in interruption handling, hangup, max-duration guard |
| Memory | pgvector semantic memory with importance × recency × reinforcement scoring, supersession chains, in-call `save_memory`/`search_memory` tools |
| Relationship engine | Familiarity & trust scores, event timeline, milestones, injected into every prompt |
| Emotion engine | Per-utterance classification, live speaking-style adaptation, emotion timeline analytics |
| Personality engine | 5 built-ins + unlimited custom (prompt + 5 style sliders + voice) |
| Reflection engine | Post-call self-critique with scores and a reusable "lesson" retrieved into future calls |
| Knowledge base | PDF/DOCX/TXT/MD → chunked → embedded → `search_knowledge` tool mid-call |
| Recordings & transcripts | Dual-channel audio, seekable player, Postgres FTS transcript search |
| Analytics | Calls, talk time, emotion trends, self-scored quality, relationship growth |
| Security | argon2id single-owner auth, Redis sessions, AES-256-GCM secret vault, webhook signatures, HMAC media tokens, rate limiting, audit log |

## Quickstart (Docker)

```bash
cp .env.example .env
# REQUIRED — generate fresh values into .env:
node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('MASTER_KEY='+require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d --build
# web → http://localhost:3000  (first visit runs the one-time owner setup)
# api → http://localhost:4000/api/v1/health
```

Then in the UI: **Settings → Integrations** — paste your OpenAI key and Twilio (or Exotel)
credentials, set your **From number**, expose the API publicly (tunnel), and dial.
Full provider walkthrough: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local development

```bash
npm install
docker compose up -d db redis        # just the data stores
npm run dev:api                      # Fastify on :4000 (auto-migrates)
npm run dev:web                      # Next.js on :3000
npm test                             # API unit suites (vitest)
npm run typecheck                    # all workspaces
```

## Repository layout

```
apps/api        Fastify 5 backend — telephony, voice engine, engines, jobs (see docs/ARCHITECTURE.md)
apps/web        Next.js 15 console — dashboard, live call screen, 10 pages
packages/shared zod contracts shared by both (DTOs, WS protocol, settings)
docs/           ARCHITECTURE · API · DEPLOYMENT · TESTING · ROADMAP
storage/        recordings + uploads (gitignored, volume-mounted)
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, call pipeline, DB schema, engines
- [docs/API.md](docs/API.md) — REST/WS contracts
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup, Twilio/Exotel config, hardening
- [docs/TESTING.md](docs/TESTING.md) — test strategy & live-call test plan
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's next (WebRTC softphone, SIP, more voices)

## A note on law & ethics

You are putting an AI on real phone lines. Recording consent and AI-disclosure rules vary by
country/state — the recording announcement toggle and the disclosure policy
(Settings → Voice & AI) exist so you can comply. The default policy never lies about being an AI
when asked directly. That floor is intentional.
