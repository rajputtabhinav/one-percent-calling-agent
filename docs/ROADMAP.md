# Production Roadmap

## v1.0 — shipped

Outbound/inbound calling (Twilio + Exotel), OpenAI Realtime speech-to-speech with barge-in,
live call screen (transcript, emotions, AI thoughts, memory recalls, latency), recordings +
seekable playback, FTS transcripts, pgvector long-term memory with supersession and
reinforcement, relationship engine (familiarity/trust/timeline), emotion engine with live
adaptation, personality engine (5 built-ins + custom), reflection engine with reusable lessons,
knowledge base (PDF/DOCX/TXT/MD RAG), analytics, single-owner auth, encrypted secret vault,
webhook signatures, rate limiting, audit log, Docker Compose deployment.

## P1 — make it complete (next)

| Item | Notes |
|---|---|
| **Browser softphone (WebRTC)** | Twilio Voice JS SDK: API issues AccessTokens (needs API Key SID/secret + TwiML App), web gets a "Talk yourself" mode and barge-in monitoring of live agent calls. The token endpoint slot is reserved under `/api/v1/calls`. |
| **Scheduled & proactive calls** | "Call mom every Sunday 6pm", follow-up scheduler that turns `log_follow_up` items into queued calls (BullMQ repeatable jobs + a Scheduled page). |
| **Relay voice provider** | `voice/component-pipeline.ts`: streaming STT → LLM → TTS (ElevenLabs/Cartesia adapters) behind the same `VoiceSession` interface — voice variety + Realtime-outage fallback. |
| **Fake telephony provider** | Replay recorded media frames through the real media WS for CI-grade pipeline tests (see TESTING.md). |
| **Owner identity editing** | `PATCH /auth/me` (display/agent name, password change) + Settings section. |
| **Summary digests** | Daily email/Telegram digest of calls, follow-ups, and memory diffs. |

## P2 — reach & depth

- **SIP provider**: drachtio-srf (or Asterisk ARI) signaling; RTP PCMU maps 1:1 onto the existing
  μ-law pipeline; brings raw DID/PBX trunks without per-minute carrier markup.
- **Voicemail mode**: unknown-caller policy option that takes a message and extracts it to memory.
- **Hindi-first tuning**: per-contact preferred-language memory, Devanagari transcript rendering,
  Hinglish-aware FTS dictionary.
- **Contact enrichment**: import from CSV/vCard; birthday/anniversary awareness driving proactive calls.
- **Memory browser graph**: visualize the supersession chains and contact knowledge graph.
- **Realtime reconnect mid-call**: resume the session with context re-prime instead of graceful apology hangup.

## P3 — ambitions

- **Local fallback stack**: faster-whisper + local TTS + small LLM for degraded-but-private
  operation without OpenAI.
- **Voice cloning of the owner** (explicit consent + provider ToS gates) for "call as me" mode.
- **Calendar/email integration**: the agent books slots it agrees to on calls.
- **Multi-line**: several concurrent numbers/personas (architecture already keys sessions per call).

## Known limitations (deliberate v1 trade-offs)

- Exotel cannot be hung up via REST — the agent ends calls by closing the voicebot stream.
- Jobs run in the API process (fine for one owner; extract a worker container when needed —
  the BullMQ boundary already exists).
- Reflection "lessons" retrieval is semantic-only; no decay/conflict resolution between lessons yet.
- One active call per phone line is the tested path; concurrent calls work but share one OpenAI
  rate-limit pool.
- `docs/API.md` is the contract source for humans; OpenAPI generation is not wired up.
