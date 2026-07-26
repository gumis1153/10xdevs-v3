<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Post-Session Report (S-04)

- **Plan**: context/changes/post-session-report/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-07-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes:
- All 7 planned items verified MATCH (drift agent, per-file evidence); "What We're NOT Doing" boundaries respected; no application-code changes outside the plan's named files in the change's commit range (`7fd86ac^..HEAD`). Two initially flagged EXTRA items (token route hardening, roadmap.md edit) turned out to predate this change — false positives from date-based range fallback.
- Automated criteria re-verified at review time: `npm run lint` clean, `npm run build` passes, `tsc --noEmit` clean, single `openai` copy in lockfile.
- Manual criteria (1.4–1.6, 2.3–2.9) confirmed by the user during phase gates.

## Findings

### F1 — `new OpenAI()` outside try/catch can 500 on missing API key

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/report/route.ts:85
- **Detail**: The OpenAI SDK constructor throws synchronously when `OPENAI_API_KEY` is missing/empty; it sits outside the try (which starts at :87), so a misconfigured env yields an unhandled 500 with stack trace instead of the controlled `{error:'upstream_error'}` 502 every other failure path returns. Sibling token route reads the key inside its try.
- **Fix**: Move `const client = new OpenAI()` inside the try block so env misconfiguration follows the same 502 path.
- **Decision**: FIXED — constructor moved inside try (route.ts), verified with lint + tsc

### F2 — Final learner utterance can miss the snapshot

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/voice-conversation.tsx:314 (snapshot) vs :271/:330 (close + setState)
- **Detail**: `buildTurns(historyRef.current)` runs synchronously right after `session.close()` + `setState('ended')`. If the SDK's last `history_updated` for the learner's final utterance hasn't landed yet, that turn is silently absent from the report and transcript — most likely on the 2:00 auto-cutoff.
- **Fix**: Delay the snapshot briefly (e.g. take it in the ended effect after a short microtask/timeout window) or accept as a known S-04 limitation and note it in the plan.
- **Decision**: SKIPPED — accepted as a known S-04 limitation

### F3 — No screen-reader signal when the report replaces the spinner

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/session-report.tsx:66 (aria-live only on analyzing)
- **Detail**: The `analyzing` phase announces politely, but the terminal report/insufficient/error results have no live region, so a screen-reader user isn't notified when analysis finishes.
- **Fix**: Add an `aria-live="polite"` wrapper around the outcome container (or focus the result heading on transition).
- **Decision**: FIXED — aria-live moved to the root of all four outcome cards (persistent live region across phases)

### F4 — Learner-controlled transcript is a (accepted) prompt-injection surface

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/report/route.ts:93 + src/lib/report/prompt.ts:10
- **Detail**: The learner can steer their own grading ("grade me C2") via speech; ungrounded fields (justification, suggestions, corrections) can carry injected content. Impact is low by design: stateless, report visible only to the same authed user, no tools/other-user data, all fields render as escaped React text.
- **Fix**: Record as accepted risk (self-manipulation of one's own report); revisit if reports become persisted/shared in S-05.
- **Decision**: ACCEPTED — self-manipulation of one's own stateless report; revisit at S-05 (persistence/sharing)

### F5 — Grounding gate may over-drop legitimate errors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/report/route.ts:118-121
- **Detail**: Exact-substring matching drops a legitimate error if the model normalizes whitespace inside its quote (e.g. ASR doubled space). Conservative bias is intended (anti-hallucination first), but the gate can hide real feedback.
- **Fix**: If precision matters later, compare against a whitespace-collapsed corpus (collapse both sides) while keeping the `\n` turn-boundary join.
- **Decision**: FIXED — whitespace collapsed per turn on both sides of the match; `\n` turn separator preserved
