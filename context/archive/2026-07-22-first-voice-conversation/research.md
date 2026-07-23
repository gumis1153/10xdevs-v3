---
change_id: first-voice-conversation
type: research
topic: Libraries and solutions for the S-03 voice conversation slice
created: 2026-07-22
sources: web research (Exa), 2026-07-22; codebase review + Context7 + npm, 2026-07-22
last_updated: 2026-07-22
last_updated_by: Claude (Fable 5)
last_updated_note: "Added follow-up research: codebase compatibility review of docs-openai-agents-realtime.md"
---

# Research: solutions for first-voice-conversation (S-03)

Scope: find libraries/approaches for the 2–3 min in-browser voice conversation
(FR-006–FR-009), compatible with `context/foundation/tech-stack.md`
(Next.js 16 + Vercel + OpenAI Realtime **direct** — OpenRouter rejected 2026-07-15).

## Recommendation: OpenAI Agents SDK (`@openai/agents-realtime`)

Official OpenAI library for browser voice agents — best fit for the tech-stack
decision (OpenAI Realtime direct, ephemeral `client_secrets`):

- **`RealtimeAgent` + `RealtimeSession`** — in the browser it connects over
  **WebRTC** by default and configures microphone capture (getUserMedia) and
  audio playback itself; in a server runtime it falls back to WebSocket.
- **Covers S-03 requirements directly**: built-in VAD (`server_vad` /
  `semantic_vad`) emits "user speaking / stopped speaking" events → UI states
  *speaking / listening / processing* (FR-008, NFR ≤500 ms visual signal);
  interruption (barge-in) handling; `session.close()` = end at any moment
  (FR-009).
- **Both-side transcription** via `config.audio.input.transcription`
  (e.g. `gpt-4o-mini-transcribe`) + local session history (`history_updated`
  event) — ready input material for S-04 (post-session report) at no extra cost.
- Model: **`gpt-realtime-2.1`** (current generation; older tutorials use
  `gpt-4o-realtime-preview`).

Docs: https://openai.github.io/openai-agents-js/guides/voice-agents/quickstart/

## Token endpoint (maps to the MERGE-GATE from the roadmap)

Current official flow (https://developers.openai.com/api/docs/guides/realtime-webrtc):

1. Next.js route handler (`app/api/realtime/token/route.ts`) calls
   `POST https://api.openai.com/v1/realtime/client_secrets` with the
   server-side `OPENAI_API_KEY` — returns a short-lived `ek_...` token.
2. The browser uses the `ek_` token to establish WebRTC directly with OpenAI.

The three MERGE-GATE safeguards map 1:1:

- **Safety header**: `OpenAI-Safety-Identifier: <hashed user id>` set
  server-side when minting — OpenAI binds it to the token, the browser sends
  nothing extra. Supabase Auth is already in place, so a hash of `user.id` is
  at hand.
- **TTL ≤600 s**: `client_secrets` tokens have configurable `expires_after`;
  short-lived (minutes) by default.
- **Rate limit**: route behind the login gate (Supabase) + a limiter; on
  Vercel without Redis the simplest options are Vercel WAF rate limiting or
  `@upstash/ratelimit` — to be resolved in the plan.

Caveats:

- Many examples online use the older `POST /v1/realtime/sessions` — the new
  canonical endpoint is `/v1/realtime/client_secrets`.
- A "unified interface" also exists (`/v1/realtime/calls` — server proxies the
  SDP offer), but it puts a Vercel function in the critical path of session
  initialization; the ephemeral-token variant is a better fit on Hobby.

## Alternatives (evaluated, not recommended)

- **Raw WebRTC, no library** (~100 lines: `RTCPeerConnection` + data channel
  `oai-events`) — full control, zero dependencies; but VAD events,
  interruptions, and history must be hand-rolled — the Agents SDK gives those
  for free. Proven reference repos:
  - https://github.com/cameronking4/openai-realtime-api-nextjs (Next.js 15 +
    shadcn + a `useWebRTC` hook)
  - https://github.com/mostafa-drz/openai-realtime-webrtc (per-speaker
    transcript callbacks)
  - https://github.com/beloveddie/customer-support-voice-agent (Next.js 15 +
    Agents SDK — closest to this architecture)
- **Vercel AI SDK `experimental_useRealtime`** — the AI SDK recently gained
  realtime support (React hook, server-minted tokens), but: (a) status
  *experimental*, partially canary-only; (b) transport is **WebSocket, not
  WebRTC** — OpenAI itself recommends WebRTC for browser audio (more robust on
  poor networks); (c) the AI Gateway variant adds session limits (25 min max,
  5 min idle) and effectively reintroduces the middleman rejected with
  OpenRouter.
  - **New fact worth a note in `infrastructure.md`**: AI Gateway now supports
    Realtime — the 2026-07-15 provider note ("no Realtime support via
    intermediaries") is partially outdated. Revisiting it is a product
    decision, not made here.
- **LiveKit Agents / Pipecat / Daily** — full voice-infra platforms (separate
  worker process, Postgres/Redis, LiveKit Cloud); overkill for a 2–3 min
  conversation on a solo build, against the spirit of the tech stack.

## Safari iOS (roadmap unknown, non-blocking)

Good news: **plain Safari on iOS works with WebRTC + Realtime** — the loud
GitHub issues concern Capacitor/WKWebView wrappers, not the browser
(https://github.com/openai/openai-agents-js/issues/543 — author confirmed it
works fine in Safari proper). Known quirks to handle:

1. **User gesture**: `getUserMedia` and unlocking `AudioContext`/autoplay must
   happen inside a click handler — a "Start conversation" button satisfies
   this (already the UX of S-02 → S-03).
2. **Speakerphone echo** (model hears itself): mitigate API-side —
   `audio.input.noise_reduction.type: "far_field"` + higher `server_vad`
   threshold (~0.75).
3. **Audio routing with BT headsets**: iOS may switch output to the speaker
   once the mic activates (`setSinkId` unsupported in Safari) — known quirk
   with no full fix; acceptable for v1.
4. HTTPS required (production on Vercel — satisfied).

## Conclusion for `/10x-plan`

Proposed stack for `/10x-plan first-voice-conversation`:

**`@openai/agents-realtime` (WebRTC) + route handler minting `ek_` via
`client_secrets` (safety header, TTL, rate limit) + model `gpt-realtime-2.1` +
transcription `gpt-4o-mini-transcribe`.**

Zero infra changes, one new npm dependency, one new route. The only human step
stays unchanged: OpenAI safeguards (prepaid credits, auto-recharge OFF) +
`vercel env` for `OPENAI_API_KEY`.

## Follow-up Research 2026-07-22T18:30+02:00 — codebase compatibility review

**Question**: Is `docs-openai-agents-realtime.md` compatible with the current
codebase, as the basis for implementing S-03 (`first-voice-conversation`,
roadmap FR-006–FR-009)?
**Git commit**: `5a4bc5952140effbef6ff6158f44901e61395cb5` · **Branch**: `chore/session-topic-proposal-close`
**Method**: 4 parallel sub-agents — live codebase map, Next.js 16 docs
verification (`node_modules/next/dist/docs/`), historical/planning constraints,
npm + Context7 package fact-check.

### Verdict: COMPATIBLE ✅

The docs extract is accurate and implementable against this codebase as-is.
Every API claim was confirmed against `@openai/agents-realtime@0.13.5` (latest)
and current OpenAI platform docs; OpenAI ships an official `examples/realtime-next`
on Next 16.2.6 + React 19 with an **empty** `next.config.ts` — strong
compatibility signal for our Next 16.2.9 / React 19.2.4 / TS strict stack.
No Next config changes needed (no `transpilePackages`, no `serverExternalPackages`).
All three "gaps to verify" from the extract are now resolved (below). What
remains are 3 corrections to the extract and 4 integration adjustments.

### Corrections to the docs extract (gaps resolved)

1. **Gap 2 resolved — `expires_after` is an object, not a scalar** (extract §2
   implies a flat TTL): body shape is
   `{ "expires_after": { "anchor": "created_at", "seconds": 10–7200 }, "session": {...} }`.
   API default is 600 s; the MERGE-GATE "≤600 s" is project policy, not the API max.
   `OpenAI-Safety-Identifier` is an **HTTP header** on the server-side
   `client_secrets` request (not a body field); OpenAI binds it to the minted
   token, the browser sends nothing extra.
2. **Gap 1 resolved — transport event names confirmed**:
   `input_audio_buffer.speech_started` / `input_audio_buffer.speech_stopped`,
   surfaced via `session.on('transport_event', ...)` or `session.transport.on('*', ...)`.
   **Caveat: they fire only in `server_vad` mode** — the extract's default
   `semantic_vad` config would not produce the "user speaking" UI state this way.
   VAD mode choice is therefore a plan decision (see Open Questions).
   Transport also emits `connection_change` (with `ConnectionStatus`) and
   `disconnected` — the FR-009 teardown hook.
3. **Gap 3 resolved — mic-permission denial rejects the `connect()` promise**
   (`NotAllowedError`), it does NOT arrive via the `error` event. Recommended:
   call `navigator.mediaDevices.getUserMedia({ audio: true })` yourself before
   `connect()` for a controlled permission UX; wrap `connect()` in try/catch
   regardless.

Additional package facts not in the extract:

- **`zod@^4.0.0` is a peerDependency** of `@openai/agents-realtime` — must be
  installed alongside (it is currently only a transitive lockfile entry).
- Known issue: `connect()` can hang (waits for `session.updated` ack) — reported
  with the outdated `gpt-4o-realtime-preview` model id; mitigation: use current
  `gpt-realtime-2.1` and never hard-block UI on `connect()`.
- `ws` dependency is server-transport only; browser bundles use shims — harmless.

### Integration map (live codebase)

The codebase is small, clean, and has an explicit mount point prepared for S-03:

- **Mount point**: `src/components/session-start.tsx` — the app's only
  `'use client'` component; its `phase === 'accepted'` branch (lines ~59–75) is
  an explicit placeholder ("Rozmowa głosowa pojawi się w następnym kroku").
  The accepted `Topic` object (`src/lib/topics.ts`: `{id,title,description}`)
  is already in scope there → feeds `RealtimeAgent` instructions with no
  routing/persistence plumbing. The "Rozpocznij rozmowę" click doubles as the
  user gesture required for getUserMedia/AudioContext unlock (Safari).
- **Orb**: `src/components/orb.tsx` — presentational, CSS-animated, built to
  receive S-03 conversation states (speaking/listening) via a prop; keep it as
  ONE persistent element (reposition via classes, never remount).
- **Token route**: no `src/app/api/` exists yet — `src/app/api/realtime/token/route.ts`
  will be the first JSON route handler. Existing conventions from
  `src/app/auth/callback/route.ts`: named method exports, `NextRequest`/`NextResponse`,
  `console.error('context:', msg)` logging, Polish prose comments,
  `process.env.X!` env access.
- **Auth in the route**: proxy (`src/proxy.ts:54`) already gates the new route
  behind login (matcher excludes only static assets), BUT its unauth path is a
  307 redirect to `/login` — a browser `fetch()` would silently follow it into
  HTML. The route must additionally verify auth itself via
  `createClient().auth.getUser()` (`src/lib/supabase/server.ts:8`) and return
  **401 JSON**; do NOT use `requireUser()` (it calls `redirect()`).
  `user.id` from the same call feeds the hashed `OpenAI-Safety-Identifier`.
- **Rate limiting: greenfield** — zero rate-limit/WAF/Upstash code or config in
  the repo (`vercel.ts` sets only `regions: ['fra1']`). The MERGE-GATE
  requirement must be built from scratch; standing constraint #3 (Fluid Compute
  instance reuse, `deploy-plan.md:75`) rules out naive module-scope counters.
- **Env**: `OPENAI_API_KEY` exists only as an empty `.env.example` entry;
  provisioning is the registered human gate (prepaid credits, auto-recharge
  OFF, per-env key) — unconsumed, hard prerequisite (`deploy-plan.md:23,66,99`).
- No browser Supabase client exists — and S-03 does not need one.

### Next.js 16 verification (against bundled docs)

- **Route handler**: `POST` export, default Node.js runtime (correct for the
  server-side key; do not set edge). POST handlers are **never cached**;
  `cacheComponents` is off. Belt-and-suspenders: return with
  `Cache-Control: no-store`.
- **Client component**: `'use client'` required; note it still prerenders
  server-side, so all SDK/browser calls (`connect()`, getUserMedia) must live
  in event handlers / `useEffect`, never at render time. `next/dynamic`
  `{ ssr: false }` only if the SDK touches browser globals at import time
  (verify once installed; the official example suggests it does not).
- **React 19.2 / StrictMode**: the component holding `session.on(...)` must not
  be async; wire listeners in `useEffect` **with cleanup** calling
  `session.close()` — dev StrictMode double-invokes effects (duplicate
  subscriptions / leaked WebRTC connections otherwise).
- **Non-serializable**: `RealtimeSession` lives entirely client-side; never
  passed as a prop from a server component.

### MERGE-GATE readiness (deploy-plan.md:73)

Exact constraint: PR with the `client_secrets`-minting endpoint does not merge
without (a) rate limit (Vercel WAF per-IP — 1 free rule on Hobby — and/or
`@upstash/ratelimit` per-session), (b) token TTL ≤600 s via
`expires_after.seconds`, (c) `OpenAI-Safety-Identifier` header. All three map
cleanly onto the corrected `client_secrets` request shape above; (b) and (c)
are one-liners, (a) is the only real build item. The Hobby 300 s function cap
(constraint #2) applies to S-04's analysis route, not this one. Preview
verification of the WebRTC flow requires a Vercel-logged-in browser
(Deployment Protection; anonymous 401 expected).

### Open questions for `/10x-plan`

1. **VAD mode**: `semantic_vad` (more natural turns) vs `server_vad` (required
   for `speech_started/stopped` → "user speaking" UI state, and the Safari
   speakerphone echo mitigation via threshold ~0.75). Options: server_vad only,
   or semantic_vad + derive "user speaking" differently. Decide in plan.
2. **Rate-limit mechanism**: Vercel WAF rule vs `@upstash/ratelimit` (needs
   Redis provisioning) vs both — unresolved from the original research; now
   confirmed nothing exists in the repo.
3. Whether the SDK touches browser globals at import time (decides plain import
   vs `next/dynamic ssr:false`) — check once the package is installed.

### Code references

- `src/components/session-start.tsx:59-75` — S-03 mount point (accepted-phase stub)
- `src/components/orb.tsx` — conversation-state visual, ready for a state prop
- `src/lib/topics.ts` — `Topic` type + accepted topic source
- `src/lib/supabase/server.ts:8,34` — `createClient()` / `requireUser()` (latter unusable in API routes)
- `src/proxy.ts:54,99` — global auth gate + matcher (token route auto-covered, but 307 not 401)
- `src/app/auth/callback/route.ts` — the only existing route-handler convention
- `vercel.ts`, `next.config.ts` — no functions/cache/rate-limit config today
- `context/deployment/deploy-plan.md:23,66,73-83,99` — MERGE-GATE wording, human gates, standing constraints
- `context/foundation/prd.md:82-88,108-110` — FR-006–FR-009 + NFRs (≤500 ms signal, cross-browser, raw-audio retention)
- `context/foundation/tech-stack.md:43-47` — OpenAI direct decision (OpenRouter rejected)
- `context/archive/2026-07-21-session-topic-proposal/plan.md` — S-02 patterns S-03 builds on
