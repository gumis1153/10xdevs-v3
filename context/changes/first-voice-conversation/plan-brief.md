# First Voice Conversation (S-03) — Plan Brief

> Full plan: `context/changes/first-voice-conversation/plan.md`
> Research: `context/changes/first-voice-conversation/research.md`

## What & Why

The 2–3 minute in-browser English voice conversation (FR-006–FR-009) — the
product's guiding star and its riskiest technical assumption: "voice both ways
IS the product". The user talks to an AI conversation partner on the accepted
topic, sees the conversation state on the orb, and can end at any moment.

## Starting Point

S-02 left an explicit mount point: the accepted-phase stub in
`session-start.tsx` with the `Topic` already in scope, and a prop-less orb
built to receive conversation states. No API routes exist yet; rate limiting
is greenfield; `OPENAI_API_KEY` is an unconsumed human gate. Research settled
the stack and verified full codebase compatibility (verdict: COMPATIBLE).

## Desired End State

Click "Rozpocznij rozmowę" → orb signals connecting within 500 ms → natural
English voice conversation over WebRTC with visible listening / user-speaking
/ processing / speaking states, barge-in, and a working end button. A 5-minute
hard cap with countdown protects costs; mic-denial and connection drops show
actionable inline errors with retry; ending lands on a stub screen that S-04
replaces with the report.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Voice stack | `@openai/agents-realtime` (WebRTC) + `gpt-realtime-2.1` | Official SDK covers VAD, barge-in, transcription, teardown for free; OpenAI-direct per tech-stack decision | Research |
| Token flow | Route handler minting `ek_` via `client_secrets`, config pinned server-side | Ephemeral token keeps Vercel out of the audio critical path; client can't override model/VAD | Research |
| Rate limit (MERGE-GATE a) | Vercel WAF per-IP rule (1 free on Hobby) | Zero code and zero new infra behind an existing login gate; config lives in dashboard (human step) | Plan |
| VAD mode | `server_vad`, threshold 0.75 | Only mode emitting speech_started/stopped (the "user speaking" orb state) + Safari echo mitigation | Plan |
| Session length | Client-side hard cap 5:00, warning 4:30, visible countdown | Cost fuse consistent with the 2–3 min product framing; server enforcement disproportionate for MVP | Plan |
| Live transcript | None — orb states only | Voice-first; live captions amplify the persona's "being judged" anxiety; history still collected for S-04 | Plan |
| Error UX | Inline states + manual retry (mic-denied vs connection, distinct) | User always knows what happened and what to do; auto-reconnect can't restore context anyway | Plan |
| After session ends | `ended` phase stub + "Nowa sesja"; transcript kept in client state | Mirrors the S-02→S-03 stub pattern; clean S-04 hand-off point | Plan |
| Agent language | English-only, gently steering back from Polish | Maximum practice without a wall; no mid-conversation error correction (analysis is post-hoc, FR-010) | Plan |

## Scope

**In scope:** token route with all three MERGE-GATE safeguards; SDK + zod
deps; orb state prop + CSS variants; conversation component (state machine,
end button, timer cap, error states, ended stub); agent instructions builder.

**Out of scope:** live transcript UI, post-session report (S-04), any
persistence (S-05), level adaptation (S-06), auto-reconnect, per-user rate
limiting, daily quotas, proxy changes.

## Architecture / Approach

Browser: `session-start.tsx` mounts `voice-conversation.tsx`, which fetches an
ephemeral token from `POST /api/realtime/token` (auth-checked, 401 JSON) and
connects `RealtimeSession` over WebRTC directly to OpenAI — no Vercel function
in the audio path. SDK events drive a UI-state machine surfaced on the
persistent orb. Server pins the session config (model, server_vad,
transcription, far_field noise reduction) when minting.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Token endpoint + MERGE-GATE | curl-verifiable route with TTL ≤600 s, safety header; WAF rule (human) | Human gates: OpenAI key provisioning, dashboard WAF rule |
| 2. Conversation core | Working E2E voice conversation with orb states + end button | WebRTC/StrictMode lifecycle bugs; SSR import check |
| 3. Lifecycle & resilience | 5-min cap, error states with retry, ended stub | Safari iOS quirks (smoke test; known non-blockers) |

**Prerequisites:** OpenAI safeguards (prepaid credits, auto-recharge OFF,
per-env key) + `OPENAI_API_KEY` via `vercel env` / `.env.local` — human step
from the deploy-plan runbook. Feature branch + PR (protect-master).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Safari iOS is the weakest voice platform (roadmap unknown, owner: user) —
  research says plain Safari works; smoke test in Phase 3 confirms.
- Client-side time cap is bypassable by a determined user — accepted: login
  gate + WAF rate limit bound the blast radius.
- WAF rule lives outside the repo — enforcement point is PR review
  (MERGE-GATE), documented in plan and PR description.
- `connect()` hang is mitigated by the current model id + cancellable UI, not
  eliminated.

## Success Criteria (Summary)

- A logged-in user holds a full 2–3 min English voice conversation on the
  accepted topic and ends it at any moment (FR-006–FR-009).
- The orb reflects every conversation state within 500 ms (FR-008 + NFR).
- The token endpoint merges only with all three MERGE-GATE safeguards live.
