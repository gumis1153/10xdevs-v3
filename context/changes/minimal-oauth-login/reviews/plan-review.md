<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Minimal OAuth Login (Google via Supabase Auth)

- **Plan**: `context/changes/minimal-oauth-login/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-20
- **Verdict**: SOUND (was REVISE; all findings fixed during triage)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → fixed |
| Plan Completeness | WARNING → fixed |

## Grounding

7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓, Progress contract ✓. Riskiest claims (Next 16 `proxy.ts` convention, `@supabase/ssr` pattern, config.toml/env state) verified same-session against `node_modules/next/dist/docs/` and live Supabase docs; blast radius nil (greenfield files + two scaffold pages with no other importers).

## Findings

### F1 — localhost vs 127.0.0.1 breaks the local OAuth loop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — config.toml change + Manual Testing Steps
- **Detail**: `supabase/config.toml:159` pins `site_url` to `http://127.0.0.1:3000`; allowlist held only `https://127.0.0.1:3000`. A tester browsing `http://localhost:3000` gets a silent fallback to `site_url` (dropped `/auth/callback` path) plus a PKCE-verifier cookie stranded on the wrong origin — a confusing mid-Phase-2 failure.
- **Fix**: Extend `additional_redirect_urls` with `http://127.0.0.1:3000/**` and `http://localhost:3000/**` in the Phase 2 contract; pin Manual Testing Steps to `http://127.0.0.1:3000`.
- **Decision**: FIXED

### F2 — Redirect allowlist left as an either/or; loose option trusts all of vercel.app

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — human runbook; Critical Implementation Details
- **Detail**: Runbook offered "`https://*.vercel.app/**` or the project-scoped pattern" — an unresolved decision for the human at the console; the loose wildcard allowlists every deployment on Vercel's shared domain as a valid OAuth redirect target.
- **Fix**: Pin `https://english-talk-*-gumis1153s-projects.vercel.app/**` (pattern verified against deploy-plan's preview URL example); delete the either/or; forbid the global wildcard explicitly.
- **Decision**: FIXED

### F3 — Free-tier Supabase project may be paused when verification runs

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2/3 — human runbook / preview verification
- **Detail**: deploy-plan records that the remote free-tier project pauses after ~1 week idle (provisioned 2026-07-15; local dev never touches it). A paused project makes preview sign-in failures imitate OAuth misconfiguration.
- **Fix**: "Check/resume the Supabase project in the dashboard" added as the first Phase 2 runbook step; pre-check note added to Phase 3 PR/preview contract.
- **Decision**: FIXED
