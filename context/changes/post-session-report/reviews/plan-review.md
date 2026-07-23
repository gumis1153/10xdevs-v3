<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Post-Session Report (S-04) Implementation Plan

- **Plan**: context/changes/post-session-report/plan.md
- **Mode**: Deep
- **Date**: 2026-07-23
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

5/5 paths ✓ (`voice-conversation.tsx`, token route, `proxy.ts`, `instructions.ts`, `items.d.ts`), symbols ✓ (`historyRef:91`, `SESSION_SECONDS:36`, `history_updated:151`, token-route auth pattern, `zodTextFormat` in `openai@6.48.0` with zod v3/v4 dual support, `RealtimeItem` union matches plan claims), brief↔plan ✓, Progress↔Phase ✓. Model `gpt-5.6-luna` verified live against the OpenAI API (GET /v1/models → 200) — the "still-unverified" flag in `docs-openai-responses-structured-outputs.md` §7 is stale. Sub-agent verification: `responses.parse(body, options?: RequestOptions)` with `headers` exists; `safety_identifier` is a first-class body param (`responses.d.ts:7101`, `user` deprecated); `reasoning.effort: 'low'` valid; `output_parsed` and refusal content type present; `maxDuration` documented in next@16.2.9; blast radius narrow (only `session-start.tsx:8` imports the component); no existing zod usage in `src/` (this is the first); proxy matcher covers `/api/report` with anonymous 401.

## Findings

### F1 — Empty conversation ends in a dead-end error card

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 #2 (report lifecycle) + `TurnsPayloadSchema` (Phase 1 #2)
- **Detail**: "Zakończ rozmowę" works in every state, including `connecting` (`voice-conversation.tsx:257-262`), and the plan leaves session logic unchanged. Ending before any utterance → empty `historyRef` → `buildTurns` returns `[]` → `TurnsPayloadSchema.min(1)` → 400 `invalid_payload` → error card whose "Spróbuj ponownie" re-POSTs the same empty snapshot and fails deterministically forever. Desired outcome is "za mało materiału do analizy", and this case never reaches the server-side material gate.
- **Fix**: In the `ended` effect — if the snapshot has no learner turns (or is empty), set the `insufficient` outcome locally without POSTing; add a manual-verification step (immediate end → insufficient message, zero `/api/report` requests).
- **Decision**: FIXED — contract of Phase 2 #2 amended (empty-snapshot short-circuit), manual-verification bullet added, Progress step 2.9 added.

### F2 — Safety identifier: SDK has a native param, plan leaves the implementer guessing

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 #4, pipeline step 1
- **Detail**: Plan said "per-request headers or client option — implementer picks", mirroring the raw header from the token route. Verified: `openai@6.48.0` exposes a first-class `safety_identifier` body param on the Responses API (`resources/responses/responses.d.ts:7101`; `user` deprecated in its favor). Research §10 never covered this. The header would work but is an unresolved decision.
- **Fix**: Specify `safety_identifier: sha256(user.id)` as a body param of `responses.parse` instead of a raw header.
- **Decision**: FIXED — step 1 rewritten to the native body param; step 4's sample `responses.parse` call now includes `safety_identifier`.

### F3 — Grounding gate: concatenation without a separator

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 #4, pipeline step 6
- **Detail**: "Exact substring of the concatenated learner turns" — joining without a separator admits a false positive across a turn seam: a quote spanning the end of turn A and the start of turn B passes the check while being verbatim from no single turn.
- **Fix**: Specify joining learner turns with `'\n'` (consistent with the `Learner:`/`Tutor:` prompt line format) or a per-turn substring check.
- **Decision**: FIXED — step 6 now specifies the `'\n'`-joined learner corpus with the rationale inline.

### F4 — `confidence` field produced but never consumed

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: `ReportSchema` (Phase 1 #2) vs UI contract (Phase 2 #3)
- **Detail**: `analytic` has a documented purpose (analytic-before-holistic scaffold in the prompt), but `confidence` is neither rendered nor used in any gate — a required schema field with no consumer and no recorded rationale.
- **Fix A**: Remove `confidence` from the schema (lean: schema = what is consumed).
- **Fix B**: Keep it and record its purpose (raw material for S-05+ threshold calibration / logging).
- **Decision**: FIXED via Fix B — rationale comment added above the field in the Phase 1 #2 schema.

## Triage Summary

- Fixed: F1, F2, F3, F4 (Fix B) — all 4
- Skipped / Accepted / Dismissed: none
- **Verdict after fixes: SOUND**
