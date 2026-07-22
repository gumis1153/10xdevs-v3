# First Voice Conversation (S-03) Implementation Plan

## Overview

Implement the 2–3 minute in-browser English voice conversation (roadmap S-03,
FR-006–FR-009): the user accepts a topic (S-02), clicks "Rozpocznij rozmowę",
talks to an AI conversation partner over WebRTC, sees the conversation state on
the orb, and can end the session at any moment. This is the product's guiding
star and its riskiest technical assumption — "voice both ways IS the product".

Stack (settled by `research.md`): `@openai/agents-realtime` (WebRTC in the
browser) + a Next.js route handler minting ephemeral `ek_` tokens via
`POST /v1/realtime/client_secrets`, model `gpt-realtime-2.1`, transcription
`gpt-4o-mini-transcribe`.

## Current State Analysis

- `src/components/session-start.tsx` — the app's only `'use client'`
  component; its `phase === 'accepted'` branch (lines 59–75) is an explicit
  S-03 placeholder. The accepted `Topic` is already in scope there. The
  "Rozpocznij rozmowę" click doubles as the user gesture required for
  getUserMedia/AudioContext (Safari).
- `src/components/orb.tsx` — presentational, CSS-animated, deliberately
  prop-less; built to receive conversation states in S-03. Rendered as ONE
  persistent element in `session-start.tsx`, repositioned via classes only.
- No `src/app/api/` exists — the token route is the first JSON route handler.
  Conventions come from `src/app/auth/callback/route.ts` (named method
  exports, `NextRequest`/`NextResponse`, `console.error('context:', msg)`,
  Polish prose comments, `process.env.X!`).
- Auth: `src/proxy.ts` gates every non-static path, but its unauth path is a
  **307 redirect to /login** — a browser `fetch()` would follow it into HTML.
  `src/lib/supabase/server.ts` exports `createClient()` (usable) and
  `requireUser()` (calls `redirect()` — unusable in API routes).
- Rate limiting: greenfield — zero limiter/WAF/Upstash code or config in the
  repo (`vercel.ts` sets only `regions: ['fra1']`).
- `OPENAI_API_KEY`: only an empty `.env.example` entry; provisioning is a
  registered human gate (prepaid credits, auto-recharge OFF, per-env key —
  `context/deployment/deploy-plan.md:66,99`).
- No test framework configured; verification = lint + build + manual.

## Desired End State

A logged-in user on `/` accepts a topic, clicks "Rozpocznij rozmowę", grants
the microphone, and within ≤500 ms sees the orb signal "connecting". They hold
a natural English voice conversation on the accepted topic: the orb visibly
distinguishes *listening / user speaking / processing / agent speaking*
(FR-008), barge-in works, and "Zakończ rozmowę" (or the 5-minute hard cap)
ends the session cleanly (FR-009), landing on an end screen that S-04 will
replace with the report. Mic-permission denial and connection drops show
actionable inline errors with manual retry.

Verification: a full 2–3 min conversation on desktop Chrome + a smoke test on
Safari iOS; token endpoint returns 401 JSON anonymously and a short-lived
`ek_` token when authenticated; the PR satisfies all three MERGE-GATE
safeguards before merging.

### Key Discoveries:

- Mount point ready: `src/components/session-start.tsx:59-75` (accepted-phase
  stub); topic feeds `RealtimeAgent` instructions with zero new plumbing.
- `expires_after` is an object (`{ anchor: 'created_at', seconds: ... }`), and
  `OpenAI-Safety-Identifier` is an **HTTP header** on the server-side
  `client_secrets` request — not a body field (research.md, corrections §1).
- `input_audio_buffer.speech_started/stopped` transport events fire **only in
  `server_vad` mode** (research.md §2) — this drove the VAD decision.
- Mic-permission denial **rejects the `connect()` promise**
  (`NotAllowedError`); it does not arrive via the `error` event (research.md §3).
- `zod@^4` is a **peerDependency** of `@openai/agents-realtime` — must be
  installed explicitly.
- `expires_after` bounds only the window for **creating** sessions: one `ek_`
  token can start multiple sessions until it expires, and a started session
  keeps running past the TTL. The token is minted right before `connect()`,
  so the TTL is set to 120 s (MERGE-GATE ≤600 s is a ceiling, not a target).
- Session config pinned in the `client_secrets` `session` payload is
  **defense-in-depth only, not enforcement**: the SDK sends a `session.update`
  on every `connect()` filling unset fields with its own defaults
  (`semantic_vad`, `noiseReduction: null`), and OpenAI documents that the
  pinned config "can also be overridden by the client connection" — the client
  MUST mirror the config (plan-review F1, verified against
  `@openai/agents-realtime@0.13.5` source).
- React 19 dev StrictMode double-invokes effects — session lifecycle needs
  cleanup that calls `session.close()` and a guard against double-connect.

## What We're NOT Doing

- **No live transcript UI** — orb states only (decision: voice-first, persona
  avoids "being judged"); history is still collected in client memory.
- **No post-session report** — S-04. The end screen is a stub with a hand-off
  point (transcript in client state).
- **No persistence** — no DB schema, no storing transcripts/sessions (S-05).
- **No level adaptation** — S-06 (agent instructions deliberately omit it).
- **No auto-reconnect/backoff** — connection drop = inline error + manual
  retry starting a fresh session.
- **No per-user rate limiting / Upstash / Redis** — WAF per-IP rule only
  (decision; login gate is the first layer).
- **No daily usage quotas** — would require shared state; out of MVP scope.
- **No matcher/auth-flow redesign in the proxy** — the only proxy change is
  the narrow F2 carve-out (unauth `/api/*` → 401 JSON instead of 307); the
  matcher and page redirect flow stay untouched. The token route still
  self-verifies auth (defense-in-depth).

## Implementation Approach

Three phases, each independently verifiable: (1) the server-side token
endpoint with all MERGE-GATE safeguards — testable with curl before any UI
exists; (2) the conversation core — SDK, state machine, orb states, end
button; a working E2E conversation; (3) session lifecycle and resilience —
time cap, error UX, end screen. All work on a feature branch, lands via PR
(ruleset `protect-master`); the PR description must show MERGE-GATE
compliance (deploy-plan standing constraint #1).

## Critical Implementation Details

- **Proxy 401 carve-out for API paths (plan-review F2)**: without it the
  proxy would 307-redirect anonymous `/api/*` requests to `/login`, feeding
  HTML to the client `fetch()` and making the route's own 401 unreachable.
  The proxy returns 401 JSON for unauthenticated `pathname.startsWith('/api')`
  (session cookies/headers carried over as in `withSessionCookies`). The token
  route STILL verifies auth itself via `createClient().auth.getUser()` and
  returns 401 JSON — defense-in-depth; never use `requireUser()` (it
  redirects).
- **REST is snake_case, SDK is camelCase**: the route talks raw REST
  (`turn_detection`, `noise_reduction`, `expires_after`); the browser SDK
  uses camelCase config. Do not copy shapes between the two layers.
- **Mirror the session config client-side**: the SDK always sends
  `session.update` on connect, replacing unset fields with its defaults
  (`semantic_vad`, `noiseReduction: null`) — these override the server-pinned
  config. Pass the same audio config (camelCase) in `RealtimeSession` options:
  `turnDetection: { type: 'server_vad', threshold: 0.75 }`,
  `noiseReduction: { type: 'far_field' }`, transcription
  `gpt-4o-mini-transcribe`. The server pin stays as defense-in-depth. Pin the
  SDK version in `package.json` (behavior verified on `0.13.5`).
- **≤500 ms signal (NFR)**: set the `connecting` UI state synchronously in
  the click handler, before any async call (token fetch, getUserMedia).
- **Never hard-block on `connect()`**: known hang case (stale model ids) —
  keep the UI cancellable while connecting; wrap `connect()` in try/catch.
  Call `navigator.mediaDevices.getUserMedia({ audio: true })` yourself first
  for a controlled permission UX.
- **StrictMode/lifecycle**: session listeners wired in `useEffect` with
  cleanup calling `session.close()`; guard against double-connect (dev double
  effects). `RealtimeSession` lives entirely client-side, never passed from a
  server component. Use refs for transient per-event values; re-render only
  on discrete UI-state changes.
- **Orb stays ONE persistent element**: state changes via classes/props only,
  never remount (restarts CSS animations).
- **Fluid Compute (standing constraint #3)**: no per-user/per-request state
  in module scope in the route handler.
- **SSR import check (open question #3)**: after installing the SDK, verify a
  plain import compiles under prerender; fall back to `next/dynamic`
  `{ ssr: false }` only if the SDK touches browser globals at import time
  (official Next example suggests it does not).

## Phase 1: Token endpoint + MERGE-GATE

### Overview

Server-side only: the `client_secrets`-minting route with all three
MERGE-GATE safeguards, plus the documented human steps (OpenAI key
provisioning, WAF rule). Verifiable with curl before any client work.

### Changes Required:

#### 1. Token route handler

**File**: `src/app/api/realtime/token/route.ts` (new)

**Intent**: `POST` handler that authenticates the user, mints a short-lived
ephemeral client secret with the session config pinned server-side, and
returns it as JSON. First API route in the repo — follows
`src/app/auth/callback/route.ts` conventions.

**Contract**: Named `POST` export (Node runtime — default; never edge).
Flow: `createClient().auth.getUser()` → no user ⇒ `401` JSON
`{ error: 'unauthorized' }`; else SHA-256-hash `user.id` (Node `crypto`) and
call OpenAI. Response: `{ value, expiresAt }` with
`Cache-Control: no-store`; upstream failure ⇒ `console.error` + `502` JSON.
The outbound request is non-obvious enough to pin (REST snake_case; header
placement; server-pinned session config):

```
POST https://api.openai.com/v1/realtime/client_secrets
Authorization: Bearer ${process.env.OPENAI_API_KEY}
OpenAI-Safety-Identifier: <sha256(user.id)>
{
  "expires_after": { "anchor": "created_at", "seconds": 120 },
  "session": {
    "type": "realtime",
    "model": "gpt-realtime-2.1",
    "audio": {
      "input": {
        "transcription": { "model": "gpt-4o-mini-transcribe" },
        "turn_detection": { "type": "server_vad", "threshold": 0.75 },
        "noise_reduction": { "type": "far_field" }
      }
    }
  }
}
```

`threshold: 0.75` and `far_field` are the Safari speakerphone-echo
mitigation (research.md §Safari); tune `silence_duration_ms` during manual
testing if turn-taking feels too eager.

#### 2. Proxy 401 carve-out for API paths

**File**: `src/proxy.ts`

**Intent**: Unauthenticated requests to `/api/*` get 401 JSON from the proxy
instead of the 307 redirect to `/login` (plan-review F2) — API consumers are
`fetch()` calls, not browsers navigating pages.

**Contract**: In the unauth branch (`src/proxy.ts:54`), before the redirect:
`pathname.startsWith('/api')` ⇒ return a `NextResponse.json({ error:
'unauthorized' }, { status: 401 })` wrapped with the same session
cookies/headers hand-off as `withSessionCookies`. No matcher changes; page
paths keep the existing redirect behavior.

#### 3. Env documentation

**File**: `.env.example`

**Intent**: The `OPENAI_API_KEY` entry already exists with the human-gate
comment — verify it needs no change; do not add secrets or new variables.

**Contract**: No new env variables in this slice.

#### 4. Human steps (documented, not executed by the agent)

**File**: none (PR description + this plan)

**Intent**: Two human gates block full verification and merge:
(a) OpenAI safeguards — prepaid credits, auto-recharge OFF, per-env key —
then `OPENAI_API_KEY` in `.env.local` (dev) and `vercel env add
OPENAI_API_KEY` (preview/production); (b) Vercel WAF rate-limit rule (the one
free Hobby rule): per-IP limit on path `/api/realtime/token` (suggested:
10 req / 60 s per IP, action: rate-limit/block) — created in the dashboard,
verified on the preview URL.

**Contract**: MERGE-GATE (deploy-plan.md:73) — the PR does not merge without
(a) the WAF rule live, (b) TTL ≤600 s, (c) the safety header. (b) and (c)
are code (change #1); (a) is this step.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Anonymous request returns 401 JSON: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/realtime/token` → `401`

#### Manual Verification:

- With a logged-in browser session (local dev + `OPENAI_API_KEY` in
  `.env.local`), `fetch('/api/realtime/token', { method: 'POST' })` returns
  `{ value: "ek_...", expiresAt }` with expiry ~120 s ahead (≤600 s
  MERGE-GATE cap)
- WAF rule created in the Vercel dashboard; preview URL returns 429 after
  exceeding the per-IP threshold
- No `OPENAI_API_KEY` leak: response JSON contains only the `ek_` token
- Logged-out navigation to `/` still redirects to `/login` (proxy regression
  check after the API carve-out)

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Conversation core

### Overview

The working E2E conversation: install the SDK, extend the orb with states,
build the conversation component (state machine + session lifecycle), replace
the accepted-phase stub. Ends with a real 2–3 min conversation on desktop.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add `@openai/agents-realtime` and `zod@^4` (peer dependency —
currently only a transitive lockfile entry, must be direct).

**Contract**: Two new `dependencies`; no config changes expected
(OpenAI's official `examples/realtime-next` runs Next 16 + React 19 with an
empty `next.config.ts`). Verify the SSR import check (Critical Details).

#### 2. Orb conversation states

**File**: `src/components/orb.tsx`, `src/app/globals.css`

**Intent**: The orb becomes the sole FR-008 surface. Accept an optional state
prop and map it to CSS class variants; default preserves the current idle
look (S-02 usage stays valid without edits).

**Contract**: `Orb({ state?: 'idle' | 'connecting' | 'listening' |
'user-speaking' | 'processing' | 'speaking' })`. Visual mapping is the
implementer's call (animation tempo/intensity/color per state), constraints:
each state visually distinct at a glance, transitions via CSS only (no
remount), `prefers-reduced-motion` fallback preserved (globals.css already
handles it for idle).

#### 3. Agent instructions

**File**: `src/lib/realtime/instructions.ts` (new)

**Intent**: `buildInstructions(topic: Topic): string` — the conversation
partner spec, kept out of the component for S-04/S-06 evolution.

**Contract**: English-only friendly conversation partner on `topic.title` /
`topic.description`; understands Polish but always replies in English,
gently encouraging the user back to English (decision); does NOT correct
language errors mid-conversation (FR-010: analysis is post-hoc); keeps the
conversation flowing with questions; no level adaptation (S-06).

#### 4. Voice conversation component

**File**: `src/components/voice-conversation.tsx` (new, `'use client'`)

**Intent**: Owns the whole conversation lifecycle: token fetch, getUserMedia
pre-check, `RealtimeAgent`/`RealtimeSession` construction, event wiring →
UI-state machine, end button, teardown. Receives `topic` and callbacks from
`session-start.tsx`.

**Contract**: UI-state machine:
`connecting → active(listening | user-speaking | processing | speaking) →
ended | error`. Event mapping (from `docs-openai-agents-realtime.md` §4 +
research corrections §2): `agent_start/agent_end` → processing bounds;
`audio_start/audio_stopped` → speaking; transport
`input_audio_buffer.speech_started/stopped` → user-speaking (server_vad);
`audio_interrupted` → back to listening; transport
`connection_change`/`disconnected` → teardown/error. Session created with
`new RealtimeSession(agent, { model: 'gpt-realtime-2.1', config: {...} })`
mirroring the server-pinned audio config in camelCase (turnDetection
server_vad threshold 0.75, noiseReduction far_field, transcription
gpt-4o-mini-transcribe) and connected via `connect({ apiKey: ek })` — the
SDK's connect-time `session.update` would otherwise reset the pinned config
to its defaults (Critical Details: Mirror the session config client-side). "Zakończ rozmowę" button always visible → `session.close()`
(FR-009). Cleanup + StrictMode guard per Critical Details. In this phase,
ending returns to the topic-proposal phase (Phase 3 adds the end screen).

#### 5. Mount in session-start

**File**: `src/components/session-start.tsx`

**Intent**: Replace the accepted-phase stub (lines 59–75) with
`VoiceConversation`; the orb (already persistent above both phases) receives
the conversation state.

**Contract**: `Phase` becomes `'proposal' | 'conversation'`; conversation
state lifts to whatever level lets the persistent `<Orb>` receive it (state
lives in `VoiceConversation`, surfaced via callback or lifted state — 
implementer's call; the orb element must not move in the tree). "Zmień
temat" disappears during an active conversation (ending it is the way back).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes (prerender OK — SSR import check resolved)
- `npm ls zod @openai/agents-realtime` shows both as direct deps, no peer warnings

#### Manual Verification:

- Full 2–3 min English conversation on desktop Chrome: user speaks, agent
  answers with voice, on topic, in English
- Orb visibly transitions connecting → listening → user-speaking →
  processing → speaking; each change ≤500 ms after the underlying event
- Barge-in: interrupting the agent mid-sentence stops its audio
- "Zakończ rozmowę" ends the session; the browser mic indicator turns off
- Dev StrictMode: no duplicate audio, no double sessions after mount/unmount
- Speaking Polish gets an English reply steering back to English

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Session lifecycle & resilience

### Overview

The 5-minute hard cap with countdown, inline error states with manual retry,
and the `ended` phase stub that S-04 will replace with the report.

### Changes Required:

#### 1. Session time cap

**File**: `src/components/voice-conversation.tsx`

**Intent**: Client-side hard cap (decision): visible countdown from 5:00,
visual warning at 4:30, automatic `session.close()` at 0:00 flowing into the
`ended` state — a cost fuse consistent with the 2–3 min product framing.

**Contract**: Timer starts when the session reaches `active`; countdown
rendered near the end button; warning = visual emphasis (no audio
interruption of the conversation); timer cleared on any teardown path.
Client-side only — acceptable because token minting is login-gated and
rate-limited.

#### 2. Error states with manual retry

**File**: `src/components/voice-conversation.tsx`

**Intent**: Two distinct inline error cards (decision): mic permission denied
(`NotAllowedError` from the getUserMedia pre-check or `connect()`) with
browser-unblock instructions, and connection dropped (unexpected
`disconnected`/`error` while active) with "Spróbuj ponownie". Retry mints a
fresh token and starts a new session (previous exchange is lost — accepted
for a 2–3 min session).

**Contract**: `error` UI state carries a `kind: 'mic-denied' | 'connection'`;
both cards keep the way back to the topic phase. Distinguish user-initiated
close from unexpected disconnect (a flag set by the end button/timer) so a
normal end never renders an error.

#### 3. End screen (S-04 hand-off stub)

**File**: `src/components/voice-conversation.tsx`, `src/components/session-start.tsx`

**Intent**: The `ended` state renders "Sesja zakończona" + a note that the
report arrives in the next build step + "Nowa sesja" button (back to topic
proposal, fresh draw) — mirroring the S-02→S-03 stub pattern.

**Contract**: Conversation history (from `history_updated`, kept in client
state/ref during the session) is retained in memory on the ended screen —
S-04's hand-off point. Nothing is persisted or displayed (no transcript UI);
raw audio is never stored anywhere (NFR: WebRTC streams are transient by
design — nothing to clean up, but do not add recording).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes

#### Manual Verification:

- Countdown visible during conversation; warning state at 4:30; session
  auto-ends at 5:00 into the end screen
- Mic denied (block permission in browser): inline instructions shown; after
  unblocking, retry starts a working session
- Kill network mid-conversation: connection-error card with retry; retry
  starts a fresh working session; normal end never shows an error
- End screen: "Nowa sesja" returns to a fresh topic proposal
- Safari iOS smoke test: conversation works; known quirks (BT audio routing)
  acceptable per research
- PR preview verified in a logged-in browser (Deployment Protection —
  anonymous 401 is expected, not a failure)

---

## Testing Strategy

### Unit Tests:

- None — no test framework is configured in the repo (AGENTS.md); this slice
  does not introduce one. Verification = lint + build + the manual protocol.

### Integration Tests:

- None automated. The E2E path (token → WebRTC → conversation → teardown) is
  covered by the phase-by-phase manual protocol.

### Manual Testing Steps:

1. Anonymous curl to the token route → 401 JSON (Phase 1)
2. Logged-in token fetch → `ek_` with TTL ≤600 s (Phase 1)
3. WAF: exceed per-IP threshold on preview → 429 (Phase 1)
4. Full conversation on desktop Chrome with orb-state walkthrough (Phase 2)
5. Barge-in, end button, StrictMode double-mount check (Phase 2)
6. Timer cap, mic-denied flow, network-kill flow, end screen (Phase 3)
7. Safari iOS smoke test (Phase 3)

## Performance Considerations

- Orb state changes are discrete class swaps on a persistent element — no
  remounts, no per-audio-frame re-renders (transient values in refs).
- Token route is a single upstream fetch on Node runtime in fra1; POST
  handlers are never cached, `no-store` is belt-and-suspenders.
- The SDK bundle loads with the session-start client component; if bundle
  size becomes a concern, `next/dynamic` on `VoiceConversation` is the lever
  (not needed by default).

## Migration Notes

No data, no schema, no config migrations. Rollback = revert the PR; the WAF
rule can stay (it only guards a path that would then 404).

## References

- Related research: `context/changes/first-voice-conversation/research.md`
- API surface extract: `context/changes/first-voice-conversation/docs-openai-agents-realtime.md`
- Mount point: `src/components/session-start.tsx:59-75`
- Route conventions: `src/app/auth/callback/route.ts`
- Auth helpers: `src/lib/supabase/server.ts:8,34`
- MERGE-GATE + standing constraints: `context/deployment/deploy-plan.md:73-83`
- Requirements: `context/foundation/prd.md:82-89,108-110` (FR-006–FR-009, NFRs)
- Slice definition: `context/foundation/roadmap.md:106-117`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token endpoint + MERGE-GATE

#### Automated

- [x] 1.1 `npm run lint` passes — ae665b7
- [x] 1.2 `npm run build` passes — ae665b7
- [x] 1.3 Anonymous POST to `/api/realtime/token` returns 401 JSON — ae665b7

#### Manual

- [x] 1.4 Logged-in token fetch returns `ek_` with expiry ~120 s (≤600 s cap) — ae665b7
- [x] 1.5 WAF rule live; preview returns 429 over the per-IP threshold — ae665b7
- [x] 1.6 Response contains only the `ek_` token (no key leak) — ae665b7
- [x] 1.7 Logged-out navigation to `/` still redirects to `/login` (proxy regression) — ae665b7

### Phase 2: Conversation core

#### Automated

- [x] 2.1 `npm run lint` passes
- [x] 2.2 `npm run build` passes (SSR import check resolved)
- [x] 2.3 `npm ls` shows `zod` + `@openai/agents-realtime` as direct deps, no peer warnings

#### Manual

- [x] 2.4 Full 2–3 min English conversation on desktop Chrome
- [x] 2.5 Orb transitions through all states ≤500 ms after events
- [x] 2.6 Barge-in stops agent audio
- [x] 2.7 "Zakończ rozmowę" ends session; mic indicator off
- [x] 2.8 StrictMode: no duplicate audio/sessions
- [x] 2.9 Polish input gets an English steer-back reply

### Phase 3: Session lifecycle & resilience

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Countdown + 4:30 warning + auto-end at 5:00 into end screen
- [ ] 3.4 Mic-denied flow: instructions + working retry after unblocking
- [ ] 3.5 Network-kill flow: error card + fresh-session retry; normal end shows no error
- [ ] 3.6 End screen "Nowa sesja" returns to fresh topic proposal
- [ ] 3.7 Safari iOS smoke test passes (known quirks acceptable)
- [ ] 3.8 PR preview verified in a logged-in browser
