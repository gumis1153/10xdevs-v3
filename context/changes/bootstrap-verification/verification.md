---
bootstrapped_at: 2026-06-27T13:12:40Z
starter_id: next
starter_name: Next.js
project_name: english-talk
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md` frontmatter:

```yaml
starter_id: next
package_manager: npm
project_name: english-talk
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: true
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
```

**Why this stack** (from hand-off body):

Solo builder shipping a voice-first, AI-driven English-practice web app in three
after-hours weeks. The custom path was walked even though Next.js is the kind of
mainstream pick the recommended default leans toward, because the deciding factor
was ecosystem reach: the core is two-way real-time voice (FR-006/007/008) plus
post-session LLM analysis (FR-010/012/013), and Next.js has by far the largest
training-data and example corpus for voice/LLM SDK integration (Vercel AI SDK,
OpenAI Realtime) — load-bearing for an AI-paired solo build where the developer
must judge agent output. It clears all four agent-friendly gates and is
bootstrapper-verified, so scaffolding is smooth; the trade-off versus
10x-astro-starter is that auth and the Postgres database are assembled rather than
batteries-included. Deploys to Vercel (starter default; Fluid Compute suits the
voice/LLM API routes) with GitHub Actions auto-deploy-on-merge. Auth, realtime,
and AI flags are set; payments and background jobs are out of scope per the PRD.

## Pre-scaffold verification

| Signal       | Value                                                | Severity | Notes                                              |
| ------------ | ---------------------------------------------------- | -------- | -------------------------------------------------- |
| npm package  | create-next-app v16.2.9 published 2026-06-27         | fresh    | resolved from cmd_template (`npm create next-app`) |
| GitHub repo  | not run                                              | n/a      | card `docs_url` (nextjs.org/docs) is not a GitHub repo |

## Scaffold log

**Resolved invocation**: `npx create-next-app@latest bootstrap-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 15
**Conflicts (.scaffold siblings)**: CLAUDE.md (existing cwd CLAUDE.md preserved; scaffold's 11-byte stub landed as `CLAUDE.md.scaffold`)
**.gitignore handling**: moved silently (no `.gitignore` existed in cwd)
**.bootstrap-scaffold cleanup**: deleted

**Mechanic note**: the standard temp-dir name `.bootstrap-scaffold` was rejected by `create-next-app` ("name cannot start with a period" — npm package-name validation). The temp directory was renamed `bootstrap-scaffold` (no leading dot) to satisfy the CLI; the subdir-then-move mechanic, conflict policy, and `context/` preservation were otherwise applied unchanged. The first invocation (with the dotted name) exited non-zero but created nothing; the second (dotless) invocation exited 0.

**Moved**: `.gitignore`, `.next/`, `AGENTS.md`, `README.md`, `eslint.config.mjs`, `next-env.d.ts`, `next.config.ts`, `node_modules/`, `package-lock.json`, `package.json`, `postcss.config.mjs`, `public/`, `src/`, `tsconfig.json`, plus `CLAUDE.md` → `CLAUDE.md.scaffold`.

**Note**: the scaffold's `package.json` `name` field is `bootstrap-scaffold` (named after the temp dir). Rename it to `english-talk` manually if desired — it is cosmetic and not consumed by the bootstrap chain.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW
**Direct vs transitive**: 1 direct MODERATE (`next`), 1 transitive MODERATE (`postcss`) of total 2 MODERATE. 0 CRITICAL/HIGH either way.

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

- **postcss** (transitive, via `next` → `node_modules/next/node_modules/postcss`, range `<8.5.10`) — "PostCSS has XSS via Unescaped `</style>` in its CSS Stringify Output" — advisory GHSA-qx2v-qp2m-jg93, CWE-79, CVSS 6.1. Fix available via `next@9.3.3` (flagged `isSemVerMajor: true` — i.e. a downgrade; not a safe auto-fix on a fresh Next 16 project). Advisory affects PostCSS's stringify path; low practical exposure on a default scaffold that does not stringify untrusted CSS.
- **next** (direct, range `9.3.4-canary.0 - 16.3.0-canary.5`) — flagged moderate solely because it depends on the vulnerable `postcss` above (`via: [postcss]`); no independent advisory on `next` itself.

#### LOW / INFO findings

None.

**Recommended handling**: do not run `npm audit fix --force` — the only offered fix downgrades `next` to 9.3.3 (a major-version regression). Wait for an upstream `next` release that bumps its bundled `postcss` to `>=8.5.10`, or accept the advisory given the low practical exposure. Bootstrapper does not auto-patch; this is your call.

## Hints recorded but not acted on

| Hint                    | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| bootstrapper_confidence | verified                                                              |
| quality_override        | false                                                                 |
| path_taken              | custom                                                                |
| self_check_answers      | typed: true, from_official_starter: true, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                  |
| deployment_target       | vercel                                                                |
| ci_provider             | github-actions                                                        |
| ci_default_flow         | auto-deploy-on-merge                                                   |
| has_auth                | true                                                                  |
| has_payments            | false                                                                 |
| has_realtime            | true                                                                  |
| has_ai                  | true                                                                  |
| has_background_jobs     | false                                                                 |

v1 surfaces these but takes no action. The bare Next.js scaffold does not yet
include auth, a Postgres database, realtime/voice wiring, or any LLM integration —
those are downstream work the `has_auth` / `has_realtime` / `has_ai` flags will
inform in a future skill. No CI workflow files were generated despite the
`ci_provider` / `ci_default_flow` hints.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. Here: `CLAUDE.md.scaffold` (the scaffold's 11-byte stub) vs your existing `CLAUDE.md` — almost certainly keep yours and delete the `.scaffold` sibling. Note the scaffold also shipped its own `AGENTS.md`.
- Optionally rename `package.json`'s `name` field from `bootstrap-scaffold` to `english-talk`.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
