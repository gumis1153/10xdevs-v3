---
project: english-talk
researched_at: 2026-07-05
recommended_platform: Vercel
runner_up: Cloudflare (Workers + OpenNext)
context_type: mvp
tech_stack:
  language: TypeScript / JavaScript
  framework: Next.js 16 (App Router, React 19)
  runtime: Node.js
---

## Recommendation

**Deploy on Vercel.**

Vercel is the only candidate that passes all five agent-friendly criteria for this exact stack: it is first-class for Next.js 16, its CLI covers the full deploy/promote/rollback/log loop, its docs are agent-readable (`llms.txt` + `.md` URLs), and its Active-CPU / Fluid Compute pricing bills ~$0 for I/O wait — decisive for a workload that is dominated by waiting on OpenAI and Postgres rather than burning CPU. The interview reinforced it: the persistent-connection filter never fired (voice is browser↔OpenAI over WebRTC; the server only mints ephemeral tokens, so a stateless serverless model fits perfectly), you prioritise DX over squeezing cost, and you already know Vercel. The free Hobby tier comfortably covers MVP scale (medium users / low QPS). The runner-up, Cloudflare Workers via the GA OpenNext adapter, is the swap target if Vercel lock-in or pricing ever becomes a concern.

## Platform Comparison

Hard filters applied first: (a) the persistent-connection requirement **did not fire** — the real-time audio stream is browser↔provider (WebRTC) with the server only minting short-lived tokens, so serverless-only platforms stay in the pool; (b) tech-stack runtime — all six candidates run Next.js 16 on Node (Vercel/Netlify natively, Cloudflare via the GA OpenNext adapter, Fly/Railway/Render as a container or Node service), so nothing was dropped for runtime mismatch.

Interview weights applied after: **single-region-is-fine** neutralises Cloudflare's edge-native advantage; **external-DB-is-fine** neutralises Railway's co-located Postgres; **DX-priority** penalises Fly (Dockerfile ownership) and the always-on PaaS pair (Railway/Render) relative to zero-config serverless; **Vercel familiarity** breaks ties toward Vercel.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / integration |
|---|---|---|---|---|---|
| **Vercel** | Pass | Pass | Pass | Pass | Pass* (MCP public beta, read-only) |
| **Cloudflare** | Pass | Pass | Pass | Partial | Pass (GA servers) |
| **Netlify** | Partial (rollback UI-only) | Pass | Pass | Pass | Pass (GA MCP) |
| **Railway** | Pass | Partial (always-on) | Pass | Pass | Partial (MCP beta) |
| **Render** | Pass | Partial (always-on) | Partial (no llms.txt) | Pass | Partial (MCP early-access) |
| **Fly.io** | Partial (rollback = pinned-digest redeploy) | Partial (you own the Dockerfile) | Pass | Pass | Partial (MCP experimental) |

Per-platform notes:

- **Vercel** — First-class Next.js 16 (Turbopack default, GA). CLI is complete and scriptable: `vercel --prod`, `vercel promote`, `vercel rollback`, `vercel logs`. Docs served as markdown (`.md` suffix + `llms.txt`). Fluid Compute + Active-CPU pricing (GA since Apr 2025) bills only active CPU ms — I/O wait on OpenAI/DB is free. Only soft mark: the official MCP (`mcp.vercel.com`, launched Aug 2025) is **public beta and read-only** — writes still go through the CLI.
- **Cloudflare (Workers + OpenNext)** — Fully serverless, cheapest, GA MCP servers, and `wrangler rollback` gives true CLI rollback. Deploy-API mark is Partial: the `@opennextjs/cloudflare` adapter is comparatively young, ISR/cache needs an explicitly-declared KV namespace binding (the most common failure), and **Pages vs Workers commands are not interchangeable** (this is a Workers deploy; `next-on-pages` is now maintenance-only). Single-region preference wastes its edge advantage. Strongest *different* alternative → runner-up.
- **Netlify** — Closest DX twin to Vercel (zero-config OpenNext, Next.js 16 supported), GA MCP server. Two frictions: synchronous functions cap around ~10–30s (verify per plan) which threatens the post-session LLM analysis route unless it streams or runs as a background function (15-min limit), and **rollback is UI-only** (`netlify deploy --prod` is draft-by-default and explicit, but there is no first-class CLI rollback), which dings the CLI-first criterion for agent ops.
- **Railway** — Clean CLI (`railway up` / `redeploy` / `logs`), agent-readable docs, co-located Postgres (bonus you don't need). Marked down: always-on service (not scale-to-zero serverless), $5/mo Hobby floor (~$5–15/mo realistic), and MCP is beta/WIP. Free tier removed.
- **Render** — GA scriptable CLI (JSON output, `RENDER_API_KEY` auth), `render.yaml` IaC. Marked down: always-on (free tier cold-starts after 15 min idle; cheapest always-on is $7/mo Starter), docs are HTML/REST with no confirmed `llms.txt`/GitHub-markdown, and MCP is early-access.
- **Fly.io** — Strong `flyctl` and agent-readable docs, EU regions (fra/ams), scale-to-zero. But container-first (you own the Dockerfile — friction against DX-priority for a solo dev), no first-class rollback (redeploy a pinned image digest), MCP experimental, and the old free tier is gone.

### Shortlisted Platforms

#### 1. Vercel (Recommended)

Won on all five criteria plus the two decisive project-specific facts: the workload is I/O-bound (Active-CPU pricing → the OpenAI/DB wait costs nothing) and the architecture is stateless (browser-direct WebRTC → no need for a persistent-process platform at all). Best-in-class Next.js 16 DX, familiar to you, free tier fits MVP scale.

#### 2. Cloudflare (Workers + OpenNext)

Second because it is the strongest *genuinely different* option: no Vercel lock-in, cheapest tier, GA MCP, and true CLI rollback (`wrangler rollback`). The gap: the OpenNext adapter adds real friction (KV-binding footgun, Workers-vs-Pages command split, younger toolchain), and its edge-native strength is neutralised by your single-region answer. Swap here if lock-in or cost pressure appears.

#### 3. Netlify

Third as the closest DX twin to Vercel with a GA MCP server and zero-config Next.js 16. It falls behind on two concrete points that matter for *this* app: the synchronous function timeout threatens the core post-session analysis route (mitigable via streaming/background functions), and rollback is a dashboard action rather than a CLI command.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **The ephemeral-token route is a hot, abusable endpoint.** The entire architecture hinges on a server route that mints OpenAI Realtime tokens. On serverless it scales infinitely, so an abuser who scrapes it can mint tokens against *your* OpenAI billing with no natural backpressure. Vercel provides no per-user function rate-limit by default — you must add Upstash / `@vercel/firewall` yourself.
2. **Active-CPU pricing looks free until usage runs away.** Invocations are still metered (1M/mo free) and each token-mint hit triggers downstream OpenAI cost. The model that looks cheap at honest traffic has no default ceiling.
3. **300s Hobby function cap vs. whole-transcript analysis.** FR-010/011/012 analyse the full session transcript with an LLM at the *end* of the flow. A long transcript + a slow model could exceed 300s on Hobby, hard-timing-out the analysis and giving the user nothing after a complete session — the worst place to fail.
4. **Config/pricing churn (`vercel.json` → `vercel.ts`, Fluid/Active-CPU).** Recent format and pricing changes mean docs, tutorials, and the agent's training data disagree; a pasted 2024 snippet can silently misbehave.
5. **Default region is `iad1` (US-East).** Polish users + an EU Postgres mean every un-pinned request round-trips US↔EU, adding ~100–150ms to a latency-sensitive voice UX. Not the default; easy to forget.

### Pre-Mortem — How This Could Fail

The team shipped english-talk on Vercel Hobby in week three and it demoed beautifully. The token-mint route was never rate-limited — "MVP, we'll add it later." In month two the app got some traction on Polish dev Twitter; someone spotted `/api/realtime-token` in devtools, scripted it, and ran up a four-figure OpenAI bill over a weekend before anyone noticed — there was no spend alert. Panicked, they moved token-minting behind auth, but the anonymous "try it" flow had been the main funnel, so conversions cratered. Meanwhile the post-session analysis route, fine on short test sessions, began timing out on real 3-minute transcripts once they switched to a slower, better model: users finished a full, anxious conversation and got a spinner then an error — exactly the trust-destroying failure the PRD guardrails warned against. Costs, which "Active CPU" had made feel free, were dominated entirely by OpenAI, which Vercel never bounded. The platform wasn't wrong; the serverless-scales-infinitely default met an unmetered external API and nobody drew the boundary.

### Unknown Unknowns

- **Your real cost lives at OpenAI, not Vercel.** Vercel meters invocations/CPU; the dashboard will look cheap while actual burn is invisible to it. Instrument OpenAI-side spend separately — the platform cost view gives false comfort.
- **The Vercel MCP is read-only public beta.** The agent can inspect deployments/logs but cannot deploy/rollback via MCP; all mutations go through the `vercel` CLI. Don't build an agent ops loop that assumes MCP write access.
- **`vercel dev` is largely legacy for Next.js 16.** `next dev` (Turbopack) is the real local loop; tutorials still recommending `vercel dev` mostly duplicate it and can mask routing differences rather than reveal them.
- **Hobby forbids commercial use.** The moment english-talk takes money or becomes "a business," Pro ($20/mo) is required — a licensing cliff, not a technical one.
- **Fluid Compute reuses instances across concurrent requests.** Module-scope globals (a cached OpenAI client, in-memory per-user state) can leak across users in a way one-request-per-instance serverless never did. Code written on the old mental model can cross-contaminate sessions.

## Operational Story

- **Preview deploys**: Every push to a non-production branch (and every PR) auto-builds a unique preview URL via the Vercel↔GitHub integration; production deploys on merge to the default branch (matches the `auto-deploy-on-merge` hint in `tech-stack.md`). Previews are public by default — enable Deployment Protection (Vercel Authentication / password) if a preview must not be open, and note fork-PR previews don't receive production env vars.
- **Secrets**: Env vars live in Vercel Project Settings (Development / Preview / Production scopes), pulled locally with `vercel env pull .env.local` and set from the CLI with `vercel env add`. `OPENAI_API_KEY` and the Postgres/Supabase connection string are Production-scoped, never committed. `NEXT_PUBLIC_*` vars are inlined at build time — treat them as public. Rotate by updating the value and redeploying; rotation of the OpenAI key is a manual, human-only action.
- **Rollback**: `vercel rollback <deployment-url|id>` reverts production instantly to a prior deployment (`vercel rollback status` to confirm); alternatively promote a known-good deployment with `vercel promote <url> --yes`. Caveat: rollback reverts *code*, not data — a shipped DB migration does not roll back automatically, so treat migrations as forward-only.
- **Approval**: An agent may run preview deploys and read logs unattended. Human-gated actions: promoting/rolling back **production**, rotating the OpenAI key or DB credentials, changing the project region, and any billing-tier change. Production mutations happen behind an explicit human step (Plan Mode approval or a manual CLI run).
- **Logs**: `vercel logs <deployment-url> --since 30m` tails/queries runtime and function logs (read-only, scriptable). The Vercel MCP (`mcp.vercel.com`, public beta) exposes read-only deployment/log inspection for structured queries; writes still go through the CLI.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Token-mint endpoint abused → runaway OpenAI bill | Devil's advocate / Pre-mortem | M | H | Require auth (or per-IP + per-session) rate-limiting on the token route from day one (Upstash rate-limit / `@vercel/firewall`); scope the minted token to the shortest viable TTL. |
| No spend ceiling; cost invisible on Vercel dashboard | Unknown unknowns / Pre-mortem | M | H | Set OpenAI-side hard usage limits + billing alerts; monitor OpenAI spend separately from Vercel. Do not rely on the Vercel cost view. |
| Post-session analysis exceeds 300s Hobby function cap | Devil's advocate / Research finding | L | H | Cap analysis input (transcript length), stream the response, and/or move analysis to a background/queued route; upgrade to Pro (800s) if traffic warrants. Fail gracefully with a retry, never a bare error. |
| Default `iad1` region adds US↔EU latency to EU users + EU DB | Devil's advocate | M | M | Pin function region to `fra1`/`arn1` in project config; co-locate Postgres (Supabase/Neon) in the same EU region. |
| Config/pricing churn → stale `vercel.json`/`vercel dev` patterns | Devil's advocate / Unknown unknowns | M | L | Use `vercel.ts` for config; use `next dev` (Turbopack) as the local loop, not `vercel dev`; verify any pasted snippet against current docs (checked 2026-07-05). |
| Fluid Compute instance reuse leaks per-user state across sessions | Unknown unknowns | L | H | Never store per-user/request state at module scope; instantiate per-request or key by session. Review any cached client/global for cross-request contamination. |
| Hobby tier forbids commercial use (licensing cliff) | Unknown unknowns | L | M | Move to Pro ($20/mo) the moment the app monetises or becomes a business; budget for it in the post-MVP plan. |
| MCP is read-only beta — agent cannot mutate via MCP | Unknown unknowns / Research finding | H | L | Architect agent ops around the `vercel` CLI for writes; use MCP only for read/inspect. Re-check MCP write support as it exits beta. |
| Vercel lock-in if pricing/policy shifts | Pre-mortem | L | M | Keep the app portable (standard Next.js 16, no Vercel-only primitives on the critical path); runner-up Cloudflare/OpenNext is a documented exit. |

## Decision Log

- **2026-07-15 — AI provider: OpenAI direct; OpenRouter evaluated and rejected.**
  Verified against OpenRouter docs (2026-07-15): OpenRouter supports only
  turn-based audio via chat completions — no Realtime API (no WebRTC/WebSocket
  sessions, no ephemeral `client_secrets` tokens), which the entire voice
  architecture depends on. Both Realtime voice and transcript analysis stay on
  OpenAI direct. Revision is admissible **only for the transcript-analysis
  route**, if cost control becomes pressing (OpenRouter offers prepaid credits
  and per-key limits — a hard cap OpenAI does not offer).

## Getting Started

Validated against Next.js 16 + the current Vercel CLI (checked 2026-07-05). Your installed `vercel` CLI is 50.43.0 — upgrade first, as the deploy/rollback surface has moved.

1. **Upgrade the CLI**: `npm i -g vercel@latest` (session reported 50.43.0 → 54.20.1 available).
2. **Link the project**: from the repo root, `vercel link` (connects this directory to a Vercel project; creates it on first run). Do **not** add a separate `vercel dev` step to your loop — `npm run dev` (`next dev`, Turbopack) is the local loop for Next.js 16.
3. **Pin the region and set secrets**: create `vercel.ts` (the current config format, replacing `vercel.json`) and set the function region to an EU region (`fra1` or `arn1`) to sit near your EU Postgres. Then `vercel env add OPENAI_API_KEY production` and add the Postgres/Supabase connection string; pull them locally with `vercel env pull .env.local`.
4. **First deploy**: `vercel` for a preview URL, then `vercel --prod` for production (or wire GitHub auto-deploy-on-merge per the tech-stack hint). Confirm the build uses Turbopack and the app boots.
5. **Wire the safety rails before going public**: add rate-limiting to the token-mint route and set OpenAI-side spend limits/alerts (see the risk register — these are the two highest-impact items and belong in the first implementation pass, not "later").

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond noting Vercel's GitHub auto-deploy)
- Production-scale architecture (multi-region, HA, DR)
