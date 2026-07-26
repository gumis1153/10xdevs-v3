# Adaptive Level Tuning Implementation Plan

## Overview

Roadmap **S-06** / PRD **FR-005** (nice-to-have): the conversation partner silently infers the learner's CEFR band from the opening exchanges and calibrates its own speaking pace, sentence length, vocabulary register and question type to it — for the duration of that one session only. The inference is never persisted, never displayed, and never spoken about. Alongside it the hard session window grows from 2:00 to 3:00, so the adapted stretch of the conversation is long enough to be audible.

The whole slice is **prompt-only**: the level lives in the partner's instructions, not in application state. No new route, no classifier, no mid-session session mutation.

## Current State Analysis

The conversation partner speaks in a single fixed register. `buildInstructions(topic)` in `src/lib/realtime/instructions.ts` returns a flat rule list with no notion of learner proficiency — a B2 speaker and an A2 speaker get identical treatment. The file's own header comment (`instructions.ts:3-7`) says it was extracted from the component precisely so that S-04 and **S-06** could grow it without touching session logic; this plan is that growth.

Constraints discovered while grounding the plan:

- **Blast radius is tiny.** `buildInstructions` has exactly one consumer (`src/components/voice-conversation.tsx:153`), and the prompt-only decision keeps its signature. The slice touches two files: the prompt module and one constant in the conversation component.
- **The adaptation window is short.** `SESSION_SECONDS = 2 * 60` (`voice-conversation.tsx:39`) is a deliberate cost safeguard from 2026-07-22 (cut down from a planned 5:00). The partner opens the conversation, so the first learner turn lands ~10–15 s in and the second ~35–45 s in — leaving roughly 70–80 s of adapted conversation. That is why Phase 1 raises the window before Phase 2 changes the prompt.
- **The SDK does support mid-session instruction swaps — we deliberately do not use them.** `RealtimeSession.updateAgent()` (`node_modules/@openai/agents-realtime/dist/realtimeSession.d.ts:197`) calls `transport.updateSessionConfig(getSessionConfig())`, and `#getSessionConfig` merges over `#lastSessionConfig` + `options.config`, so the pinned `server_vad` threshold 0.75 and `far_field` noise reduction would survive the update. The door is open; it stays closed because a discrete register jump mid-conversation costs a classification round-trip out of a very small window and adds a failure mode to the north-star flow (S-03) in exchange for a nice-to-have.
- **There is a precedent for embedding CEFR knowledge in a prompt.** `src/lib/report/prompt.ts:16-26` inlines abbreviated official spoken-interaction descriptors with the rationale that models have only partial CEFR knowledge from memory. Phase 2 mirrors that pattern in the conversation prompt.
- **The verification artifact already exists.** `/api/report` persists `transcript: turns` — both speakers — into the `sessions` table (`src/app/api/report/route.ts:146-154`), and `/archive/[id]` renders it. Tutor turns from a completed session are therefore durably recorded and comparable across sessions without writing any new code.
- **No test framework is configured** (AGENTS.md), so automated verification in every phase is `npm run lint` plus `npm run build` (typecheck included). Test authoring belongs to a later lesson, not to this slice.
- **The persona forbids visible assessment.** FR-005 was rewritten during the PRD Socrates round from "user picks a level" to "the app infers the level" precisely because asking primes a user who is already afraid of being judged. Any leak of the inferred level into the conversation defeats the requirement it implements.

### Key Discoveries:

- `src/lib/realtime/instructions.ts:3-7` — file extracted from the component explicitly for S-04/S-06 to extend; `:18` pins the product contract "do NOT correct mistakes during the conversation; feedback happens after".
- `src/components/voice-conversation.tsx:36-39` — the 2:00 limit is a documented cost decision, not an accident; the comment must be updated, not silently overwritten.
- `src/lib/report/prompt.ts:16-26` — descriptor-embedding pattern to mirror (module-level const, abbreviated official wording, referenced from the instruction list).
- `src/app/api/report/route.ts:146-154` — tutor turns land in `sessions.transcript`; this is Phase 3's measurement surface.
- `context/archive/2026-07-22-first-voice-conversation/reviews/plan-review.md:34` — the SDK overwrites unpinned session fields with its own defaults on `session.update`; relevant background for why this slice avoids raw session mutation.

## Desired End State

Two learners with visibly different spoken command of English, given the same topic, get audibly different conversation partners: shorter sentences, slower pace, high-frequency vocabulary and more closed or scaffolded questions for the weaker speaker; longer, denser, more idiomatic turns and open-ended follow-ups for the stronger one. The partner never names a level, never asks about it, never announces that it is simplifying, and never comments on the learner's proficiency. A session runs up to 3:00.

Verification is the archive: three recorded sessions (deliberately simple English / fluent English / a control with silence, one-word answers and Polish interjections) show the expected register difference when their tutor turns are compared side by side, and the control lands mid-band rather than collapsing into baby talk.

## What We're NOT Doing

- **No classifier and no live session mutation** — no `/api/level` route, no `session.updateAgent()`, no tool call. The inference is the model's own, inside the prompt.
- **No persistence of the inferred level** — roadmap S-06 states this explicitly ("celowo bez persistencji poziomu"), and PRD Non-Goals rule out cross-session adaptation in v1. Nothing is written to the database.
- **No level surfaced to the user** — not during the session, not on the end screen. The report's CEFR verdict (S-04) is the only place a level is ever shown, and it is untouched.
- **No changes to the report path** — `ReportSchema`, `/api/report`, the grounding gate, the archive UI and the `sessions` table stay as they are.
- **No changes to correction balance or talk-time distribution** — the "no live corrections" rule (`instructions.ts:18`) and the "keep your answers short" rule stay exactly as written. Rebalancing them is **S-07 (`conversation-flow-tuning`)**.
- **No changes to audio/VAD config, token TTL, or the pinned realtime session config** — the Safari echo mitigation (`server_vad` 0.75 + `far_field`) and the 120 s `ek_` TTL are out of scope.
- **No test framework** — automated verification is lint + build only.

## Implementation Approach

Prompt-only self-calibration, delivered in three steps: widen the window, teach the prompt to calibrate, then prove the calibration exists.

The prompt gets a two-part addition. First, a module-level constant holding abbreviated A2/B1/B2 spoken-interaction descriptors **plus an explicit translation of each band into observable partner behaviour** — pace, sentence length, vocabulary register, question type, tolerance for pauses. Without that translation the model is left with a vague "speak simply"; with it, the descriptors become an actionable target. Second, calibration rules in the existing rule list: a short probing phase over the first couple of exchanges, then settle on a band, with permission to revise up or down if later speech contradicts the first impression, a neutral B1 default whenever the signal is absent or poisoned, and a hard A2–B2 clamp matching the PRD persona.

Revision (rather than a frozen verdict) is the deliberate choice: a two-exchange sample plus ASR noise is a thin basis for locking a user into a register for three minutes, and a single stumbling opening sentence should not condemn a B2 speaker to A2 treatment.

The cost of prompt-only is that the level never becomes a datum, so nothing can assert on it. That is exactly why Phase 3 is a real phase with a written artifact rather than a footnote under "manual testing": the archived tutor turns are the only durable evidence the slice does what it claims.

## Critical Implementation Details

**Judgment leakage is the product risk, not a style preference.** FR-005 exists in its current form because being assessed out loud is the persona's core pain. Three specific leaks must be prohibited in the prompt: naming or hinting at a level ("that's quite advanced"), asking the learner about their level, and announcing the adaptation ("I'll speak more slowly for you"). A partner that calibrates perfectly but says any of those has failed the requirement.

**Phase ordering is load-bearing.** The 3:00 window ships before the prompt change, because at 2:00 the adapted stretch is too short for Phase 3's audible-difference comparison to mean anything.

---

## Phase 1: Session window 3:00

### Overview

Raise the hard session limit from 2:00 to 3:00 so that the post-calibration stretch of a conversation is long enough to hear, and record the reversal of the earlier cost decision in the code where that decision is documented.

### Changes Required:

#### 1. Session limit constant

**File**: `src/components/voice-conversation.tsx`

**Intent**: Raise the hard session cap to three minutes and update the decision comment above it so the record shows the 2026-07-22 cost cut being deliberately reversed on 2026-07-26 for level adaptation — not quietly overwritten. The rationale to capture: the adapted part of the conversation needs an audible window, 3:00 matches the "2–3 minutes" in PRD US-01, and the ~50% higher Realtime cost per session is accepted.

**Contract**: `SESSION_SECONDS` becomes `3 * 60`. `WARNING_SECONDS` stays `30` — the countdown warning threshold remains meaningful at the longer duration. No other constant, effect, or state transition changes.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build and typecheck pass: `npm run build`

#### Manual Verification:

- Countdown starts at `3:00` when the session becomes active, and the amber pulsing warning still appears at `0:30`.
- Letting the timer run to zero auto-ends the session into the report screen exactly as before (normal end, not an error card).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Level calibration in the partner prompt

### Overview

Teach the conversation prompt to infer the learner's band from the opening exchanges and calibrate its own register to it — invisibly, within a bounded range, with a safe default when the signal is missing.

### Changes Required:

#### 1. CEFR calibration targets

**File**: `src/lib/realtime/instructions.ts`

**Intent**: Add a module-level constant holding abbreviated A2/B1/B2 spoken-interaction descriptors together with the observable partner behaviour each band implies, so the model calibrates against a concrete target instead of its own partial memory of CEFR. Mirrors the reasoning and shape of `CEFR_SPOKEN_INTERACTION_DESCRIPTORS` in `src/lib/report/prompt.ts:16-26`.

**Contract**: A new non-exported `const` in the same module, referenced from the string returned by `buildInstructions`. Per band it states both the descriptor (what the learner can do) and the partner's response: speaking pace, sentence length, vocabulary register, question type (closed/scaffolded vs open-ended), and how much pause tolerance and rephrasing help to offer. Only A2, B1 and B2 appear — the clamp range below.

#### 2. Calibration rules

**File**: `src/lib/realtime/instructions.ts`

**Intent**: Extend the rule list returned by `buildInstructions` with the calibration protocol: run the first roughly two exchanges neutrally in plain English while forming an estimate, then settle on a band and calibrate to it; revise the band up or down later if further speech contradicts the first impression; hold neutral B1 whenever the signal is absent or unusable (silence, one-word answers, Polish interjections, garbled ASR); never calibrate outside A2–B2.

**Contract**: `buildInstructions(topic: Topic): string` — **signature unchanged**; only the returned string grows. The existing rules stay verbatim, in particular "Do NOT correct the user's language mistakes during the conversation" (`:18`) and "Keep your answers short and conversational" — those belong to S-07 and must not be edited here.

#### 3. Invisibility guardrails

**File**: `src/lib/realtime/instructions.ts`

**Intent**: Add explicit prohibitions so the calibration never surfaces in the conversation, because a visible assessment defeats the requirement this slice implements (PRD FR-005 Socrates resolution).

**Contract**: Rules forbidding, specifically: stating or hinting at the learner's level, asking the learner about their level or how long they have studied, announcing or explaining the adaptation ("I'll keep it simple for you"), and commenting on the learner's proficiency in any direction — including praise framed as assessment.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build and typecheck pass: `npm run build`

#### Manual Verification:

- A full conversation still connects, runs and ends into the report screen — no regression in the S-03 flow (orb states, countdown, end button all behave as before).
- Across the session the partner never names a level, never asks about the learner's level, and never announces that it is simplifying or slowing down.
- The partner still refrains from correcting mistakes mid-conversation (the S-04 report remains the only feedback channel).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Register verification across three scenarios

### Overview

Prove the calibration exists. Because the level is never a value in the codebase, the evidence is behavioural: three recorded sessions whose tutor turns are compared side by side from the archive, plus a written verdict — and one tuning round if the difference is not there.

### Changes Required:

#### 1. Three recorded sessions

**File**: (no source change — running the app)

**Intent**: Produce the raw material for comparison by running three full sessions on the same topic, so the only varying input is how the learner speaks: (a) deliberately simple, short, halting English; (b) fluent, idiomatic, longer-turn English; (c) control — long silences, one-word answers, a Polish interjection or two.

**Contract**: Each session must exceed the 40-learner-word gate in `src/app/api/report/route.ts:21` so a `sessions` row is written and the transcript is archived; the control scenario may legitimately fall short and land on "za mało materiału", in which case its tutor turns are read from the live end-screen transcript instead.

#### 2. Verification record

**File**: `context/changes/adaptive-level-tuning/verification.md`

**Intent**: Capture the comparison so the claim is auditable later — and so S-07 has a baseline to regress against when it rewrites the same prompt.

**Contract**: One section per scenario with the topic, how the learner spoke, and the measured tutor register: average words per tutor turn, typical sentence length, two or three verbatim tutor quotes, and the dominant question type. Closes with a verdict per expectation: (a) vs (b) register difference present, (c) held mid-band, no level leak in any of the three.

#### 3. Tuning round (conditional)

**File**: `src/lib/realtime/instructions.ts`

**Intent**: If the comparison shows no meaningful difference between (a) and (b), or the control collapsed into baby talk, or a level leaked into the conversation, adjust the Phase 2 prompt once and re-run the affected scenario — recording both rounds in `verification.md` rather than overwriting the first result.

**Contract**: Same contract as Phase 2 change #2/#3 — string content only, signature and existing rules untouched.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build and typecheck pass: `npm run build`
- `context/changes/adaptive-level-tuning/verification.md` exists and contains all three scenario sections plus a verdict.

#### Manual Verification:

- Scenario (a) and scenario (b) tutor turns show a clearly different register — measurably shorter/simpler turns and more scaffolded questions in (a) than in (b).
- Scenario (c) lands mid-band: the partner stays neutral and does not collapse into baby talk despite the missing signal.
- None of the three transcripts contains a level mention, a question about the learner's level, or an "I'll simplify for you" announcement.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This is the last phase — after confirmation the slice is ready to archive.

---

## Testing Strategy

No test framework is configured in this repo, and introducing one is out of scope for this slice. Verification is therefore automated-static plus structured manual.

### Automated (static) checks:

- `npm run lint` — ESLint (`next/core-web-vitals` + `next/typescript`).
- `npm run build` — production build, includes typecheck.

### Manual Testing Steps:

1. Start a session and confirm the countdown begins at `3:00`, the amber warning appears at `0:30`, and reaching zero ends the session into the report screen.
2. Run scenario (a): speak deliberately simple, short, halting English for the full session. Note how long and how complex the partner's turns are, and what kinds of questions it asks.
3. Run scenario (b) on the same topic: speak fluently, with longer turns and idiomatic phrasing. Note the same three things.
4. Run scenario (c): stay mostly silent, answer in single words, drop a Polish sentence in. Confirm the partner stays in a neutral middle register and keeps encouraging English without infantilising.
5. Open each archived session at `/archive/<id>` and compare the tutor turns across (a), (b) and (c); fill in `verification.md`.
6. Re-read all three transcripts specifically hunting for level leaks: any CEFR label, any question about the learner's level, any announcement of adapting.
7. Confirm no mid-conversation corrections appeared in any scenario (S-04 report stays the only feedback channel).

## Performance Considerations

The longer prompt adds a negligible number of input tokens to session setup. The real cost is the window: a 3:00 session consumes roughly 50% more Realtime minutes than a 2:00 one — a deliberate, recorded trade (Phase 1). Downstream, `/api/report` sees a ~1.5× longer transcript; with `reasoning: { effort: 'low' }` and `maxDuration = 30` that stays comfortably inside budget, and the payload limits in `TurnsPayloadSchema` (200 turns, 2 000 characters per turn) keep a wide margin at three minutes of speech.

## Migration Notes

None. No schema, no migration, no persisted state — the inferred level lives and dies inside a single session. Rollback is reverting two source files; nothing in the database or in prior archived sessions is affected.

## References

- PRD: `context/foundation/prd.md` — FR-005, Success Criteria (secondary), Non-Goals (no cross-session adaptation)
- Roadmap: `context/foundation/roadmap.md` — S-06 "Adaptacja poziomu w trakcie rozmowy" (no level persistence, nice-to-have off the must-have path)
- Descriptor-embedding pattern: `src/lib/report/prompt.ts:16-26`
- Prompt module contract: `src/lib/realtime/instructions.ts:3-7,18`
- Session limit decision being reversed: `src/components/voice-conversation.tsx:36-39`
- Verification surface: `src/app/api/report/route.ts:146-154` (transcript persisted), `src/app/archive/[id]/page.tsx`
- Why raw session mutation is avoided: `context/archive/2026-07-22-first-voice-conversation/reviews/plan-review.md:34`
- Prior deliberate omission of S-06: `context/archive/2026-07-22-first-voice-conversation/plan.md:91,315`, `context/archive/2026-07-23-post-session-report/plan.md:45`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session window 3:00

#### Automated

- [x] 1.1 Linting passes: `npm run lint`
- [x] 1.2 Build and typecheck pass: `npm run build`

#### Manual

- [x] 1.3 Countdown starts at 3:00 and the amber warning still appears at 0:30
- [x] 1.4 Timer reaching zero auto-ends the session into the report screen as a normal end

### Phase 2: Level calibration in the partner prompt

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Build and typecheck pass: `npm run build`

#### Manual

- [ ] 2.3 Full conversation still connects, runs and ends into the report screen (no S-03 regression)
- [ ] 2.4 Partner never names a level, asks about it, or announces adapting
- [ ] 2.5 Partner still refrains from correcting mistakes mid-conversation

### Phase 3: Register verification across three scenarios

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Build and typecheck pass: `npm run build`
- [ ] 3.3 `verification.md` exists with all three scenario sections plus a verdict

#### Manual

- [ ] 3.4 Scenario (a) vs (b) tutor turns show a clearly different register
- [ ] 3.5 Scenario (c) holds a neutral mid-band register without baby talk
- [ ] 3.6 No level leak in any of the three transcripts
