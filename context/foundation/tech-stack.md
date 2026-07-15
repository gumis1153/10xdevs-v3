---
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
---

## Why this stack

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

> **Provider note (2026-07-15)**: OpenAI Realtime stays on OpenAI direct.
> OpenRouter was evaluated and rejected — it has no Realtime API support
> (no WebRTC/WebSocket sessions, no ephemeral `client_secrets` tokens), which
> the voice architecture depends on. See the decision entry in
> `infrastructure.md` for scope of any future revision.
