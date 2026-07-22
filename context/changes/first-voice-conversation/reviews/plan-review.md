<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Voice Conversation (S-03)

- **Plan**: context/changes/first-voice-conversation/plan.md
- **Mode**: Deep
- **Date**: 2026-07-22
- **Verdict**: REVISE → SOUND after fixes (F1, F2, F3 applied; F4 risk accepted)
- **Findings**: 2 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (fixed in triage) |
| Plan Completeness | WARNING (fixed in triage) |

## Grounding

7/7 paths ✓ (session-start.tsx, orb.tsx, proxy.ts, supabase/server.ts, auth/callback/route.ts, globals.css, vercel.ts), symbols ✓ (`createClient`, `requireUser`, `drawTopic`, matcher, `regions: ['fra1']`, empty `OPENAI_API_KEY` entry, zod transitive-only), brief↔plan ✓, Progress↔Phase contract ✓.

Deep verification (sub-agent, sources: `@openai/agents-realtime@0.13.5` package source, openai-node repo, developers.openai.com, Vercel docs): event names CONFIRMED, `client_secrets` REST shape CONFIRMED (`expires_after` object, `OpenAI-Safety-Identifier` as HTTP header, response field `expires_at`), model ids `gpt-realtime-2.1` / `gpt-4o-mini-transcribe` CONFIRMED, Vercel WAF on Hobby (1 free rate-limit rule, applies to previews) CONFIRMED. Server-pinned-config claim CONTRADICTED (→ F1).

## Findings

### F1 — SDK overrides server-pinned config on connect()

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 #4 + Key Discoveries + Critical Details
- **Detail**: Plan instructed "config is server-pinned, do not duplicate it client-side" and claimed the client cannot override model/VAD. Verified against `@openai/agents-realtime@0.13.5` source: the SDK sends a `session.update` on every `connect()` filling unset fields with its defaults (`turnDetection: semantic_vad`, `noiseReduction: null`) and waits for the ack; OpenAI docstring confirms pinned config "can also be overridden by the client connection". Result: `server_vad` threshold 0.75 (user-speaking orb state + Safari echo mitigation) silently replaced.
- **Fix**: Mirror the audio config client-side in `RealtimeSession` `config` (camelCase: `turnDetection: { type: 'server_vad', threshold: 0.75 }`, `noiseReduction: { type: 'far_field' }`, transcription `gpt-4o-mini-transcribe`); keep the server pin as defense-in-depth; pin the SDK version.
- **Decision**: FIXED (Key Discoveries + new Critical Details bullet + Phase 2 #4 contract updated)

### F2 — "Anonymous 401" criterion unreachable: proxy returns 307

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria (1.3) + Desired End State
- **Detail**: `src/proxy.ts:100` matcher covers `/api/realtime/token`; anonymous POST never reaches the route — the proxy answers 307 → `/login`. Criterion 1.3 (`curl … → 401`) was unsatisfiable; the route's own 401 was dead code for anonymous callers, and a `fetch()` with an expired session would follow the redirect into HTML.
- **Fix A ⭐ Recommended**: Proxy carve-out — unauthenticated `/api/*` gets 401 JSON instead of 307; amend the "No proxy changes" scope entry.
  - Strength: one consistent contract (API speaks JSON); criterion 1.3 works literally; expired-session `fetch()` gets a clean 401.
  - Tradeoff: touches the shared auth proxy — small but real blast radius.
  - Confidence: HIGH — one pathname condition next to the existing `/login` and `/auth` exceptions.
  - Blind spot: carrying session cookies/headers onto the 401 response (as in `withSessionCookies`).
- **Fix B**: Correct criteria to actual behavior (expect 307); route 401 stays as untested defense-in-depth.
  - Strength: zero shared-code changes.
  - Tradeoff: client must handle redirect-to-HTML on expired session; 401 layer untestable anonymously.
  - Confidence: MEDIUM.
  - Blind spot: risk of an eternal "connecting" state after a followed redirect.
- **Decision**: FIXED via Fix A (new Phase 1 change #2 "Proxy 401 carve-out", scope entry amended, Critical Details rewritten, regression criterion 1.7 added)

### F3 — TTL 600 s generous: one token = many sessions, session outlives TTL

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 #1 (`expires_after.seconds`)
- **Detail**: OpenAI docs: `expires_after` bounds only the session-*creation* window — one `ek_` can start multiple sessions until expiry, and a started session keeps running past the TTL. The client mints the token right before `connect()`, so 600 s only widens the abuse window (MERGE-GATE ≤600 s is a ceiling, not a target).
- **Fix**: Lower `expires_after.seconds` to 120 and document the token-TTL ≠ session-duration semantics in Key Discoveries.
- **Decision**: FIXED (TTL 120 s, Key Discovery added, criteria 1.4 updated)

### F4 — "speech_started only in server_vad" claim too strong

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries + VAD decision rationale
- **Detail**: Current OpenAI VAD guide says `input_audio_buffer.speech_started/stopped` fire whenever VAD is enabled — also in `semantic_vad`. The `server_vad` decision still stands (threshold 0.75 = Safari echo mitigation), but the recorded rationale ("only mode emitting…") is inaccurate and could someday needlessly block a switch to `semantic_vad`.
- **Fix**: Reword the rationale: `server_vad` chosen for threshold control (Safari echo), not because the events don't exist in `semantic_vad`.
- **Decision**: ACCEPTED (risk accepted — decision rests on the echo-mitigation rationale anyway)
