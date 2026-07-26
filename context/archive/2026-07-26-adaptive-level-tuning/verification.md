# Adaptive Level Tuning — Register Verification

> Phase 3 of `plan.md`. Recorded 2026-07-26 against the prompt from commit `1ac963d`
> (session window 3:00 from `280951f`).
>
> The inferred level is never a value in the codebase, so this document is the only
> durable evidence that the calibration exists. **S-07 (`conversation-flow-tuning`)
> rewrites the same prompt — this is the baseline it should regress against.**

## Method

Three live sessions were run. Tutor turns of the two that cleared the 40-learner-word
archive gate in `src/app/api/report/route.ts:21` were read back from the `sessions`
table and measured; the third was observed live only.

Word and sentence counts are mechanical (whitespace tokens; sentences split on
terminal punctuation), computed over tutor turns only.

**Deviation from the plan:** the plan called for all three scenarios on the *same*
topic, so that the only varying input is how the learner speaks. Scenarios (a) and (b)
were run on different topics. See *Confound* below — it materially limits what these
numbers prove.

## Scenario (a) — deliberately simple English

- **Session**: `c92e20f3-fa87-4968-9ffa-8bf7a0a97207`, 2026-07-26 15:05 UTC
- **Topic**: Client progress update
- **How the learner spoke**: short, fragmentary, self-interrupting turns; 8.2 words per
  turn; frequent restarts ("But it could be also moved in the future to another project,
  I mean moved."); one outright "I don't know."
- **Report's own grading of the learner**: A2

**Measured tutor register**

| Metric | Value |
| --- | --- |
| Turns | 6 |
| Words per turn | 33.3 |
| Words per sentence | 12.5 |

**Verbatim tutor quotes**

- "Awesome, that's a nice place to be. If nothing is delayed, what happens next? For example, are you moving into implementation, or preparing something to review with the client?"
- "Totally fine to be unsure. You could ask the client to confirm the boundaries of the core CMS, like what must be shared across projects and what can stay project-specific."
- "Nice, that's a strong piece to report."

**Dominant question type**: open questions carrying an explicit two-option fallback
("are you moving into implementation, **or** preparing something to review with the
client?"), and — after the learner stalled — a fully scaffolded turn that supplies the
content the learner could not produce and invites them to say it back.

## Scenario (b) — fluent English

- **Session**: `77eae023-b5ec-43fa-b2a7-9ed60263821b`, 2026-07-26 16:23 UTC
- **Topic**: Code review discussion
- **How the learner spoke**: complete, well-formed turns averaging 18.8 words; held
  positions, asked the tutor questions back ("Does that fit your style?"); plain but
  fluent phrasing.
- **Report's own grading of the learner**: B2

**Measured tutor register**

| Metric | Value |
| --- | --- |
| Turns | 7 |
| Words per turn | 37.3 |
| Words per sentence | 12.4 |

**Verbatim tutor quotes**

- "If you were defending a specific implementation detail, like choosing composition over inheritance, how would you explain that tradeoff to your colleague?"
- "If they still prefer inheritance, how would you suggest a compromise, like a small prototype or a follow-up refactor, so the discussion moves forward?"
- "Readability and maintenance are usually the biggest long-term wins, and performance can be handled if it becomes a real bottleneck."

**Dominant question type**: open, layered and hypothetical — every turn asks for a
justification, a comparison or a counterfactual, and follows up by pushing for detail.
No closed questions, no scaffolding, no supplied answers. Vocabulary is domain-specific
(`tradeoffs`, `bottleneck`, `composition over inheritance`, `actionable`) in a way
scenario (a) never is.

## Scenario (c) — control (silence, one-word answers, Polish)

- **Session**: not archived. The session fell below the 40-learner-word gate, so no
  `sessions` row was written and no transcript was persisted — the outcome the plan
  anticipated for this scenario.
- **Evidence**: live observation during the session only. No transcript was captured
  from the end screen, so the claims below are not independently auditable.
- **Observed**: the partner stayed in a neutral middle register, kept encouraging
  English, and did not collapse into baby talk.

## Verdict

**(a) vs (b) register difference — partially present.**

The difference is real in *question type and scaffolding* and in *vocabulary register*:
scenario (a) gets two-option questions and a turn that hands the learner the content
outright; scenario (b) gets open hypotheticals, pushback and domain vocabulary. That is
the A2 vs B2 behaviour the prompt asks for.

The difference is **absent in length**. 12.5 vs 12.4 words per sentence is no
difference at all, and 33.3 vs 37.3 words per turn is within noise. Both sessions landed
on the A2/B1 seam of the prompt's own targets (A2: 8–12, B1: 12–18, B2: full sentences
with subordinate clauses). The likely cause is that the pre-existing turn budget —
"Keep your answers short and conversational (two or three sentences)", reinforced by
`instructions.ts` "the two-or-three-sentence limit above always wins" — dominates the
per-band sentence-length target. **This is the concrete lever for a future tuning round.**

**(c) held mid-band — accepted on live observation, not on evidence.**

**No level leak in any session — confirmed for (a) and (b), observed for (c).**
No CEFR label, no question about the learner's level or study history, no announcement
of adapting. One borderline line in (a): *"If you like, try saying that in English and
I'll help you keep it smooth."* It names no level and announces no simplification, but
it is a visible offer of live language help to a learner who was already speaking
English — it edges toward the "no corrections during the conversation" boundary that
belongs to S-07. Recorded as an observation, not a failure.

## Confound

Scenarios (a) and (b) ran on **different topics** (*Client progress update* vs *Code
review discussion*). Topic alone pulls in the direction of the observed difference: a
code-review conversation naturally produces tradeoff vocabulary and argumentative
follow-ups, while a client update naturally produces advisory scaffolding. The share of
the measured difference attributable to calibration rather than to topic **cannot be
separated from this data**.

The clean experiment — (a) and (b) on one topic — was offered and deliberately skipped
by the user on 2026-07-26 in favour of closing the slice. The prompt's single planned
tuning round was **not** spent and remains available.

## What a future round should do

1. Re-run (a) and (b) on one topic to remove the confound.
2. If the length dimension is still flat, strengthen the per-band sentence-length target
   against the turn budget — e.g. give A2 an explicit words-per-turn ceiling rather than
   relying on "one idea per sentence" to compete with "two or three sentences".
3. Capture the control scenario's tutor turns from the end-screen transcript before
   leaving the session, since that scenario will not archive.
