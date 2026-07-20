# Delivery Pipeline (Git → auto-deploy + preview per PR) Implementation Plan

## Overview

Connect the Vercel project `english-talk` to the GitHub repo `gumis1153/10xdevs-v3` so that merging to `master` automatically deploys production and every PR gets a preview URL. Protect `master` so the PR becomes the single enforcement point — including the future MERGE-GATE for S-03 (Realtime token endpoint). Prove the pipeline end-to-end with a merged, zero-risk test PR.

This is roadmap item **F-01** (`Change ID: pr-preview-pipeline`), Stream C — Delivery. It unlocks the verification path (preview per PR) for slices S-01–S-06.

## Current State Analysis

- **Production is live**: `english-talk` (`prj_b8uitxqUyKOYg4okiggJJmqB7kQI`), Hobby plan, region fra1, prod URL https://english-talk-black.vercel.app. All deploys so far were manual via CLI.
- **Git integration is deliberately disconnected** (`context/deployment/deploy-plan.md:21`): CLI 56 auto-connected it during `vercel link` on 2026-07-15 and it was immediately disconnected because connecting Git is a registered human gate (deploy-plan, gate registry). This change consumes that gate.
- **No CI exists**: `.github/workflows/` is absent; AGENTS.md documents "no CI gate — run lint and build locally".
- **The GitHub repo is private on a personal (Free-tier) account** — classic branch protection and rulesets on private repos require GitHub Pro. Enabling protection may fail with a plan-gating error.
- **Deployment Protection is ON** (`all_except_custom_domains`): anonymous requests to preview/deployment URLs get 401/302; only production aliases are public.
- **Preview env vars are already provisioned**: all 16 Supabase variables exist in Production/Preview/Development scopes — preview deploys need no new secrets.
- **Working tree is dirty**: uncommitted lesson skills (`.claude/skills/10x-*`), `CLAUDE.md`, `.claude/.10x-cli-manifest.json`, this change folder, and `dla-mnie.md` (personal notes).

## Desired End State

- Vercel project is linked to `gumis1153/10xdevs-v3` with production branch `master`.
- Opening a PR against `master` produces a Vercel preview deployment with a URL visible on the PR.
- Merging a PR to `master` automatically creates a production deployment (no CLI involved).
- `master` has branch protection: PRs required, force pushes blocked, and (once its check name is known) the Vercel build as a required status check. If protection is plan-gated, the repo has been flipped to public first (user's chosen fallback). A third sanctioned outcome: protection explicitly deferred by user decision at execution time, recorded in `change.md` — in that case the protection-related criteria (2.2, 3.2, 3.7) pass via the recorded deferral.
- The pipeline is proven: one trivial test PR went preview → merge → automatic production deploy → healthy prod URL.
- `context/deployment/deploy-plan.md` and `AGENTS.md` describe the new flow; the `vercel git connect` gate is recorded as consumed.

### Key Discoveries:

- `context/deployment/deploy-plan.md:95` — Runbook step 1 prescribes exactly this change; the gate registry (`deploy-plan.md:53-68`) says the agent prepares gated actions and executes only with explicit consent. User chose: agent runs gated commands with per-step approval.
- `context/deployment/deploy-plan.md:19` — Deployment Protection means preview URLs are NOT anonymously reachable; verification must use `vercel curl` or an authenticated browser session. Do not disable protection.
- `context/deployment/deploy-plan.md:81` — standing constraint #10: non-interactive `vercel` invocations must pass `--scope gumis1153s-projects`.
- `gh api repos/gumis1153/10xdevs-v3` — `private: true`, `owner_type: User`, default branch `master`. Protection may be plan-gated (GitHub Free).
- Vercel builds run `next build` (typecheck included) on every PR, but Next 16 build does not run ESLint — accepted gap (decision: no GitHub Actions; lint stays a local ritual).

## What We're NOT Doing

- **No GitHub Actions workflow** — the Vercel Git integration is the only PR gate (user decision). Lint remains a local pre-push ritual per AGENTS.md.
- **No CLI-based CI deploy pattern** (`vercel build` + `deploy --prebuilt`) — native Git integration replaces it.
- **No custom domain, no plan upgrades** (neither Vercel Pro nor GitHub Pro).
- **No changes to Deployment Protection settings.**
- **No edits to `context/foundation/*`** — roadmap F-01 status flips to `done` via `/10x-archive`, not by this plan.
- **No OpenAI/Supabase feature work** — this is delivery plumbing only.

## Implementation Approach

Three phases, ordered so that nothing auto-deploys until GitHub `master` matches the local working state. Phase 1 syncs the repo. Phase 2 executes the two gated platform mutations (connect Git, protect branch — with the public-visibility fallback if protection is plan-gated). Phase 3 proves the pipeline with a real PR and updates the operational docs.

All gated commands (`vercel git connect`, visibility flip, PR merge) are run by the agent **only after explicit per-step user approval in-session**.

## Critical Implementation Details

### Ordering: sync before connect

Once Git is connected, every push to `master` triggers a production build. The dirty working tree must be committed and pushed **before** `vercel git connect`, so the first auto-deploy (at test-PR merge) builds a known-good tree, not a surprise batch of pending changes.

### Required status check needs a prior report

GitHub required status checks can only reference a check context after it has reported at least once. The Vercel check name (e.g. `Vercel`) is therefore observed on the Phase 3 test PR first, and only then added to the ruleset as required. Requiring PRs and blocking force pushes do not have this dependency and go live in Phase 2.

### Preview URLs are auth-gated

Deployment Protection returns 401 to anonymous requests on preview URLs. Automated verification must use `vercel curl / --deployment <preview-url>` (authenticated; the CLI resolves the deployment — the path is the first argument, not the full URL); browser verification requires the user's Vercel SSO session. Do not disable protection to make verification easier.

### Public-visibility fallback requires a content sweep

If protection is plan-gated and the repo is flipped public, everything in the repo becomes readable: `context/` planning docs, `dla-mnie.md`, deploy-plan (contains project/deployment IDs — not secrets, but review anyway). A sensitive-content sweep is a mandatory step before `gh repo edit --visibility public`, and the flip itself is a gated approval.

## Phase 1: Pre-connect groundwork

### Overview

Bring GitHub `master` to parity with the local working state and confirm all platform assumptions, so connecting Git later cannot trigger a deploy of unreviewed state.

### Changes Required:

#### 1. Commit and push pending work

**File**: working tree (`.claude/skills/10x-*`, `CLAUDE.md`, `.claude/.10x-cli-manifest.json`, `context/changes/pr-preview-pipeline/`, `dla-mnie.md`)

**Intent**: Land all pending lesson artifacts on `master` and push, so origin/master == the state the first auto-deploy will build. Run the AGENTS.md pre-push ritual (`npm run lint`, `npm run build`) first.

**Contract**: `git status --porcelain` is empty afterwards and `origin/master` == local `HEAD`. `dla-mnie.md` is a personal notes file — ask the user at execution time whether it gets committed or gitignored (it must not be left untracked, because a later public flip would surface the question again under pressure).

#### 2. Verify platform assumptions

**File**: (no file changes — read-only checks)

**Intent**: Confirm the ground the gated phase stands on: `vercel whoami` is `gumis1153`, `.vercel/project.json` points at `english-talk`, and `git remote origin` is `gumis1153/10xdevs-v3`. (The Vercel production-branch setting cannot be checked here — the project's `link` is `null` until Git is connected; it is verified, with remediation, in Phase 2.)

**Contract**: All checks pass; any mismatch stops the change before gates are consumed.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Working tree clean: `git status --porcelain` empty
- Remote parity: `git rev-parse HEAD` == `git rev-parse origin/master`
- Project link intact: `.vercel/project.json` names `english-talk`; `vercel whoami` returns `gumis1153`

#### Manual Verification:

- User decided the fate of `dla-mnie.md` (committed vs gitignored)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Connect Git + protect master (gated)

### Overview

Execute the two registered human gates with per-step approval: connect the Vercel project to the GitHub repo, then enable branch protection on `master` — falling back to flipping the repo public if protection is plan-gated.

### Changes Required:

#### 1. Connect the Git integration (GATE — per-step approval)

**File**: (platform mutation — Vercel project settings)

**Intent**: Run `vercel git connect` (with `--scope gumis1153s-projects` if non-interactive) so pushes and PRs on `gumis1153/10xdevs-v3` drive deployments. This consumes the `vercel git connect` gate from the deploy-plan registry.

**Contract**: The Vercel project's `link` shows repo `gumis1153/10xdevs-v3` and production branch `master` (verify via `vercel api` project inspection or dashboard; pre-connect the `link` field is `null`). If the production branch comes up as anything other than `master`, remediate by updating the project setting via API/dashboard — a mismatch is a setting to fix, not a reason to abort. No deployment is triggered by connecting alone.

#### 2. Enable branch protection on master (GATE — with fallback)

**File**: (platform mutation — GitHub repo settings via `gh api`)

**Intent**: Create a ruleset on `master`: require a pull request before merging (0 approvals — solo repo), block force pushes and deletions. Do NOT add a required status check yet (see Critical Implementation Details — the Vercel check must report once first; it becomes required in Phase 3).

**Contract**: A `master` ruleset exists and is active. **Fallback path** (user decision): if creation fails with a plan-gating error on the private repo → (a) run a sensitive-content sweep over the repo, (b) with explicit approval, `gh repo edit gumis1153/10xdevs-v3 --visibility public`, (c) retry the ruleset. If the user withholds the flip at execution time, stop and record protection as deferred — do not silently continue.

### Success Criteria:

#### Automated Verification:

- Git link active: Vercel project inspection shows `gumis1153/10xdevs-v3`, production branch `master`
- Protection active: `gh api repos/gumis1153/10xdevs-v3/rules/branches/master` lists the PR-required rule (or the documented fallback/deferral is recorded)

#### Manual Verification:

- Explicit approval given before `vercel git connect`
- If fallback triggered: sensitive-content sweep reviewed and explicit approval given before the visibility flip

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: End-to-end verification + docs

### Overview

Prove both halves of F-01 with one zero-risk PR — preview URL on open, automatic production deploy on merge — then finish protection (required Vercel check) and update the operational docs.

### Changes Required:

#### 1. Test PR: preview verification

**File**: docs-only branch carrying the operational-docs updates from change #4 (`context/deployment/deploy-plan.md`, `AGENTS.md`)

**Intent**: Open a PR against `master` whose diff is the docs updates from change #4 — still zero-risk (no application code), but no longer an empty throwaway. This is also the only compliant landing path for those docs once protection requires PRs. Confirm the Vercel bot posts a preview deployment and capture the exact check-context name.

**Contract**: The PR shows a Vercel preview deployment; `vercel curl / --deployment <preview-url>` returns HTTP 200 (anonymous curl is expected to get 401 — that is Deployment Protection working, not a failure).

#### 2. Require the Vercel status check

**File**: (platform mutation — GitHub ruleset update)

**Intent**: Now that the Vercel check has reported on the test PR, add its observed context name to the `master` ruleset as a required status check, making "build fails → merge blocked" enforceable. Skip if protection was deferred in Phase 2.

**Contract**: Ruleset lists the Vercel check as required; a PR with a failing build cannot merge.

#### 3. Merge and verify auto production deploy (GATE — approval to merge)

**File**: (platform action — PR merge)

**Intent**: Merge the test PR with explicit approval (first Git-driven production deploy). Confirm a production deployment is created by the Git integration, reaches Ready, and the prod alias stays healthy.

**Contract**: `vercel ls` / dashboard shows a new production deployment sourced from the merge commit (not CLI); https://english-talk-black.vercel.app returns HTTP 200 serving that deployment. Known-good rollback target remains `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w` (deploy-plan).

#### 4. Update operational docs

**File**: `context/deployment/deploy-plan.md`

**Intent**: Record reality: snapshot row "Git integration" → connected (date); gate registry → `vercel git connect` consumed, merge-to-master is now the production gate; runbook step 1 → done; add standing constraint: all changes land via PR (user decision), preview verification via `vercel curl` under Deployment Protection.

**Contract**: The doc reflects the post-change state; the MERGE-GATE constraint (#1) now points at PR review as its enforcement point.

**File**: `AGENTS.md`

**Intent**: Replace the "There is no CI gate" sentence in Commit & PR guidelines with the new flow: all changes via PR against `master`; every PR gets a Vercel preview build (typecheck included); merge auto-deploys production; lint remains a local pre-push ritual.

**Contract**: Commit & Pull Request Guidelines section describes the PR flow accurately; no other AGENTS.md sections change.

**Landing path** (plan-review F2, Fix A): both docs edits are authored on the test-PR branch and land through the Phase 3 test PR — after protection is active, `master` accepts changes only via PR. Their accuracy is re-verified after the merge (criterion 3.8); if the merged reality diverges, fix forward in a follow-up PR.

### Success Criteria:

#### Automated Verification:

- Preview reachable authenticated: `vercel curl / --deployment <preview-url>` returns 200
- Direct push rejected: a test push straight to `master` is refused by protection (skip if protection deferred)
- Production deployment auto-created from merge commit and status Ready (via `vercel ls` / `vercel api`)
- Prod alias healthy: `curl -s -o /dev/null -w '%{http_code}' https://english-talk-black.vercel.app` returns 200

#### Manual Verification:

- Preview URL opened in an authenticated browser and renders the app
- Explicit approval given before merging the test PR
- Vercel check appears as required on a subsequent PR (or deferral recorded)
- deploy-plan.md and AGENTS.md read correctly against the new reality

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This completes the change — `/10x-archive pr-preview-pipeline` after the user considers it closed.

---

## Testing Strategy

### Unit Tests:

- None — no application code changes; no test framework configured (AGENTS.md).

### Integration Tests:

- The Phase 3 test PR IS the integration test: PR → preview deployment → merge → automatic production deployment.

### Manual Testing Steps:

1. Open the preview URL from the test PR in a logged-in browser; confirm the app renders.
2. After merge, load https://english-talk-black.vercel.app and confirm it serves without error.
3. Attempt a direct push to `master`; confirm rejection (if protection active).

## Performance Considerations

None — no runtime code changes. Build minutes on Hobby are ample for one PR + one prod build.

## Migration Notes

- **Rollback of the integration**: `vercel git disconnect` restores the pre-change state (proven on 2026-07-15). Ruleset deletion restores unprotected `master`. A public→private flip is also reversible, but treat visibility as a one-way door in practice (once public, assume cloned).
- **Deploy rollback**: known-good target `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w` via `vercel rollback` (itself a human gate).

## References

- Runbook + gate registry: `context/deployment/deploy-plan.md` (step 1, gate table, standing constraints #9–10)
- Roadmap item: `context/foundation/roadmap.md` (F-01)
- Change identity: `context/changes/pr-preview-pipeline/change.md`
- Stack hints (`ci_default_flow: auto-deploy-on-merge`): `context/foundation/tech-stack.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pre-connect groundwork

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 2b4c669
- [x] 1.2 Build passes: `npm run build` — 2b4c669
- [x] 1.3 Working tree clean: `git status --porcelain` empty — 2b4c669
- [x] 1.4 Remote parity: `git rev-parse HEAD` == `git rev-parse origin/master` — 2b4c669
- [x] 1.5 Project link intact: `.vercel/project.json` names `english-talk`; `vercel whoami` returns `gumis1153` — 2b4c669

#### Manual

- [x] 1.6 User decided the fate of `dla-mnie.md` (committed vs gitignored) — 2b4c669

### Phase 2: Connect Git + protect master (gated)

#### Automated

- [x] 2.1 Git link active: Vercel project shows `gumis1153/10xdevs-v3`, production branch `master` — 50c6cd5
- [x] 2.2 Protection active: `master` ruleset lists PR-required rule (or fallback/deferral recorded) — 50c6cd5

#### Manual

- [x] 2.3 Explicit approval given before `vercel git connect` — 50c6cd5
- [x] 2.4 If fallback triggered: sensitive-content sweep reviewed and approval given before visibility flip — 50c6cd5

### Phase 3: End-to-end verification + docs

#### Automated

- [x] 3.1 Preview reachable authenticated: `vercel curl / --deployment <preview-url>` returns 200 — 94dc656
- [x] 3.2 Direct push to `master` rejected by protection (skip if deferred) — 94dc656
- [x] 3.3 Production deployment auto-created from merge commit, status Ready — 94dc656
- [x] 3.4 Prod alias healthy: HTTP 200 from https://english-talk-black.vercel.app — 94dc656

#### Manual

- [x] 3.5 Preview URL renders the app in an authenticated browser — 94dc656
- [x] 3.6 Explicit approval given before merging the test PR — 94dc656
- [x] 3.7 Vercel check required on subsequent PRs (or deferral recorded) — 94dc656
- [x] 3.8 deploy-plan.md and AGENTS.md updated and accurate — 94dc656
