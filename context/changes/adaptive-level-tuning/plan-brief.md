# Adaptive Level Tuning — Plan Brief

> Full plan: `context/changes/adaptive-level-tuning/plan.md`

## What & Why

Roadmap **S-06** / PRD **FR-005**: the conversation partner should infer the learner's English level from the opening exchanges and calibrate its pace and vocabulary to it, instead of speaking the same way to an A2 and a B2 learner. FR-005 was deliberately rewritten during the PRD Socrates round from "user picks a level" to "the app infers the level" — asking primes a persona whose core pain is fear of being judged. So the calibration must be real and invisible at the same time.

## Starting Point

`buildInstructions(topic)` in `src/lib/realtime/instructions.ts` returns a flat, single-register prompt with no notion of proficiency; the file's header comment says it was extracted from the component specifically so S-06 could extend it. It has one consumer (`voice-conversation.tsx:153`). The hard session cap is `SESSION_SECONDS = 2 * 60`, a documented cost decision from 2026-07-22 — and since the partner speaks first, that leaves only ~70–80 s of conversation after a level could plausibly be inferred.

## Desired End State

Two learners with different spoken command of English, on the same topic, get audibly different partners: shorter sentences, slower pace, high-frequency vocabulary and scaffolded questions for the weaker speaker; longer, denser, idiomatic turns and open questions for the stronger one. The partner never names a level, never asks about it, never announces that it is simplifying. Sessions run up to 3:00. Nothing about the level is stored or displayed.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where inference lives | Prompt-only — the model calibrates itself | Zero new code in the north-star S-03 flow and continuous adaptation from the second turn, instead of spending a chunk of a small window on a classification round-trip. |
| Mid-session instruction swap | Not used, though the SDK supports it | `session.updateAgent()` would preserve the pinned VAD/noise config, but a discrete register jump adds a failure mode to the core flow for a nice-to-have. |
| Session window | Raised 2:00 → 3:00 | Adaptation needs an audible stretch and 3:00 matches "2–3 minutes" in US-01; ~50% higher Realtime cost per session accepted. |
| Calibration shape | Probing phase (~2 exchanges), then calibrate, with the right to revise later | A two-exchange sample plus ASR noise is too thin to lock a register for three minutes; one stumbling opening sentence must not condemn a B2 speaker to A2 treatment. |
| CEFR knowledge in prompt | Embed abbreviated A2/B1/B2 descriptors + explicit band→behaviour mapping | Mirrors the established pattern in `src/lib/report/prompt.ts:16-26` (models have only partial CEFR recall) and turns a vague "speak simply" into a concrete target. |
| Missing/poisoned signal | Hold neutral B1; clamp calibration to A2–B2 | Matches the PRD persona band and prevents both infantilisation and C1-level vocabulary dumps on the most likely user path (a nervous, quiet speaker). |
| Boundary vs S-07 | S-06 touches register only | The "no live corrections" and talk-time rules stay verbatim for `conversation-flow-tuning`, so a regression in the shared prompt is attributable to one slice. |
| How we prove it works | Compare tutor turns of three recorded sessions from the S-05 archive | The level is never a datum, so the durable transcript (already persisted by `/api/report`) is the only evidence — obtained with no new code. |
| Acceptance scenarios | Three: simple English, fluent English, control (silence/Polish/one-word) | Every decision above gets a test, including the fallback rule — which is otherwise the most likely path to ship unverified. |

## Scope

**In scope:**

- `src/lib/realtime/instructions.ts` — CEFR calibration targets constant, calibration protocol, invisibility guardrails
- `src/components/voice-conversation.tsx` — `SESSION_SECONDS` 2:00 → 3:00 plus the updated decision comment
- `context/changes/adaptive-level-tuning/verification.md` — the register-comparison record

**Out of scope:**

- Any classifier route, tool call, or `session.updateAgent()` mutation
- Persisting the inferred level, or any database/schema change
- Showing the level to the user during or after the session (the S-04 report's CEFR verdict is untouched)
- Correction balance and talk-time distribution — that is S-07
- Audio/VAD config, token TTL, pinned realtime session config
- Introducing a test framework

## Architecture / Approach

One string, one constant, one document. `buildInstructions(topic)` keeps its signature and grows two blocks: a module-level constant holding abbreviated A2/B1/B2 spoken-interaction descriptors paired with the partner behaviour each band implies (pace, sentence length, vocabulary register, question type, pause tolerance), and calibration rules in the existing rule list (probe → settle → revise, B1 default, A2–B2 clamp, no level talk). The conversation component changes only the session cap. Nothing new flows through the app at runtime — the adaptation happens inside the model, so the verification path runs through the already-persisted transcript rather than through an assertion.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session window 3:00 | Three-minute cap with the cost reversal recorded in the code | Reverses a deliberate cost safeguard; +50% Realtime spend per session |
| 2. Level calibration in the prompt | Descriptors + band→behaviour mapping + probe/revise/fallback rules + invisibility guardrails | Prompt regression in the north-star S-03 flow; the level leaking into the conversation |
| 3. Register verification | Three recorded sessions compared from the archive, written up in `verification.md`, plus one tuning round if needed | The register difference may simply not be there — prompt-only adaptation is not guaranteed to be audible |

**Prerequisites:** S-03 (done) and, for the archive-based comparison, S-05 (done — transcripts are persisted). A working microphone and the ability to run three full voice sessions.
**Estimated effort:** ~1 session for phases 1–2 (two small file changes), ~1 session for phase 3 (about 10 minutes of live conversation plus the write-up).

## Open Risks & Assumptions

- **Prompt-only adaptation may be too subtle to hear.** This is the slice's central bet; Phase 3 exists to find out, and the fallback is one tuning round, not a redesign into a classifier.
- **The register difference is judged qualitatively.** Phase 3 measures words per turn and sentence length, but the verdict is a human reading two transcripts — repeatable, not objective.
- **A simplifying partner may bias the report downward.** If the tutor speaks in shorter, simpler sentences, the learner may mirror it and produce a plainer sample for the CEFR grading in S-04. Accepted for now, not measured; worth revisiting if archived levels start trending down.
- **S-07 will rewrite the same prompt.** `verification.md` is deliberately the baseline it should regress against.
- **The control scenario may not archive.** A near-silent session can fall below the 40-learner-word gate in `/api/report` and never create a `sessions` row; its tutor turns then have to be read from the live end-screen transcript.

## Success Criteria (Summary)

- A learner who speaks haltingly and a learner who speaks fluently get noticeably different conversation partners on the same topic.
- A learner who says almost nothing still gets a neutral, encouraging partner — neither baby talk nor a wall of advanced vocabulary.
- No learner is ever told, asked about, or hinted at their level during the conversation; the CEFR verdict stays where it belongs, in the post-session report.
