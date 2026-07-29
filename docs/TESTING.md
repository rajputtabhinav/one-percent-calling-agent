# Testing Strategy

## Pyramid

```
        live call drills          (manual, scripted scenarios — the only true E2E for telephony)
      ─────────────────────
       integration (infra)        (API routes against real Postgres+Redis — compose-based)
    ───────────────────────────
        unit suites (vitest)      (pure logic — runs anywhere, no infra, CI-gating)
```

Telephony + speech systems can't be meaningfully E2E-tested without real carriers and audio, so
the strategy is: **make every deterministic piece unit-tested, make the integration layer thin
and observable (audit log, call_events, latency metrics), and script the human test drills.**

## 1. Unit suites (implemented — `npm test`)

| Suite | What it locks down |
|---|---|
| `g711.test.ts` | μ-law codec round-trip error bounds, clipping, byte→ms math (Exotel bridge correctness) |
| `phone.test.ts` | E.164 normalization: national formats, 00-prefix, default country code, garbage rejection |
| `crypto.test.ts` | AES-256-GCM round-trip, fresh IVs, tamper rejection, argon2id verify, masking |
| `tokens.test.ts` | Media WS token mint/verify, expiry, cross-call and tamper rejection |
| `chunk.test.ts` | KB chunk size bounds, overlap behavior, pathological input |
| `prompts.test.ts` | System prompt contains identity/memories/goal/lessons; disclosure modes; greeting logic |
| `emotion.test.ts` | Adaptation trigger thresholds per emotion; trend detection |
| `twilio.test.ts` | Webhook signature determinism/tamper detection; TwiML structure and URL escaping |

Run: `npm test` (root) or `npm run test -w apps/api`. No DB/Redis/network needed — safe for CI.

## 2. Integration (infra-backed)

With `docker compose up -d db redis` running, the API can be exercised end-to-end over HTTP:

```bash
npm run dev:api
# in another shell:
curl -s localhost:4000/api/v1/health
curl -s -X POST localhost:4000/api/v1/auth/setup -H 'content-type: application/json' \
  -d '{"username":"owner","password":"password123"}' -c cookies.txt
curl -s localhost:4000/api/v1/contacts -b cookies.txt
```

Suggested additions (not yet automated): a `vitest --config integration` project using
`app.inject()` against a disposable `onepct_test` database — the route layer is already
separated from `buildApp()` to support this.

## 3. Live call drills (manual, before trusting it with real people)

Run each against your own phone; verify on the live screen *and* in the post-call report.

1. **Greeting & identity** — does it greet naturally, use the right agent name, right personality?
2. **Barge-in** — interrupt it mid-sentence; it must stop within ~a syllable and respond to you.
3. **Memory write** — tell it your birthday; confirm a memory row + it surfaces next call.
4. **Memory read** — next call, ask "do you remember my birthday?"
5. **Emotion adaptation** — act annoyed; watch the adaptation event fire and the tone change.
6. **Knowledge tool** — upload a doc, ask a question only it answers; verify `search_knowledge` in AI thoughts.
7. **end_call protocol** — say "okay bye now"; it should say goodbye *then* hang up itself.
8. **Inbound** — call your Twilio number; verify contact resolution and answer behavior.
9. **Unknown caller policy** — set `reject`, call from an unknown number, expect rejection.
10. **Max duration** — set 2 min; verify the wrap-up nudge at T-60s and the hard stop.
11. **Recording + transcript** — playback works, segments align, FTS finds a phrase you said.
12. **Pipeline** — summary, memories, reflection, relationship delta all present within a minute.

## 4. Latency measurement

Every turn is measured (speech-stop → first audio byte) and broadcast as a `latency` event,
stored per call (`latency_ms_avg`) and trended in Analytics. Watch for: sustained >1.8 s avg →
check tunnel region, Realtime model load, or server CPU.

## 5. Future automation (ROADMAP)

- Fake telephony provider (`telephony/fake.ts`) replaying recorded media frames over the real
  media WS — full pipeline test without a carrier.
- Realtime API mock (scripted server events) for orchestrator state-machine tests
  (barge-in, truncation, end_call timing).
- Playwright smoke: login → dial dialog → settings round-trip against seeded DB.
