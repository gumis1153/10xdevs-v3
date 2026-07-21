# Minimal OAuth Login (Google via Supabase Auth) — Plan Brief

> Full plan: `context/changes/minimal-oauth-login/plan.md`

## What & Why

Put english-talk behind a login gate: sign-up and sign-in via Google OAuth only, using Supabase Auth server-side (PKCE). This is roadmap slice S-01 — it closes PRD Open Question 1 (auth method) and establishes the user identity that S-05 (session archive) will later depend on, while running parallel to the voice track.

## Starting Point

A bare create-next-app scaffold (Next.js 16, no product code) with Supabase fully provisioned but unused: 16 env vars on Vercel, local stack configured, zero auth code, no `@supabase/*` packages, no `proxy.ts`. Delivery pipeline (PR → preview, merge → production) is live as of 2026-07-20.

## Desired End State

Any anonymous visit redirects to `/login` (Polish UI, one Google button). After Google consent the user lands on a minimal authenticated home showing their email/avatar, a sign-out button, and a placeholder where "start session" (S-02) will mount. Failed/denied OAuth returns to `/login` with an inline, human-readable error. Verified on the local Supabase stack, the PR preview, and production after merge.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Auth method (PRD Open Q1) | OAuth-only, **Google as sole provider** | Zero password/email machinery; Google covers nearly all users. |
| GitHub provider | **Dropped entirely** (not deferred) | Product decision 2026-07-20; roadmap/PRD amended in Phase 3 — reinstating would be a new decision. |
| Gate scope | Whole app gated (only `/login` + `/auth/*` public) | Matches the roadmap outcome verbatim; simplest rule, nothing to reclassify as slices land. |
| Post-login UX | Minimal authenticated home (identity + sign-out + S-02 placeholder) | Proves the loop end-to-end without designing product UI prematurely. |
| Error UX | Redirect to `/login?error=...` with inline Polish message | One page owns auth UX; user retries in place (no dead-end error page). |
| Verification envs | Local stack + PR preview before merge | One Google client covers both (multiple redirect URIs); establishes the auth dev-loop for future slices. |
| Architecture | Server-side only: `@supabase/ssr`, `src/proxy.ts` gate, Server Actions, callback route handler | Current official Supabase + Next 16 pattern; no browser client needed in this slice. |

## Scope

**In scope:**
- `@supabase/ssr` + `@supabase/supabase-js`, per-request server client factory + `requireUser()`
- `src/proxy.ts` (Next 16 convention) — session refresh + whole-app gate
- `/login` page, sign-in/sign-out Server Actions, `GET /auth/callback` (PKCE exchange)
- Minimal authenticated home replacing the scaffold page; real app metadata
- Google Cloud + Supabase Dashboard configuration (human gates) for remote and local stack
- Roadmap/PRD amendment recording the Google-only decision

**Out of scope:**
- GitHub, email+password, magic link; custom tables/migrations/RLS; browser Supabase client; app shell/design system; i18n framework; test framework; rate limiting (belongs to S-03's MERGE-GATE)

## Architecture / Approach

Server-side PKCE flow, per the current official pattern: proxy refreshes the session cookie on every request and optimistically gates routes; pages re-verify via `requireUser()` (defense in depth); a Server Action starts `signInWithOAuth` with `redirectTo` derived from request headers (preview URLs vary); the callback route exchanges the code for a session and redirects with an open-redirect guard. Supabase clients are created per request (Fluid Compute constraint #3). No database schema — Supabase Auth owns `auth.users`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Supabase wiring + auth gate (code) | Full auth code, verifiable degraded (gate works; sign-in fails gracefully) | Proxy cookie desync if the documented pattern isn't followed exactly |
| 2. Google OAuth configuration (human) | Working local sign-in/sign-out loop | Redirect-URI/allowlist typos; human console steps mid-slice |
| 3. Preview verification + write-back | Verified PR preview, amended roadmap/PRD, merge → production | Deployment Protection confusing verification (anonymous 401 is expected) |

**Prerequisites:** Docker running (local stack); access to Google Cloud Console and the Supabase Dashboard (human); Vercel-logged-in browser for preview checks.
**Estimated effort:** ~2–3 sessions across 3 phases (Phase 2 is mostly human console work).

## Open Risks & Assumptions

- Assumes local Supabase CLI (2.109) key output maps cleanly to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (legacy anon value is an acceptable stand-in locally).
- Google consent screen for an external app is unverified-publisher by default — fine for v1 testing, but users see the "unverified app" interstitial until verification (accepted).
- Proxy `getUser()` adds a network round-trip per request — acceptable at current scale (fra1 ↔ eu-central-1); revisit only if measured.

## Success Criteria (Summary)

- An anonymous user cannot reach any app route; they land on `/login` and can complete Google sign-in end-to-end (local, preview, production).
- The signed-in user sees who they are and can sign out; denied/failed OAuth explains itself inline in Polish.
- Roadmap S-01 and PRD Open Q1 record the Google-only decision in the merged PR.
