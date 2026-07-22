# Session Topic Proposal (S-02) — Plan Brief

> Full plan: `context/changes/session-topic-proposal/plan.md`

## What & Why

Roadmap slice S-02: after login the user can start a session — they see a randomly proposed conversation topic (FR-003) and can reject it to draw another (FR-004). This is the first step of the must-have path to the north star (S-03 voice conversation), deliberately cut from S-03 so the topic-list decision never blocks the voice track. Per a product decision made during planning, `/` becomes the session screen itself, anchored by an animated orb that S-03 will later drive with speaking/listening states.

## Starting Point

S-01 left a dashed placeholder card „Rozpocznij sesję" on the authenticated home (`src/app/page.tsx:66-76`) explicitly for this slice. The codebase is server-only (zero `'use client'`), has no database schema (S-05 owns the first migration), Polish UI copy, and Tailwind v4 utility styling. The whole app is already behind the auth gate.

## Desired End State

A logged-in user on `/` sees an animated orb with a topic card layered over it: English title + 1–2 sentence scenario description, Polish accept/redraw buttons. Redraw is instant and never repeats the current topic. Accept hides the card — the orb comes forward with the accepted topic and a stub note that the voice conversation arrives in the next build step (S-03's mount point), plus a way back to topic selection. Verified locally, on the PR preview, and in production.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Screen layout | `/` is the session screen: orb in background, topic card inline over it | User's product vision — conversation will live on the home page; orb becomes the voice-state anchor in S-03. |
| Accept behavior (S-03 absent) | Stub state: card hides, orb + accepted topic + "conversation comes next" note | Closes the full S-02 flow end-to-end and gives S-03 a clean mount point — same pattern S-01 used for S-02. |
| Redraw mechanics | Uniform random excluding the currently shown topic | One-line constraint that kills the "I skipped and got the same topic" broken feel. |
| Topic list (PRD Open Q3) | 10 topics: 5 PRD candidates + 5 additions (sprint planning, explaining your project, client update, conference networking, asking for help) | Covers the persona's pain contexts (team call, recruitment, client, conference, networking) with rarer repeats. |
| Topic presentation | English title + short English scenario description | Sets the scene for an anxious persona and seeds S-03's conversation prompt. |
| Topic storage | Hardcoded constant in `src/lib/topics.ts` — no DB | Roadmap explicitly reserves the first schema/migration for S-05. |
| Skip limit | None in v1 | Already resolved upstream (PRD Open Q2 → v2 candidate). |
| Rendering strategy | Initial topic drawn server-side, passed to a client island | Avoids hydration mismatch from client-side randomness; everything after first paint is instant client state (no spinners needed). |

## Scope

**In scope:**
- `src/lib/topics.ts` — Topic type, 10-topic list, `drawTopic(excludeId?)` helper
- `src/components/orb.tsx` — CSS-animated idle orb (reduced-motion aware), extensible in S-03
- `src/components/session-start.tsx` — first `'use client'` component: proposal/accepted states, redraw
- `src/app/page.tsx` — replace placeholder with the session screen; header untouched
- PRD + roadmap write-back resolving Open Q3 (topic list)

**Out of scope:**
- Voice, microphone, OpenAI, orb speaking/listening states (S-03); any DB schema or persistence (S-05); skip limits (v2); topic categories/difficulty/user-picked topics; i18n framework; test framework.

## Architecture / Approach

Server-first with one tight client island: the Server Component page draws the initial topic and renders `SessionStart`, which owns all interaction as local state (redraw via pure `drawTopic`, accept toggles the phase). The orb is presentational, animated purely in CSS (`globals.css` keyframes, transform/opacity only). No API routes, no server actions added.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session screen | Topics module + orb + full propose→redraw→accept flow on `/` | Hydration mismatch if randomness leaks into client render; orb animation quality across schemes |
| 2. Verification + write-back | Green PR preview, verified flow, PRD/roadmap record the topic-list decision, merge → production | Deployment Protection confusing preview checks (anonymous 401 is expected) |

**Prerequisites:** working local auth loop from S-01 (local Supabase stack or preview); logged-in browser for preview verification.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- The orb's visual design is unspecified beyond "animated gradient orb" — first implementation is a taste call; expect an iteration round on its look.
- Assumes S-03 can consume the accepted topic from client state / component composition — nothing is persisted, which matches the roadmap but means a page refresh forgets the accepted topic (acceptable for v1).

## Success Criteria (Summary)

- A logged-in user can complete propose → redraw (never a repeat) → accept → see the accepted-topic stub, all instantly and in both color schemes.
- The slice outcome „użytkownik może rozpocząć sesję" is demonstrable on production after merge.
- PRD Open Q3 is closed with the final 10-topic list recorded in the merged PR.
