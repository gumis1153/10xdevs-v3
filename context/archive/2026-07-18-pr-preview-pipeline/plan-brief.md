# Delivery Pipeline (Git → auto-deploy + preview per PR) — Plan Brief

> Full plan: `context/changes/pr-preview-pipeline/plan.md`

## What & Why

Connect the Vercel project `english-talk` to the GitHub repo so merging to `master` deploys production automatically and every PR gets a preview URL. This is roadmap F-01 — the delivery foundation that gives all slices (S-01–S-06) a verification path, and moves the "production deploy" human gate from each CLI deploy onto the PR merge.

## Starting Point

Production is already live (deployed manually via CLI, fra1, Hobby plan), but the Git integration was deliberately disconnected on 2026-07-15 pending this very gate. There is no CI at all, `master` is unprotected, and the repo is private on a Free-tier personal GitHub account — which plan-gates branch protection.

## Desired End State

Opening a PR produces a preview deployment visible on the PR; merging it auto-deploys production with no CLI step. `master` requires PRs (force pushes blocked, Vercel build as a required check), and the whole path is proven by one merged zero-risk test PR. Operational docs (deploy-plan, AGENTS.md) describe the new flow.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Protection fallback (private repo, Free plan) | Make repo public if protection is plan-gated | Full hard protection at zero cost; gated by a sensitive-content sweep + explicit approval |
| CI checks | None — Vercel Git integration only | Vercel already builds (and typechecks) every PR; lint stays a local ritual |
| PR flow | Everything via PR (code, docs, context/) | One consistent flow; every merge is the human gate |
| Pipeline verification | Trivial test PR, merged end-to-end | Proves preview AND auto prod deploy immediately with a diff that can't break anything |
| Gate execution | Agent runs gated commands, per-step user approval | Fastest loop with full veto; everything logged in-session |

## Scope

**In scope:** sync + push pending work, `vercel git connect`, `master` ruleset (PR-required, no force push, required Vercel check), public-visibility fallback, end-to-end test PR, deploy-plan + AGENTS.md updates.

**Out of scope:** GitHub Actions, CLI-based CI deploys, custom domains, plan upgrades, Deployment Protection changes, `context/foundation/*` edits, any feature work.

## Architecture / Approach

Native Vercel Git integration does all the work — no workflow files. Ordering is the design: (1) push pending work so the first auto-deploy builds a known tree, (2) connect + protect (the two registered human gates, executed with per-step approval), (3) prove with a test PR, then require the Vercel check (it must report once before GitHub can require it) and update docs.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pre-connect groundwork | origin/master == local state; assumptions verified | Pending personal notes (`dla-mnie.md`) need a commit/ignore decision |
| 2. Connect Git + protect master | Integration live; `master` PR-only | Protection plan-gated → public flip (content sweep first) |
| 3. Verify end-to-end + docs | Proven pipeline; accurate docs | Preview URLs are auth-gated (verify via `vercel curl`, not anonymous curl) |

**Prerequisites:** user present at gate moments (connect, possible visibility flip, merge); Vercel CLI logged in as `gumis1153`.
**Estimated effort:** 1 session, 3 phases.

## Open Risks & Assumptions

- GitHub Free may allow ruleset creation on this repo (uncertain) — the fallback (public flip) is decided but still approval-gated; if withheld at execution, protection is deferred and recorded, not silently skipped.
- Assumes `vercel git connect` in CLI 56 connects without side-effect deploys (connecting alone doesn't deploy; only subsequent pushes do).
- Flipping public is reversible in settings but not in practice (assume cloned once public).

## Success Criteria (Summary)

- A PR shows a working preview URL; merging it creates a Ready production deployment with no CLI involvement.
- Direct pushes to `master` are rejected (or deferral is explicitly recorded).
- deploy-plan and AGENTS.md match the new reality; the `vercel git connect` gate is recorded as consumed.
