---
change_id: first-voice-conversation
type: reference
topic: "@openai/agents-realtime — API documentation extract for S-03"
created: 2026-07-22
sources: Context7 (/websites/openai_github_io_openai-agents-js), 2026-07-22
---

# @openai/agents-realtime — docs extract for S-03

Companion to `research.md` (which holds the library decision and MERGE-GATE
mapping). This file holds the concrete API surface needed to implement the
slice. Canonical docs: https://openai.github.io/openai-agents-js/guides/voice-agents/

Package: `@openai/agents-realtime` (also re-exported as `@openai/agents/realtime`).

## 1. Minimal browser connection (WebRTC + ephemeral key)

`RealtimeSession.connect()` in the browser automatically requests the
microphone (getUserMedia) and wires audio playback over WebRTC — no manual
audio element handling needed.

```typescript
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

const agent = new RealtimeAgent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant.', // S-03: English tutor prompt + accepted topic
});

const session = new RealtimeSession(agent, {
  model: 'gpt-realtime-2.1',
});

await session.connect({
  apiKey: 'ek_...', // ephemeral client secret minted server-side (never sk-)
});
```

## 2. Ephemeral token minting (server side — the MERGE-GATE route)

The browser key comes from `POST /v1/realtime/client_secrets`, called with the
server-side `OPENAI_API_KEY`:

```bash
curl -X POST https://api.openai.com/v1/realtime/client_secrets \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session": {
      "type": "realtime",
      "model": "gpt-realtime-2.1"
    }
  }'
# response contains .value = "ek_..." (short-lived)
```

In S-03 this becomes a Next.js route handler; the MERGE-GATE safeguards
(rate limit, TTL ≤600 s via `expires_after`, `OpenAI-Safety-Identifier`
header) attach here — see `research.md` §Token endpoint.

Session config (model, VAD, transcription) can be pinned server-side in the
`session` payload when minting, so the client cannot override it.

## 3. Session configuration (VAD, transcription, audio)

Full config shape — SDK normalizes this into Realtime `session.update`.
Prefer the nested `audio` structure (older flat aliases are deprecated):

```typescript
const session = new RealtimeSession(agent, {
  model: 'gpt-realtime-2.1',
  config: {
    outputModalities: ['audio'],
    audio: {
      input: {
        format: 'pcm16',
        transcription: {
          model: 'gpt-4o-mini-transcribe', // both-side transcript → S-04 input
        },
        turnDetection: {
          type: 'semantic_vad',        // or 'server_vad' (threshold-driven)
          eagerness: 'medium',
          createResponse: true,
          interruptResponse: true,     // barge-in
        },
        // Safari iOS speakerphone echo mitigation (research.md §Safari):
        // noiseReduction: { type: 'far_field' } + server_vad threshold ~0.75
      },
      output: { format: 'pcm16' },
    },
  },
});
```

Notes:

- `semantic_vad` = natural turn detection from speech patterns;
  `server_vad` = silence-threshold driven with granular control
  (threshold, silence duration) — candidate for the Safari echo mitigation.
- Fields not surfaced by the SDK can be passed via `providerData` or raw
  transport events.
- Disabling VAD enables manual/push-to-talk flows (not needed for S-03).

## 4. Session events → UI states (FR-008: speaking / listening / processing)

`RealtimeSession` is an event emitter (`session.on(...)`):

| Event | Fires when | S-03 use |
| --- | --- | --- |
| `agent_start` / `agent_end` | agent starts/finishes working on a response | UI: *processing* |
| `audio_start` / `audio_stopped` | agent starts/stops generating audio | UI: *agent speaking* |
| `audio_interrupted` | user barges in during agent audio | stop local playback state |
| `history_updated` | conversation history changes (full history in payload) | live transcript + S-04 material |
| `error` | session error | error UI / teardown |
| `tool_approval_requested` | tool needs approval | n/a for S-03 |

User-side speech detection (UI: *user speaking*) comes from raw transport
events, not the high-level list above — listen via
`session.on('transport_event', e => ...)` for
`input_audio_buffer.speech_started` / `input_audio_buffer.speech_stopped`
(emitted by server VAD). Verify exact event names against the transport
docs during implementation.

```typescript
session.on('audio_interrupted', () => {
  // WebRTC clears buffered output automatically; WebSocket would need
  // manual playback stop. We're on WebRTC in the browser → mostly UI state.
});

session.on('history_updated', (history) => {
  // full session history — render transcript, keep for S-04 report
});
```

History can also be edited: `session.updateHistory(arrayOrUpdaterFn)`.

## 5. Ending the session (FR-009: end at any moment)

- `session.close()` — terminates the session/connection (wire to the
  "End conversation" button).
- Transport emits `disconnected` when the connection closes — hook for
  final UI state / navigation to the (future) report screen.

## Gaps to verify during implementation

1. Exact transport event names for user speech start/stop on WebRTC
   (`input_audio_buffer.speech_started`?) — check
   `openai/agents-realtime` transport type-aliases page.
2. Where `expires_after` and `OpenAI-Safety-Identifier` go in the
   `client_secrets` request body/headers — covered by the OpenAI platform
   docs (developers.openai.com/api/docs/guides/realtime-webrtc), not the
   Agents SDK docs.
3. Whether mic permission denial surfaces as `error` event or a thrown
   rejection from `connect()` — needed for the permission-denied UX.
