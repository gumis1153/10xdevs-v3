# Conversation Flow Tuning Implementation Plan

## Overview

S-07 makes the tutor **lead** the conversation instead of teaching in the middle of it. Two things change: (1) the tutor opens the session itself — greeting plus first question — instead of waiting for the learner to break the silence, and (2) the partner prompt stops explaining, translating and supplying words, keeps its turns to one or two sentences with exactly one question, and helps only when the conversation has genuinely stalled. Language feedback stays where S-04 put it: in the post-session report.

## Current State Analysis

The voice path (S-03) works and the report path (S-04) works. What is missing is not an instruction — it is a trigger.

- `src/lib/realtime/instructions.ts:33` **already** says `You start the conversation: greet the user briefly and open the topic with a first question. Do not wait for the user to speak first.` — present since S-03 (`a23e448`, 2026-07-22). The tutor still says nothing.
- Reason: the Realtime API only produces a response after a trigger event. `session.connect()` sends `session.update` and nothing else, so with `server_vad` turn detection the first response is generated only after the learner's first speech turn closes. No prompt wording can fix this.
- `src/lib/realtime/instructions.ts:36` already forbids in-conversation corrections, but nothing forbids *explaining*, *translating* or *supplying vocabulary* — and S-06 explicitly instructs the opposite at A2 (`instructions.ts:11`: "wait several seconds, then offer the missing word or rephrase more simply"). The prompt currently contains a rule and its counter-rule.
- Tutor turn length is capped loosely at "two or three sentences" (`instructions.ts:38`) with no limit on questions per turn.
- On successful connect, `src/components/voice-conversation.tsx:240` sets `listening` ("Słucham — mów śmiało") and starts the 3:00 countdown. With the tutor speaking first, that label is wrong for the opening beat.

## Desired End State

A learner who starts a session hears the tutor greet them and ask the first question within a couple of seconds of connecting — they never face silence and never have to start. For the rest of the 3:00 the tutor reacts briefly to what they said and asks one question; it does not correct, does not explain words or grammar, does not hand them vocabulary, and does not comment on their English. When the learner is genuinely stuck, the tutor simplifies or rephrases its own question rather than finishing their sentence. All language feedback appears in the post-session report, unchanged.

Verified by two manual sessions (one speaking deliberately at A2) plus a read of the archived transcript.

### Key Discoveries:

- `session.transport.requestResponse?.()` is the correct trigger. `RealtimeSession.transport` is typed as `RealtimeTransportLayer` (`realtimeSession.d.ts:150`) where `requestResponse?()` is optional (`transportLayer.d.ts:62`), so the call site must use optional-call syntax; the WebRTC transport implements it (`openaiRealtimeWebRtc.mjs:327`) and routes through the response sequencer.
- **Do NOT use `session.sendMessage()`** to kick things off. It injects a *user* item into the conversation (`openaiRealtimeBase.d.ts:88`), which `buildTurns()` maps to a `learner` turn (`src/lib/realtime/transcript.ts:34`), which lands in the `/api/report` payload — the CEFR examiner would then grade a sentence the learner never said. That violates the S-04 trust guardrail ("no invented errors").
- `connect()` resolves only after the data channel is `open` **and** the `session.updated` ack arrives (or a 5 s timeout), `openaiRealtimeWebRtc.mjs:170-212`. So immediately after `await session.connect()` the channel is open and the pinned session config (including instructions) is already applied — the correct place for the trigger.
- `requestResponse()` throws synchronously if the data channel is not open (`#assertConnected`, `openaiRealtimeWebRtc.mjs:333`). The 5 s-timeout path can resolve `connect()` on a channel that has since closed, so the call must sit inside the existing `try` block.
- The session config is mirrored client-side on purpose (`voice-conversation.tsx:159-174`) because the SDK's `connect()` sends its own `session.update`. Do not touch that block.
- **The `speaking` state is currently unreachable.** It is set only by the `audio_start` handler (`voice-conversation.tsx:179`), and `RealtimeSession` emits `audio_start` only on the transport's `audio` event (`realtimeSession.mjs:576-580`) — which is emitted **only by the WebSocket transport** (`openaiRealtimeWebsocket.mjs:85`). WebRTC plays audio through the media track and never fires it. So today the tutor speaks while the UI reads "Chwila namysłu…" (`agent_start` → `processing`), and the orb never enters its speaking state (`session-start.tsx:16-18`). Pre-existing since S-03, but S-07 moves it into the first 10–15 s of every session, against FR-008. `response.output_audio_transcript.delta` *does* arrive over the data channel and is a usable substitute signal.
- The report route only writes an archive row on a successful report (`src/app/api/report/route.ts:146`); the `insufficient_material` branch returns at line 76-84, before the insert. The `insufficient` screen also does not render the transcript (`src/components/session-report.tsx:56-75` ignores `transcriptLines`). A greeting-only session therefore leaves no transcript to inspect anywhere — transcript assertions must run on a full session.
- The report route's grounding gate already filters every flagged error to verbatim substrings of the **learner** corpus (`route.ts:126-131`), so a tutor turn can never be quoted as an error. That gate is *not* a defence against the `sendMessage()` anti-pattern above: an injected user item would be part of `learnerCorpus` and would pass the gate.

## What We're NOT Doing

- Not adding barge-in / interruption handling for the opening greeting (`audio_interrupted` already maps to `listening`; the existing behaviour stands).
- Not adding, renaming or removing any `ConversationState` member and not changing `STATE_LABELS` texts. Phase 1 only makes the existing `speaking` state reachable and adds a fallback out of `processing` — the orb mapping (`session-start.tsx:16-18`) needs no change.
- Not changing the countdown logic or `SESSION_SECONDS` (3:00). The greeting consumes ~10–15 s of the session budget — accepted.
- Not touching `/api/report`, `src/lib/report/prompt.ts`, the report schema, or the archive.
- Not adding telemetry, speaking-time metrics, or a dev-only transcript character counter.
- Not adding an automated test framework (none exists in this repo; see AGENTS.md §Testing).
- Not adding an entry to `context/foundation/lessons.md` (offered and declined).
- Not revisiting the topic list, the orb, or the header.

## Implementation Approach

Two phases, smallest-visible-change first. Phase 1 is the mechanical fix that makes the *existing* instruction take effect — one call plus one initial state. Phase 2 is the behavioural tuning of the prompt, which is verifiable on its own because it changes what the tutor says during the conversation, not whether it speaks first. Splitting them keeps the diagnosis clean: if the result feels wrong after Phase 2, we know the trigger already worked.

Both phases land on one branch (`feat/conversation-flow-tuning`) and go to `master` through a single PR — direct pushes to `master` are blocked by the `protect-master` ruleset (`context/foundation/lessons.md`).

## Critical Implementation Details

**Timing & lifecycle.** The trigger belongs inside the existing async IIFE in the connect effect, after `await session.connect()` and after the `cancelled` guard that closes the session — otherwise a StrictMode double-run would mint a greeting on a session it is about to close. It must stay inside the `try`, so that a throw from `#assertConnected` (dead data channel on the 5 s-timeout path) surfaces through the existing `connection` error card instead of an unhandled rejection.

**State sequencing.** Set the post-connect state to `processing` (not `listening`) *before* triggering the response, so the orb never reads "Słucham — mów śmiało" while the learner is supposed to be listening. `processing` is in `ACTIVE_STATES`, so the countdown still starts here — unchanged behaviour. Two consequences the implementer must handle, both covered in Phase 1:

- `processing` is now the state the session can get *stuck* in: if the opening response never materialises, no `turn_started` / `audio_done` / `turn_done` arrives, `session.on('error')` only logs (`voice-conversation.tsx:185-187`), and the learner watches "Chwila namysłu…" for the full 3:00 with no cue to speak. Before this change the same failure was harmless, because the state was `listening`. Hence the fallback timeout.
- `speaking` must become reachable, or the tutor's whole opening turn is labelled "Chwila namysłu…" (see Key Discoveries).

## Phase 1: Tutor opens the conversation

### Overview

Make the tutor's first turn actually happen, and make the UI say the right thing while it is being produced.

### Changes Required:

#### 1. Voice conversation core

**File**: `src/components/voice-conversation.tsx`

**Intent**: After a successful connect, put the UI into the "tutor is preparing to speak" state and ask the model for the opening turn, so the learner never faces silence. The greeting content itself comes from the prompt (`instructions.ts:33`), which already asks for it.

**Contract**: Inside the connect effect's async IIFE, replace the current `setActiveState('listening')` on success with `setActiveState('processing')`, keep `updateSecondsLeft(SESSION_SECONDS)`, and then trigger the opening response via the transport. Because `RealtimeTransportLayer.requestResponse` is optional in the type, the call is `session.transport.requestResponse?.()`. It must remain inside the existing `try` and after the `if (cancelled) { session.close(); return }` guard. Do not use `session.sendMessage()` — see Key Discoveries.

#### 2. Reachable `speaking` state

**File**: `src/components/voice-conversation.tsx`

**Intent**: Make the UI say "Rozmówca odpowiada…" while the tutor is actually talking. Today `speaking` is dead on the WebRTC transport (see Key Discoveries), which would label the entire opening turn "Chwila namysłu…" — the first thing the learner ever sees from this feature, and a direct FR-008 miss.

**Contract**: Extend the existing raw-event handler `session.on('transport_event', …)` (`voice-conversation.tsx:190-196`) — the same place `input_audio_buffer.speech_started` / `speech_stopped` are already handled — with a branch for `response.output_audio_transcript.delta` that calls `setActiveState('speaking')`. The event arrives over the data channel on WebRTC and repeats many times per turn; `setState` with an unchanged value bails out, so no extra guard is needed. Leave the existing `audio_start` handler in place — it is the correct signal if the transport ever changes to WebSocket. Do not add or rename any `ConversationState` member and do not change `STATE_LABELS` texts; `speaking` and its label already exist.

#### 3. Fallback out of the opening `processing` state

**File**: `src/components/voice-conversation.tsx`

**Intent**: Guarantee that a failed opening response degrades to the old, harmless behaviour instead of trapping the learner. If the tutor's turn never starts, the UI must return to "Słucham — mów śmiało" so the learner knows they can speak.

**Contract**: After a successful connect, arm a one-shot timer (~5 s) that calls `setActiveState('listening')` only if the state is still `processing` and the effect has not been cancelled. It must be cleared when the tutor's turn starts (`agent_start` / the new `speaking` branch) and in the effect's cleanup, alongside `session.close()`. Do not reuse or alter the existing 1-second countdown interval (`voice-conversation.tsx:268-284`) — it owns the session clock and auto-end.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build and typecheck pass: `npm run build`

#### Manual Verification:

- On the Vercel preview, starting a session results in the tutor greeting the learner and asking a first question about the chosen topic, without the learner speaking first.
- The label never reads "Słucham — mów śmiało" before the tutor has spoken, and reads "Rozmówca odpowiada…" while the tutor is actually talking (both during the greeting and during later tutor turns).
- The 3:00 countdown starts at connect and the session still auto-ends at 0:00 with the report screen.
- Ending the session right after the greeting (no learner speech) still shows the "za mało materiału" outcome, not an error.
- Interrupting the greeting by speaking over it does not leave the UI stuck (state returns to listening / user-speaking).
- Fallback check (local dev): with the `requestResponse` call temporarily commented out, the label returns to "Słucham — mów śmiało" within ~5 s instead of staying on "Chwila namysłu…".
- On Safari on iOS (mobile web), tapping a topic card produces an **audible** greeting — the autoplay gesture chain still holds now that the first playback precedes any learner speech.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Prompt leads instead of teaching

### Overview

Rewrite the conversation rules so the tutor's job is to keep the learner talking, and remove the contradiction S-06 introduced at A2.

### Changes Required:

#### 1. Conversation partner prompt

**File**: `src/lib/realtime/instructions.ts`

**Intent**: Tighten the `Rules:` block so that (a) the existing no-corrections rule is extended to cover explaining, teaching and translating, (b) tutor turns shrink to one or two sentences with exactly one question, and (c) the only permitted help is a narrowly-defined rescue when the conversation has genuinely stalled — and that rescue simplifies or rephrases the tutor's own question rather than supplying the learner's words. Keep the existing tone: an adult talking to an adult, not a quiz master.

**Contract**: Edits to the `Rules:` array entries in `buildInstructions()`:

- Extend the existing no-correction rule (line 36) into a rule covering corrections, rewordings, grammar or vocabulary explanations, translations and unsolicited word suggestions, stating once that all language feedback happens after the session.
- Replace the "two or three sentences" rule (line 38) with: one or two sentences plus exactly one question per turn, and state that the reaction-plus-one-question shape is what gives the learner most of the speaking time. At A2 an example answer may be attached to that single question — it does not count as a second question.
- Add the rescue rule with a narrow trigger: only when the learner has been silent for several seconds or has visibly failed twice to get an utterance out. The rescue is to simplify, rephrase, or offer a two-option version of the tutor's own question — never to supply the missing word, finish the sentence, or translate.

**Note for the implementer**: the "these targets shape HOW you speak, not how much" line (line 47) references the two-or-three-sentence limit by name — it must be updated to point at the new limit, or the prompt will reference a rule that no longer exists.

#### 2. A2 calibration target (revision of S-06)

**File**: `src/lib/realtime/instructions.ts`

**Intent**: Remove the direct contradiction inside `CEFR_CALIBRATION_TARGETS`. The A2 band currently instructs the tutor to hand the learner the missing word; the rest of the prompt now forbids exactly that. This is a deliberate, recorded revision of a decision made in the closed S-06 slice — the rest of A2 calibration (pace, sentence length, vocabulary, closed questions, no infantilising) stays intact.

**Contract**: In the A2 paragraph of `CEFR_CALIBRATION_TARGETS` (line 11), the clause "wait several seconds, then offer the missing word or rephrase more simply" becomes rephrase-only, consistent with the rescue rule above. Tolerating long silences stays. Do not touch the B1 and B2 paragraphs — B1's "rephrase rather than repeat" and B2's "do not fill their pauses" are already consistent with the new rules.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build and typecheck pass: `npm run build`
- The phrase `offer the missing word` is gone: `! grep -q "offer the missing word" src/lib/realtime/instructions.ts` (exits 0 when absent — `grep -c` would exit 1 on a zero count and read as a failed step)
- No rule references the retired "two or three sentences" limit: `! grep -q "two or three sentences" src/lib/realtime/instructions.ts`

#### Manual Verification:

- Session A (speak at your normal level, ~3:00): reading the archived transcript, every tutor turn is at most two sentences and contains at most one question mark.
- Session A: no tutor turn corrects, rewords, explains a word or grammar point, or translates anything; no tutor turn comments on the learner's English.
- Session A: tutor turns are visibly shorter than learner turns across the transcript.
- Session B (deliberately speak at A2 — short, hesitant sentences, a few long pauses): the tutor simplifies or rephrases its own question and does not finish the learner's sentences or hand them vocabulary; it still never states or hints at a level.
- The post-session report renders for both sessions (grouped errors / CEFR with disclaimer / suggestions).
- The first line of each archived transcript is a `Tutor:` line (the greeting), and no `Learner:` line anywhere contains words the learner did not say — the check that the trigger did not inject a fake user turn.
- The tutor still stays on the session topic and still never switches to Polish.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before opening the PR.

---

## Testing Strategy

No test framework is configured in this repo (AGENTS.md §Testing Guidelines), and this change is prompt-and-trigger only — its outcome is a behavioural judgement on a transcript, which is exactly what a unit test cannot assert. Verification is therefore:

### Automated:

- `npm run lint` and `npm run build` (typecheck) after each phase.
- Two `! grep -q` assertions in Phase 2 that pin the two retired instruction fragments, so a future edit cannot silently reintroduce the contradiction. `! grep -q` (not `grep -c`) because a zero count exits 1 and would read as a failed verification step.

### Manual Testing Steps:

1. Open the PR preview URL (Deployment Protection applies — use a logged-in browser or `vercel curl / --deployment <preview-url>`), log in, start a session.
2. Say nothing for ~10 s. The tutor must greet you and ask a question. Watch the label: it must not read "Słucham — mów śmiało" before the tutor speaks, and must read "Rozmówca odpowiada…" while it does.
3. Repeat step 2 on Safari on iOS and confirm the greeting is **audible**.
4. Locally, comment out the `requestResponse` call and start a session: the label must fall back to "Słucham — mów śmiało" within ~5 s rather than sitting on "Chwila namysłu…". Restore the call.
5. Hold a full ~3:00 session at your normal level (Session A). Let it auto-end.
6. Open the session in the archive and read the transcript against the Phase 2 manual criteria (turn length, one question, no teaching, tutor shorter than learner, first line is `Tutor:`).
7. Run a second ~3:00 session speaking deliberately at A2 with long pauses (Session B) and check the rescue behaviour in the transcript.
8. Check both reports render.
9. Edge case: start a session and press "Zakończ rozmowę" immediately after the greeting — expect "za mało materiału do analizy", not an error. (No transcript is available on this path: the `insufficient` screen does not render one and no archive row is written.)

## Performance Considerations

None new. The tutor's opening turn adds one Realtime response per session (~10–15 s of model audio) inside the existing 3:00 cost cap, so per-session cost rises slightly but the hard cap set in S-03 is unchanged. Shorter tutor turns pull in the other direction.

## Migration Notes

None — no schema, no data, no config. Both phases are pure code changes and revert cleanly by reverting the commits. Archived sessions created before this change stay valid.

## References

- Roadmap slice: `context/foundation/roadmap.md` §S-07 (both Unknowns resolved by this plan)
- Voice path this builds on: `context/archive/2026-07-22-first-voice-conversation/plan.md`
- Level calibration being revised: `context/archive/2026-07-26-adaptive-level-tuning/plan.md`
- Report trust guardrail: `context/archive/2026-07-23-post-session-report/plan.md`
- Trigger API: `node_modules/@openai/agents-realtime/dist/transportLayer.d.ts:62`, `openaiRealtimeWebRtc.mjs:327`
- Branch/PR rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tutor opens the conversation

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 36d5487
- [x] 1.2 Production build and typecheck pass: `npm run build` — 36d5487

#### Manual

- [x] 1.3 Tutor greets and asks the first question without the learner speaking first — 36d5487
- [x] 1.4 Label never shows "Słucham" before the tutor speaks, and shows "Rozmówca odpowiada…" while the tutor talks — 36d5487
- [x] 1.5 Countdown starts at connect and auto-end at 0:00 still reaches the report screen — 36d5487
- [x] 1.6 Ending right after the greeting yields "za mało materiału", not an error — 36d5487
- [x] 1.7 Speaking over the greeting does not leave the UI stuck — 36d5487
- [x] 1.8 Fallback: with the trigger commented out, label returns to "Słucham" within ~5 s — 36d5487
- [ ] 1.9 Greeting is audible on Safari iOS after tapping a topic card

### Phase 2: Prompt leads instead of teaching

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build and typecheck pass: `npm run build`
- [x] 2.3 `! grep -q "offer the missing word" src/lib/realtime/instructions.ts`
- [x] 2.4 `! grep -q "two or three sentences" src/lib/realtime/instructions.ts`

#### Manual

- [ ] 2.5 Session A: every tutor turn is at most two sentences with at most one question
- [ ] 2.6 Session A: no corrections, explanations, translations or comments on the learner's English
- [ ] 2.7 Session A: tutor turns visibly shorter than learner turns
- [ ] 2.8 Session B (A2): rescue rephrases the tutor's own question, never supplies words; level still never mentioned
- [ ] 2.9 Report renders for both sessions
- [ ] 2.10 First archived transcript line is `Tutor:`; no fabricated `Learner:` line anywhere
- [ ] 2.11 Tutor stays on topic and never switches to Polish
