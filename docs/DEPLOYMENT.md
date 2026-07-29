# Deployment Guide

From zero to your digital human answering a real phone call.

## 0. Prerequisites

- Docker + Docker Compose (or Node 20+, PostgreSQL 16 with pgvector, Redis 7 for bare-metal)
- An **OpenAI API key** with Realtime API access
- A **Twilio** account with a voice-capable number, or an **Exotel** account with an exophone
- A way to expose the API publicly for webhooks: a VPS with a domain, or a tunnel
  (cloudflared / ngrok) when running from home

## 1. Configure environment

```bash
cp .env.example .env
node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('MASTER_KEY='+require('crypto').randomBytes(32).toString('base64'))"
# paste both into .env
```

| Variable | Meaning |
|---|---|
| `PUBLIC_BASE_URL` | The **public** https URL of the API (tunnel or domain). Used in webhook URLs and signature validation — must match exactly what providers call. |
| `WEB_ORIGIN` | Browser origin of the web app (CORS + WS origin check). |
| `NEXT_PUBLIC_API_ORIGIN` | What the **browser** uses to reach the API for the live-dashboard WebSocket. `http://localhost:4000` for local use; your public API URL otherwise. Baked into the web image at build time. |
| `SESSION_SECRET` / `MASTER_KEY` | Cookie signing / AES-256-GCM secret vault key. **Back up `MASTER_KEY`** — stored secrets are unreadable without it. |
| `AUTH_DISABLED` | Open access without a login screen. Defaults to `true` in development, `false` in production. An owner row is auto-created with an unknown random password — to switch to login mode later, set `AUTH_DISABLED=false`, run the owner-reset below, and complete `/setup`. **Never leave this `true` on a publicly reachable API.** |

Provider API keys can go in `.env` *or* (better) into **Settings → Integrations** after first
login — those are encrypted at rest and override env values.

## 2. Start the stack

```bash
docker compose up -d --build
docker compose logs -f api   # watch migrations apply
```

- Web console: `http://localhost:3000` → one-time owner setup (username/password, your name, the agent's name)
- API health: `http://localhost:4000/api/v1/health` → `{"ok":true,...}`

## 3. Expose the API publicly

Telephony providers must reach `PUBLIC_BASE_URL` over HTTPS.

**Tunnel (home setup):**
```bash
cloudflared tunnel --url http://localhost:4000     # or: ngrok http 4000
```
Put the printed URL into `.env` as `PUBLIC_BASE_URL=https://…` and `docker compose up -d api`
to restart with it. Free-tier tunnel URLs change on restart — re-do this when they do (a named
cloudflared tunnel or a VPS avoids that).

**VPS (recommended for permanence):** point a domain at the box, terminate TLS with Caddy:
```
api.yourdomain.com {  reverse_proxy localhost:4000 }
app.yourdomain.com {  reverse_proxy localhost:3000 }
```
Then `PUBLIC_BASE_URL=https://api.yourdomain.com`, `WEB_ORIGIN=https://app.yourdomain.com`,
`NEXT_PUBLIC_API_ORIGIN=https://api.yourdomain.com` (rebuild web: `docker compose up -d --build web`).

## 4. Configure Twilio

1. Console → Phone Numbers → your number → **Voice Configuration**:
   - *A call comes in*: *Webhook*, `https://<PUBLIC_BASE_URL>/webhooks/twilio/voice/inbound`, **HTTP POST**
2. In the app: **Settings → Integrations** → paste `Account SID` + `Auth Token`;
   **Settings → Telephony** → provider `Twilio`, From number = your Twilio number (E.164).
3. Outbound needs nothing else — the API passes per-call webhook URLs when dialing.

Signature validation is on by default. If your tunnel rewrites the host, set
`TWILIO_SKIP_SIGNATURE_VALIDATION=true` **only while debugging locally**.

## 5. Configure Exotel (India)

1. **App Bazaar** → create a flow:
   - **Voicebot** applet → URL: `https://<PUBLIC_BASE_URL>/webhooks/exotel/voicebot` (the endpoint
     returns the `wss://` stream URL per call)
   - then a **Passthru** applet (async) → `https://<PUBLIC_BASE_URL>/webhooks/exotel/passthru`
2. Note the flow id (the number in the flow URL).
3. **Settings → Integrations**: Exotel SID, API key, API token, subdomain
   (`api.exotel.com` or `api.in.exotel.com`), and the flow id.
   **Settings → Telephony**: provider `Exotel`, From number = your exophone.

Exotel media is 16-bit 8 kHz PCM — the API transcodes to μ-law in-process; nothing to configure.
Note: Exotel has no public hangup API; the agent ends calls by closing the voicebot stream.

## 6. First real call

1. **Settings → Integrations**: confirm OpenAI key shows “set”.
2. Dashboard → **New call** → your own mobile number → goal: *“Introduce yourself and ask how my day is going.”*
3. Watch the live screen: transcript streaming, emotion read, AI thoughts, latency per turn.
4. Hang up → within ~30 s the call page fills with summary, extracted memories, and the reflection report.

## 7. Operations

| Task | How |
|---|---|
| Backups | `docker compose exec db pg_dump -U onepct onepct > backup.sql` + copy `./storage` (recordings/uploads). Secrets need `MASTER_KEY` to decrypt. |
| Logs | `docker compose logs -f api` (pino JSON in production) |
| Migrations | Applied automatically on API boot; also `npm run migrate -w apps/api` |
| Update | `git pull && docker compose up -d --build` |
| Rotate provider keys | Paste new values in Settings → Integrations (old values overwritten) |
| Reset owner password | `docker compose exec db psql -U onepct -c "DELETE FROM owner"` → re-run `/setup` (memories/calls survive) |

## 8. Hardening checklist

- [ ] `SESSION_SECRET` + `MASTER_KEY` generated fresh, backed up offline
- [ ] HTTPS on both web and API (tunnel or Caddy)
- [ ] DB/Redis ports not exposed beyond localhost (compose binds them to 127.0.0.1)
- [ ] Recording announcement enabled if your jurisdiction requires consent
- [ ] AI disclosure policy reviewed (Settings → Voice & AI)
- [ ] Audit log reviewed occasionally (Settings → Audit)

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Call connects then silence | OpenAI key missing/invalid, or Realtime model name wrong (Settings → Voice & AI) |
| Webhook 403s in api logs | `PUBLIC_BASE_URL` doesn't exactly match the URL Twilio called (scheme/host), so signatures fail |
| Call never connects | Tunnel down or `PUBLIC_BASE_URL` stale — Twilio can't fetch TwiML |
| `dial_failed: ... not configured` | Missing provider credentials or From number |
| Recordings stuck “pending” | Recording callback couldn't reach the API, or Twilio creds lack recording fetch permission |
| Dashboard shows no live events | Browser can't reach `NEXT_PUBLIC_API_ORIGIN` WebSocket (rebuild web with correct value) |
| `MASTER_KEY must be set` on boot | Production requires it — generate per step 1 |
