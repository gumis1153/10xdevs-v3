# Minimal OAuth Login (Google via Supabase Auth) Implementation Plan

## Overview

Put the english-talk app behind a login gate: a user can create an account and sign in with Google (OAuth-only, server-side PKCE flow via Supabase Auth), see a minimal authenticated home proving who they are, and sign out. This implements roadmap slice S-01 (`minimal-oauth-login`) and formally closes PRD Open Question 1 with the decision: **OAuth-only, Google as the sole provider** (GitHub dropped — product decision 2026-07-20).

## Current State Analysis

- **Bare scaffold.** `src/app/` contains only the create-next-app defaults (`layout.tsx`, `page.tsx`, `globals.css`). No `src/lib/`, no components, no `proxy.ts`/`middleware.ts` anywhere.
- **No Supabase runtime packages.** `package.json` dependencies are only `next@16.2.9`, `react@19.2.4`, `react-dom@19.2.4`. The `supabase` CLI (^2.109.1) is a devDependency; `@supabase/ssr` / `@supabase/supabase-js` are absent.
- **Supabase provisioned but auth-dead.** Remote project `supabase-cordovan-kettle` (eu-central-1) is linked via Vercel Marketplace with 16 env vars in all scopes (incl. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, legacy `*_ANON_KEY`). Local stack exists (`supabase/config.toml`, `project_id = "english-talk"`, `[auth] enabled = true`) but has **no** `[auth.external.google]` section — all OAuth providers disabled.
- **Delivery path is ready.** Git integration live (2026-07-20): every PR gets a Vercel preview (behind Deployment Protection), merge to `master` deploys production (`https://english-talk-black.vercel.app`, region fra1). Direct pushes blocked by `protect-master`.
- **Human gates registered in `context/deployment/deploy-plan.md`:** OAuth client ID/secret creation and Supabase Dashboard configuration are human-only steps; this slice contains them by design (roadmap S-01 note).
- **No test framework configured** (AGENTS.md) — verification is lint + build + manual.

## Desired End State

An anonymous visitor to any route is redirected to `/login`, which shows a Google sign-in button (Polish UI copy). Completing Google OAuth lands the user on `/` showing their identity (email + avatar from the Google profile) and a sign-out button. Sign-out returns to `/login`. A failed/denied OAuth attempt returns to `/login` with a human-readable inline error. The loop works on the local Supabase stack and on a PR preview URL; roadmap and PRD record the Google-only decision.

Verify by: `npm run lint` + `npm run build` clean; manual sign-in/sign-out loop on local stack and on the PR preview; anonymous access to `/` redirecting to `/login` in both environments.

### Key Discoveries:

- **Next.js 16 renamed middleware to proxy** — request interception lives in `src/proxy.ts` (same level as `app/`), exported `proxy(request: NextRequest)`, Node runtime, `runtime` segment option not allowed (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`).
- **Supabase's current Next.js recipe is already proxy-shaped** and uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new key naming) with the `getAll`/`setAll` cookie contract (`@supabase/ssr` docs; https://supabase.com/docs/guides/ai-tools/ai-prompts/nextjs-supabase-auth).
- **`cookies()` is async in Next 16 and Server Components cannot set cookies** — session cookie writes happen only in proxy, Server Actions, and Route Handlers (`.../04-functions/cookies.md`).
- **Next.js auth guide: proxy is an optimistic check only** — pages must re-verify the session themselves; do NOT gate in layouts (`.../02-guides/authentication.md`).
- **PKCE callback pattern**: `GET /auth/callback` reads `code` from `request.nextUrl.searchParams`, calls `exchangeCodeForSession(code)`, sanitizes the `next` param, and honors `x-forwarded-host` when redirecting in production (Supabase social-login docs).
- **`redirect()` throws `NEXT_REDIRECT`** — must be called outside `try/catch` (`.../04-functions/redirect.md`).
- **Standing constraint #3 (deploy-plan)**: Fluid Compute reuses instances — no per-user state in module scope; Supabase clients must be created per request.
- **No database work in this slice** — Supabase Auth manages `auth.users` internally; the first custom schema/migration belongs to S-05.

## What We're NOT Doing

- **No GitHub provider** — dropped as a product decision (2026-07-20); roadmap/PRD amended in Phase 3. Not "later" — removed from scope entirely; reinstating it would be a new product decision.
- No email+password, no magic link, no password recovery, no email templates.
- No custom tables, migrations, or RLS — nothing is persisted beyond what Supabase Auth manages internally.
- No browser-side Supabase client (`createBrowserClient`) — the whole flow is server-side (server actions + route handler); add it only when a future slice needs client-side auth state.
- No app shell / design system / navigation — the authenticated home is a deliberate placeholder for S-02.
- No i18n framework — Polish copy is written inline per PRD (Polish is the UI language for v1).
- No rate limiting — MERGE-GATE constraint #1 targets Realtime token minting (S-03), which this slice does not touch.
- No test framework introduction.
- No account deletion / profile editing.

## Implementation Approach

Server-side-only Supabase auth following the current official `@supabase/ssr` + Next 16 pattern: one server-client factory (`src/lib/supabase/server.ts`), session refresh + optimistic whole-app gate in `src/proxy.ts`, sign-in/sign-out as Server Actions, PKCE code exchange in a `GET /auth/callback` route handler, and a defense-in-depth user check in the page itself. Configuration flows outward: code first (verifiable degraded — gate works, sign-in fails gracefully), then Google/Supabase configuration (human gates), then preview verification and decision write-back. All changes land via one PR; merge is the production gate.

## Critical Implementation Details

**Proxy cookie discipline.** In `src/proxy.ts`, follow the documented Supabase pattern exactly: create the client, call `supabase.auth.getUser()` immediately (no code in between), and return the `supabaseResponse` object unmodified except via the documented clone recipe — otherwise browser and server cookie state desync and users get randomly logged out. The matcher must exclude `_next/static`, `_next/image`, `favicon.ico`, and image assets so the gate never blocks static resources.

**Server Component cookie writes.** The `setAll` implementation in the server-client factory must swallow the "called from Server Component" error (try/catch) — session refresh is the proxy's job; pages only read.

**Sign-in must run server-side.** `signInWithOAuth` is called in a Server Action with `options.redirectTo` pointing at `<origin>/auth/callback`; the PKCE code-verifier cookie is written by the action, and the action ends with `redirect(data.url)` — outside any try/catch. The origin must be derived from request headers (`x-forwarded-host`/`origin` via `await headers()`), never hardcoded, because preview URLs vary per deployment.

**Callback redirect safety.** `/auth/callback` must sanitize the `next` query param (accept only values starting with `/` — open-redirect guard) and prefer `x-forwarded-host` over `origin` in production per the Supabase reference implementation.

**Local key naming.** The code reads `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If `npx supabase start` (CLI 2.109) emits only the legacy anon key for the local stack, map that value to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` — the variable name is our contract, the value is interchangeable.

**Preview URLs sit behind Vercel Deployment Protection.** Anonymous 401 on the preview is correct behavior; manual verification requires a browser logged into Vercel (or `vercel curl`). The Supabase redirect allowlist needs the project-scoped preview wildcard `https://english-talk-*-gumis1153s-projects.vercel.app/**` so OAuth can return to previews — never the global `https://*.vercel.app/**`, which would trust every deployment on Vercel's shared domain.

## Phase 1: Supabase Wiring + Auth Gate (code)

### Overview

All application code: dependencies, client factory, proxy gate, login page, callback route, server actions, authenticated home. Fully verifiable in a degraded mode — the gate redirects anonymous users, and a sign-in attempt fails gracefully with an inline error (Google provider not yet enabled — expected until Phase 2).

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add the Supabase runtime libraries used by every other change in this phase.

**Contract**: `@supabase/ssr` and `@supabase/supabase-js` appear in `dependencies` (latest stable); lockfile updated via `npm install`.

#### 2. Server client factory + user helper

**File**: `src/lib/supabase/server.ts`

**Intent**: Single factory for per-request Supabase server clients (Fluid Compute constraint: no module-scope client), plus a `requireUser()` helper pages use as the real (non-optimistic) auth check.

**Contract**: exports `createClient(): Promise<SupabaseClient>` — `createServerClient` from `@supabase/ssr` wired to `await cookies()` with the `getAll`/`setAll` contract (`setAll` swallows Server-Component write errors); reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Exports `requireUser(): Promise<User>` — calls `supabase.auth.getUser()`, `redirect('/login')` when null. Module marked `import 'server-only'`.

#### 3. Proxy: session refresh + whole-app gate

**File**: `src/proxy.ts`

**Intent**: Refresh the Supabase session on every request and optimistically gate the whole app: unauthenticated → `/login` (except `/login` and `/auth/*`); authenticated visiting `/login` → `/`.

**Contract**: exports `proxy(request: NextRequest)` and `config.matcher` excluding `_next/static`, `_next/image`, `favicon.ico`, and image extensions. Follows the documented Supabase proxy pattern verbatim (see Critical Implementation Details); the gate decision is based on the `getUser()` result already fetched for the refresh.

#### 4. Login page

**File**: `src/app/login/page.tsx`

**Intent**: The only public page: product name, one "Zaloguj się przez Google" button (form invoking the sign-in Server Action), and an inline error block when `searchParams` carries `error` (Polish copy, e.g. denied consent or failed code exchange).

**Contract**: async Server Component; `searchParams` is a `Promise` (Next 16) — awaited. Error messages map a small known set of error codes to Polish strings with a generic fallback. Tailwind styling consistent with `globals.css` tokens; no `'use client'`.

#### 5. Auth server actions

**File**: `src/app/auth/actions.ts`

**Intent**: `signInWithGoogle()` — starts the PKCE flow with `redirectTo = <request origin>/auth/callback` (origin from `await headers()`); `signOut()` — ends the session and lands on `/login`.

**Contract**: `'use server'` module; both actions create the client via the Phase-1 factory; `redirect()` calls sit outside try/catch. `signInWithGoogle` redirects to `data.url`; on `signInWithOAuth` error it redirects to `/login?error=oauth`.

#### 6. OAuth callback route

**File**: `src/app/auth/callback/route.ts`

**Intent**: Complete the PKCE flow: exchange `code` for a session, then redirect into the app; on any failure redirect to `/login?error=...` (inline-error decision).

**Contract**: `GET(request: NextRequest)`; reads `code` and `next` from `request.nextUrl.searchParams`; sanitizes `next` (must start with `/`); on success redirects honoring `x-forwarded-host` in production per the Supabase reference; on missing code or exchange error redirects to `/login?error=auth_callback`.

#### 7. Authenticated home

**File**: `src/app/page.tsx`

**Intent**: Replace the create-next-app default with the minimal authenticated home: signed-in identity (email + avatar from `user_metadata`), a sign-out button (form → `signOut` action), and a visually distinct placeholder block where "rozpocznij sesję" (S-02) will mount.

**Contract**: async Server Component calling `requireUser()` first (defense in depth beyond the proxy). Avatar falls back gracefully when `user_metadata.avatar_url` is absent. Polish copy.

#### 8. App metadata

**File**: `src/app/layout.tsx`

**Intent**: Replace the scaffold `metadata` ("Create Next App") with the product name so the login page doesn't ship with placeholder branding.

**Contract**: `metadata.title` = "english-talk"; description one Polish sentence. No structural layout changes.

#### 9. Env documentation

**File**: `.env.example`

**Intent**: Promote the two variables the runtime now requires from commented placeholders to active documented names, with a note on mapping local-stack values.

**Contract**: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` listed as required (names only, no values — standing constraint #9); comment notes local-stack mapping (see Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build (incl. typecheck) passes: `npm run build`
- New files exist: `src/proxy.ts`, `src/lib/supabase/server.ts`, `src/app/login/page.tsx`, `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`

#### Manual Verification:

- With the local stack running (`npx supabase start`) and `.env.local` pointing at it: anonymous visit to `/` redirects to `/login`; `/login` renders the Google button; static assets/styles load (matcher not over-blocking)
- Clicking the Google button fails gracefully (provider not yet enabled) and lands back on `/login` with the inline Polish error — no crash, no blank page

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2. Checkbox state lives in `## Progress`.

---

## Phase 2: Google OAuth Configuration (human-in-the-loop)

### Overview

Make the sign-in actually work: create the Google OAuth client (human), enable the provider on the remote Supabase project and set the redirect allowlist (human), and wire the local stack (`config.toml` + `.env.local` secrets). Ends with the full loop verified locally. The agent prepares files and precise instructions; the human executes console steps (registered human gates).

### Changes Required:

#### 1. Local stack provider config

**File**: `supabase/config.toml`

**Intent**: Enable Google OAuth on the local Supabase stack so the dev loop works without touching the remote project.

**Contract**: new `[auth.external.google]` section: `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` — matching the file's existing `env()` substitution convention. `site_url` stays `http://127.0.0.1:3000`; `additional_redirect_urls` extended to include `http://127.0.0.1:3000/**` and `http://localhost:3000/**` — otherwise a tester browsing `localhost` gets a silent fallback to `site_url` (dropped `/auth/callback` path) plus a PKCE-verifier cookie stranded on the wrong origin.

#### 2. Env documentation (local secrets)

**File**: `.env.example`

**Intent**: Document the two local-stack secret names so a future clone knows what `.env.local` needs (names only).

**Contract**: adds `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` with a comment that they feed `supabase/config.toml` env substitution for the local stack only.

#### 3. Human runbook (executed, not committed)

**File**: — (console steps; agent provides exact instructions, human executes)

**Intent**: The registered human gates of this slice.

**Contract**:
- **Pre-check (Supabase Dashboard)**: confirm the remote project is active — free-tier projects pause after ~1 week of inactivity (deploy-plan gotcha) and a paused project makes OAuth failures imitate misconfiguration; resume it if paused.
- **Google Cloud Console**: OAuth consent screen (external, app name english-talk) + Web application OAuth client. Authorized redirect URIs: `https://<remote-project-ref>.supabase.co/auth/v1/callback` AND `http://127.0.0.1:54321/auth/v1/callback` (one client covers remote + local).
- **Supabase Dashboard** (via Vercel → Storage → Open in Supabase): Authentication → Providers → Google: enable, paste client ID/secret. Authentication → URL Configuration: Site URL `https://english-talk-black.vercel.app`; additional redirect URLs: `https://english-talk-black.vercel.app/**` and the project-scoped preview wildcard `https://english-talk-*-gumis1153s-projects.vercel.app/**` (NOT the global `https://*.vercel.app/**` — that would allowlist every Vercel deployment as a redirect target).
- **Local**: append the two `SUPABASE_AUTH_EXTERNAL_GOOGLE_*` values to `.env.local` (gitignored), restart the stack (`npx supabase stop && npx supabase start`).

### Success Criteria:

#### Automated Verification:

- Local stack boots cleanly with the new config: `npx supabase stop && npx supabase start` (config.toml parses, Google provider listed as enabled in startup output/Studio)
- Lint still passes: `npm run lint`

#### Manual Verification:

- Full local loop: `/login` → Google consent → lands on `/` showing the Google account's email/avatar
- Sign-out returns to `/login`; visiting `/` afterwards redirects to `/login`
- Signed-in user visiting `/login` is redirected to `/`
- Error path: cancel/deny on the Google consent screen → back on `/login` with the inline Polish error

**Implementation Note**: Pause for manual confirmation (this phase IS mostly the human gate) before Phase 3.

---

## Phase 3: Preview Verification + Decision Write-back

### Overview

Ship via PR, verify the loop on the preview URL, and record the Google-only decision in the foundation docs (explicitly authorized by this plan's questioning round — the "do not edit foundation" rule is lifted for exactly these edits).

### Changes Required:

#### 1. Roadmap amendment

**File**: `context/foundation/roadmap.md`

**Intent**: Record the product decision: S-01 is Google-only; GitHub is dropped (not deferred).

**Contract**: S-01 outcome text and the At-a-glance row change "OAuth Google/GitHub" → "OAuth Google"; S-01 Unknown marked resolved (decision 2026-07-20); Open Roadmap Question 1 marked resolved with the same note; Backlog Handoff row wording aligned. `updated:` frontmatter bumped.

#### 2. PRD open-question closure

**File**: `context/foundation/prd.md`

**Intent**: Close Open Question 1 in place (the PRD stays v1 — this is recording a resolution, not re-scoping).

**Contract**: Open Questions item 1 gets a resolution note: "Rozstrzygnięte 2026-07-20: OAuth-only, wyłącznie Google (GitHub odrzucony — decyzja produktowa przy planowaniu S-01)." No FR text changes (FR-001/002 are method-agnostic).

#### 3. Pull request + preview verification

**File**: — (process)

**Intent**: Land everything through the standing delivery path and prove the loop in a deployed environment before merge.

**Contract**: one PR against `master` (branch e.g. `feat/minimal-oauth-login`); Vercel preview build green; before verifying, confirm the Supabase project isn't paused (free-tier idle pause — see Phase 2 pre-check); OAuth loop verified on the preview URL from a Vercel-logged-in browser (Deployment Protection: anonymous 401 is expected, not a failure). Merge = production deploy; a post-merge smoke check of the loop on `https://english-talk-black.vercel.app` closes the slice.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- PR exists and the Vercel preview deployment reports Ready (`gh pr checks` / Vercel dashboard)

#### Manual Verification:

- Full sign-in/sign-out loop works on the PR preview URL (logged-in browser)
- Anonymous visit to the preview root redirects to `/login` (after passing Deployment Protection)
- Roadmap + PRD edits reviewed in the PR diff and match the recorded decision
- Post-merge: loop works on production

---

## Testing Strategy

### Unit Tests:

- None — no test framework is configured (AGENTS.md); this slice does not introduce one. The auth surface is thin glue around `@supabase/ssr`; manual + build verification is proportionate.

### Integration Tests:

- None automated. The PR preview deployment acts as the integration environment.

### Manual Testing Steps:

1. Local stack up, `.env.local` populated; browse `http://127.0.0.1:3000` (canonical local host — matches `site_url`) → anonymous `/` redirects to `/login`.
2. Sign in with a real Google account → `/` shows that account's email/avatar.
3. Refresh `/` → still signed in (session refresh through proxy works).
4. Sign out → back on `/login`; `/` redirects to `/login` again.
5. While signed in, open `/login` directly → redirected to `/`.
6. Deny the Google consent → `/login` shows the inline Polish error.
7. Repeat steps 1–4 on the PR preview URL in a Vercel-logged-in browser.

## Performance Considerations

The proxy runs `getUser()` (a network call to Supabase Auth) on every matched request — the documented pattern, acceptable at this scale (fra1 ↔ eu-central-1 colocation, per deploy-plan). Revisit with `getClaims()`/JWT-local verification only if latency shows up in practice; not in this slice.

## Migration Notes

No data migrations — Supabase Auth owns `auth.users` internally. Forward-only constraint (#6) untouched. Rollback = revert the PR (no persisted state to unwind); known-good production rollback target remains `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w`.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- Deploy constraints & human gates: `context/deployment/deploy-plan.md` (standing constraints #3, #9, #11; runbook step 5)
- Next 16 proxy: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- Next 16 auth guide: `node_modules/next/dist/docs/01-app/02-guides/authentication.md`
- Supabase Next.js server-side auth pattern: https://supabase.com/docs/guides/ai-tools/ai-prompts/nextjs-supabase-auth
- Supabase OAuth callback reference: https://supabase.com/docs/guides/auth/social-login/auth-github (pattern identical for Google)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Supabase Wiring + Auth Gate (code)

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Production build (incl. typecheck) passes: `npm run build`
- [x] 1.3 New files exist: `src/proxy.ts`, `src/lib/supabase/server.ts`, `src/app/login/page.tsx`, `src/app/auth/actions.ts`, `src/app/auth/callback/route.ts`

#### Manual

- [x] 1.4 Anonymous visit redirects to `/login`; login page renders; static assets unblocked (local stack)
- [ ] 1.5 Sign-in attempt fails gracefully with inline Polish error (provider not yet enabled)

### Phase 2: Google OAuth Configuration (human-in-the-loop)

#### Automated

- [ ] 2.1 Local stack boots cleanly with `[auth.external.google]` enabled: `npx supabase stop && npx supabase start`
- [ ] 2.2 Lint still passes: `npm run lint`

#### Manual

- [ ] 2.3 Full local loop: Google consent → `/` shows email/avatar
- [ ] 2.4 Sign-out returns to `/login`; `/` redirects to `/login` afterwards
- [ ] 2.5 Signed-in user visiting `/login` is redirected to `/`
- [ ] 2.6 Denied consent → `/login` with inline Polish error

### Phase 3: Preview Verification + Decision Write-back

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 PR exists; Vercel preview deployment Ready

#### Manual

- [ ] 3.4 Full loop works on the PR preview URL (Vercel-logged-in browser)
- [ ] 3.5 Anonymous preview root redirects to `/login`
- [ ] 3.6 Roadmap + PRD amendments reviewed in the PR diff
- [ ] 3.7 Post-merge: loop works on production
