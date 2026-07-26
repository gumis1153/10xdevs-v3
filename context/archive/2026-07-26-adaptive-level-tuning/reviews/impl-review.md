<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Adaptive Level Tuning

- **Plan**: `context/changes/adaptive-level-tuning/plan.md`
- **Scope**: Full plan — Phases 1–3 of 3
- **Date**: 2026-07-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Scope detected

Commits `280951f`, `1ac963d`, `28bb03e`, `b027ef7` on `feat/adaptive-level-tuning`.

Source files changed: `src/components/voice-conversation.tsx`, `src/lib/realtime/instructions.ts`.
Both are in the plan. No file in the plan is missing from the diff; no source file outside
the plan was touched.

Cross-phase assumptions checked against the 2:00 → 3:00 change:

- `TOKEN_TTL_SECONDS = 120` (`src/app/api/realtime/token/route.ts:10`) is documented as the
  window to *establish* the session, not its duration — unaffected by a 3:00 session.
- `/api/report` limits hold with wide margin: `maxDuration = 30`, `TurnsPayloadSchema` allows
  200 turns × 2 000 chars; the longest archived 3:00 session produced 16 turns.
- No user-facing copy states a session length, so nothing went stale.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Unplanned meta-rule subordinates the per-band length target

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/lib/realtime/instructions.ts:46
- **Detail**: Phase 2's "Changes Required" lists exactly three items (descriptor constant,
  calibration rules, invisibility guardrails). The line *"These targets shape HOW you speak,
  not how much: the two-or-three-sentence limit above always wins, including at B2"* is a
  fourth, unplanned addition. It resolves a genuine contradiction — B2's "full sentences with
  subordinate clauses" against the pre-existing "two or three sentences" rule the plan
  protects for S-07 — but it resolves it by hard-subordinating every band target to the turn
  budget. `verification.md` measured 12.5 vs 12.4 words per sentence across an A2-graded and a
  B2-graded session (no differentiation at all) and names this line as the suspected cause.
  An unplanned addition therefore plausibly neutralised the slice's most measurable lever.
- **Fix A ⭐ Recommended**: Leave the line as written and hand the length dimension to S-07.
  - Strength: The turn budget is S-07's property by the plan's own boundary rule; fixing
    length inside S-06 means editing a rule S-06 promised to leave verbatim. Zero risk to a
    slice already verified as non-regressing.
  - Tradeoff: S-06 ships with one of its four calibration levers provably inert.
  - Confidence: HIGH — the boundary is stated explicitly in the plan and plan-brief.
  - Blind spot: None significant; `verification.md` already carries the hypothesis forward.
- **Fix B**: Narrow the line so the budget caps sentence *count* but not per-band sentence
  *length* and vocabulary, then spend the planned tuning round to re-measure.
  - Strength: Addresses the exact failure `verification.md` identified, while still leaving
    the "two or three sentences" rule textually untouched.
  - Tradeoff: Reopens a slice the user chose to close; spends the one reserved tuning round
    without the same-topic re-run that would tell us whether tuning is even needed.
  - Confidence: MED — the causal link between this line and the flat measurement is a
    hypothesis, not a tested result.
  - Blind spot: Untested whether B2 turns then exceed the turn budget.
- **Decision**: FIXED via Fix A — line `:46` left as written; the length dimension is handed
  to S-07 and recorded in `follow-ups/review-fixes.md`. No code change.

### F2 — Phase 3 ran against a looser contract than the plan specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/adaptive-level-tuning/verification.md
- **Detail**: Three of Phase 3's contract terms were not met. (1) Change #1 required all three
  scenarios on the *same* topic so the only varying input is how the learner speaks; (a) ran on
  *Client progress update* and (b) on *Code review discussion*, leaving a confound that cannot
  be separated from the data. (2) Change #3's conditional tuning round had its trigger
  arguably met — no meaningful length difference — and was not spent. (3) Progress row 3.5
  ("scenario (c) holds a neutral mid-band register") is `[x]` on live observation only; the
  control session fell below the 40-word archive gate and no end-screen transcript was
  captured, so the claim is not independently auditable. All three gaps are disclosed in
  `verification.md` and were the user's explicit call on 2026-07-26 in favour of closing the
  slice.
- **Fix**: No code change. Ensure the roadmap S-06 entry records "shipped, partially verified"
  rather than "verified" when the slice is archived, so the gap does not quietly become
  received fact.
- **Decision**: SKIPPED — the gaps are already disclosed in `verification.md`; no separate
  roadmap note queued.

### F3 — CEFR band descriptors now duplicated across two modules with divergent wording

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/realtime/instructions.ts:15-22 vs src/lib/report/prompt.ts:19-26
- **Detail**: A2/B1/B2 descriptors now exist in both modules in different words.
  `report/prompt.ts` quotes the Council of Europe text near-verbatim ("Can communicate in
  simple, routine tasks requiring a direct exchange of information on familiar topics…");
  `instructions.ts` paraphrases it ("The learner can communicate in simple, routine exchanges
  of information on familiar topics…"). The plan asked for "abbreviated official descriptors",
  and the grader and the partner now reason from two slightly different definitions of the same
  band — the report can grade against one B1 while the partner calibrated to another.
- **Fix**: Align the three descriptor sentences in `instructions.ts` verbatim with the
  corresponding lines in `report/prompt.ts`. (Extracting a shared module is the cleaner
  end-state but premature at two consumers with different surrounding formats.)
- **Decision**: SKIPPED — the paraphrase is close enough to the official wording to leave alone.

### F4 — Archived transcript contains a borderline live language-help offer, yet 2.5 is checked

- **Severity**: 📝 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/lib/realtime/instructions.ts:34-35, evidence in verification.md scenario (a)
- **Detail**: Progress row 2.5 ("Partner still refrains from correcting mistakes
  mid-conversation") is `[x]`, but the archived scenario (a) transcript ends with the tutor
  saying *"If you like, try saying that in English and I'll help you keep it smooth"* — to a
  learner who was already speaking English. The rule at `:34` authorises encouraging English
  only when the user speaks **Polish**; `:35` forbids correcting language mistakes during the
  conversation. This is not a level leak and not a correction, but it is an unauthorised offer
  of live language coaching, and the new A2 instruction ("wait several seconds, then offer the
  missing word or rephrase more simply") plausibly widened the opening for it. The pre-existing
  rules are S-07's property, so this is a hand-off, not an S-06 defect.
- **Fix**: Record it for S-07 (`conversation-flow-tuning`), which owns correction balance —
  and, if S-07 keeps the A2 scaffolding, scope it to supplying a missing word rather than
  coaching delivery.
- **Decision**: FIXED — queued for S-07 in `follow-ups/review-fixes.md`. No code change in S-06.

## Success criteria verification

**Automated — all pass, re-run at review time:**

| Check | Result |
| --- | --- |
| `npm run lint` | PASS — ESLint: No issues found |
| `npm run build` | PASS — compiled, TypeScript finished clean |
| `verification.md` exists with three scenario sections + verdict | PASS |

**Manual — all 8 rows `[x]`.** Rows 1.3, 1.4, 2.3, 2.4 are backed by user confirmation and are
consistent with the diff. Row 2.5 is contradicted in spirit by archived evidence (see F4).
Rows 3.4 and 3.5 carry honest qualifiers inline rather than clean passes (see F2). Row 3.6 is
confirmed for (a) and (b) from the archived transcripts and observed for (c).
