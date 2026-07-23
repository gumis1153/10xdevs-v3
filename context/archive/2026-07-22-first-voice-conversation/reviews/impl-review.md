<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Voice Conversation (S-03)

- **Plan**: context/changes/first-voice-conversation/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-07-23
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Method: two parallel sub-agents (plan-drift; safety/quality/patterns) + automated
success criteria re-run on the merged master (`72cbf99`): lint ✓, build ✓,
`npm ls` direct deps ✓, anonymous POST → 401 ✓. All planned changes verdict
MATCH; sanctioned deviations (agent opens the conversation; 2:00 cap instead of
5:00 — change.md Notes) verified in code. "What We're NOT Doing" boundaries all
respected. A reported "unused zod" finding was dismissed as a false positive —
`zod@^4` is a peerDependency of `@openai/agents-realtime`, installed as a direct
dep deliberately per plan.

## Findings

### F1 — Upstream OpenAI fetch not wrapped in try/catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/realtime/token/route.ts:39
- **Detail**: A network-level failure (DNS, connection reset) on the `fetch` to
  `https://api.openai.com/v1/realtime/client_secrets` throws and surfaces as an
  unhandled 500 instead of the deliberate 502 + `console.error` path that
  handles non-OK upstream responses. Client UX degrades gracefully either way
  (the component checks `response.ok` and shows the connection-error card), but
  the controlled error path is bypassed on transport failure.
- **Fix**: Wrap the upstream fetch in try/catch and return the same 502 JSON +
  `console.error` on caught transport errors.
- **Decision**: FIXED

### F2 — Dev StrictMode double-mount mints one discarded token

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/voice-conversation.tsx:194
- **Detail**: In the connect flow, `cancelled` is first checked only after the
  token fetch + JSON parse. Under React 19 dev StrictMode double-mount, the
  first (cancelled) effect run still mints and discards one ephemeral token.
  Dev-only waste (120 s TTL, no session started), not a production defect.
- **Fix**: Add an early `if (cancelled) return` right after the getUserMedia
  probe, before the token fetch.
- **Decision**: FIXED

### F3 — Course-tooling files bundled into the phase 1 feature commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit ae665b7 (.claude/*, CLAUDE.md)
- **Detail**: `ae665b7` (token endpoint, p1) also carries 10x-cli manifest and
  skill updates plus CLAUDE.md — unrelated to the S-03 plan. Benign (course
  tooling, not app code), already merged; nothing to do retroactively.
- **Fix**: None retroactively; keep tooling syncs in separate chore commits
  going forward (the touched-file-set discipline already covers this).
- **Decision**: SKIPPED

### F4 — Stale JSDoc still says "limit 5:00"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/voice-conversation.tsx:66
- **Detail**: The component docstring says "twardy limit 5:00 z odliczaniem"
  while the sanctioned cap is 2:00 (`SESSION_SECONDS = 2 * 60`, whose own
  comment is correct and explains the reduction).
- **Fix**: Update the docstring to say 2:00.
- **Decision**: FIXED

### F5 — speech_stopped maps to 'processing', not 'user-speaking'

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/voice-conversation.tsx:162
- **Detail**: The plan's one-line event mapping groups
  `speech_started/stopped → user-speaking`; the code maps `speech_stopped` to
  `processing`. This is consistent with the plan's fuller state machine (user
  stops → model processes → agent) and is an improvement, not a regression.
  Documented here; the plan's Phase blocks are read-only by convention.
- **Fix**: None — recorded in this review as the authoritative note.
- **Decision**: ACCEPTED (documented improvement over the plan's one-line mapping)

### F6 — Upstream response shape not validated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/api/realtime/token/route.ts:77
- **Detail**: `upstream.json()` is not shape-validated; a 200 with an
  unexpected body could yield `{ value: undefined }`. Low risk — `ok` already
  checked; the client treats a non-`ek_` value as a failed connect.
- **Fix**: Optionally guard `typeof value === 'string'` and fall through to the
  502 path otherwise.
- **Decision**: SKIPPED (low risk accepted)
