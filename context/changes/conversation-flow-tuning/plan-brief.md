# Conversation Flow Tuning — Plan Brief

> Full plan: `context/changes/conversation-flow-tuning/plan.md`

## What & Why

The tutor should lead the conversation, not teach in the middle of it. Today it waits for the learner to break the silence — the worst possible opening for a persona defined by fear of speaking — and, once talking, it drifts into explaining and helping instead of asking. S-07 makes the tutor open the session itself and keep the learner talking, with all language feedback left where S-04 put it: the post-session report.

## Starting Point

The voice path (S-03) and report path (S-04) both work. The prompt has said "You start the conversation. Do not wait for the user to speak first" since 2026-07-22 (`instructions.ts:33`) and the tutor still says nothing — because the Realtime API only speaks after a trigger event, and `session.connect()` sends none. Separately, the prompt forbids *corrections* but not *explaining or supplying words*, and S-06's A2 calibration explicitly tells the tutor to "offer the missing word" — a rule and its counter-rule in one prompt.

## Desired End State

Within a couple of seconds of connecting, the learner hears a greeting and a first question about the chosen topic. For the rest of the 3:00 the tutor reacts in one or two sentences and asks exactly one question; it never corrects, explains, translates or hands over vocabulary. When the learner genuinely stalls, the tutor simplifies its own question instead of finishing their sentence. The report is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Why the tutor is silent | Missing trigger, not a prompt problem | The instruction has existed since S-03; Realtime only responds after `response.create`. | Plan |
| Trigger mechanism | `session.transport.requestResponse?.()` after `connect()` | `sendMessage()` would inject a fake **user** turn that `buildTurns()` feeds to the CEFR examiner — a direct hit on the S-04 "no invented errors" guardrail. | Plan |
| In-conversation help | Rescue only when genuinely stalled, by rephrasing | Keeps a paralysed learner from getting stuck in silence without turning the session into a lesson. | Plan |
| Opening & countdown | Tutor speaks immediately; 3:00 starts at connect | The learner never faces silence; timer logic stays untouched, greeting cost (~10–15 s) accepted. | Plan |
| Tutor turn shape | 1–2 sentences + exactly one question | Shifts speaking time to the learner and is checkable on a transcript. | Plan |
| S-06 A2 contradiction | Rewrite the A2 line to rephrase-only | Two conflicting rules in one prompt is the worst outcome — the model picks at random. | Plan |
| Verification | Manual, on the archived transcript | No test framework exists and the outcome is a behavioural judgement; two `! grep -q`s pin the retired fragments. | Plan |
| Unreachable `speaking` state | Make it reachable via `response.output_audio_transcript.delta` | `audio_start` only fires on the WebSocket transport, so the tutor's entire opening turn would be labelled "Chwila namysłu…" — an FR-008 miss on the first thing the learner sees. | Plan review (F1) |
| Failed opening response | ~5 s fallback from `processing` back to `listening` | Moving the initial state to `processing` created a new 3-minute dead-end that the old `listening` default did not have. | Plan review (F2) |

## Scope

**In scope:** the opening-response trigger, the initial UI state, a reachable `speaking` state and a fallback out of `processing` — all in `voice-conversation.tsx`; the `Rules:` block and the A2 calibration paragraph in `instructions.ts`.

**Out of scope:** barge-in handling for the greeting; new `ConversationState` members or changed `STATE_LABELS` texts; countdown / 3:00 cap; `/api/report` and the report prompt; telemetry or speaking-time metrics; a test framework; a `lessons.md` entry (offered, declined).

## Architecture / Approach

Two files, no new modules. Phase 1 works entirely inside the existing connect effect: one transport call (inside the `try`, after the `cancelled` guard), a `processing` initial state, one extra branch in the raw `transport_event` handler, and a one-shot fallback timer. Phase 2 rewrites prompt strings in `buildInstructions()` and one sentence of `CEFR_CALIBRATION_TARGETS`. Both land on `feat/conversation-flow-tuning` and reach `master` via a single PR (`protect-master` blocks direct pushes).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tutor opens the conversation | Greeting + first question happen without the learner speaking, with the UI labelling it correctly | Touches the S-03 state machine in three places; `requestResponse()` throws on a dead data channel (5 s-ack-timeout path) — must stay inside the existing `try` |
| 2. Prompt leads instead of teaching | No teaching mid-conversation, 1–2 sentence turns, narrow rescue | Over-tightening makes the tutor sound like an interrogator, or the A2 rescue disappears and stalled learners drop out |

**Prerequisites:** S-03 voice path (done), S-04 report (done), S-06 calibration (done, revised here); Vercel preview access with a logged-in browser; a working mic; an iOS device for the Safari autoplay check.
**Estimated effort:** ~1 session, 2 phases, ~60 lines of diff plus two manual test conversations.

## Open Risks & Assumptions

- **Assumption (question skipped during planning):** the exact observed symptom of "the tutor floods me with explanations" was not specified, so Phase 2 covers all four classes at once — corrections, explanations/translations, unsolicited word-supply, and over-long turns. If the real symptom was something else, the prompt may be tighter than necessary.
- Prompt rules are probabilistic — a residual chance remains that the model occasionally explains anyway; only a transcript read will show it.
- This deliberately narrows a behaviour accepted in the closed S-06 slice (A2 word-supply). Restoring it would be a new decision.
- The greeting eats ~10–15 s of the 3:00 budget, so slightly less learner material reaches the report.
- **Safari iOS autoplay is unverified.** The greeting is now the first audio playback of a session and happens before any learner speech. The topic-card tap keeps the gesture chain intact, but if Safari blocks it the greeting fails silently — on the platform S-03 already flagged as riskiest. Phase 1 verifies this on a device.
- The ~5 s fallback threshold is a guess; real Realtime opening latency was not measured.

## Success Criteria (Summary)

- The learner never has to start the conversation, and never sees "Słucham — mów śmiało" before the tutor has spoken.
- On the archived transcript, tutor turns are short, one question each, and free of corrections, explanations and translations — while the tutor still keeps the conversation moving.
- The post-session report still renders and still flags only genuine learner errors.
