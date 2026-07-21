# Session Topic Proposal (S-02) Implementation Plan

## Overview

Roadmap slice S-02: a logged-in user can start a session — they see a randomly proposed conversation topic drawn from a predefined list (FR-003) and can reject it to draw another (FR-004). Per the product decision made during planning, `/` becomes the session screen itself: an animated orb sits in the background (idle-only for now; speaking/listening states arrive with S-03), and the topic proposal is an inline card layered over the orb. Accepting a topic hides the card and shows the orb with the accepted topic plus a "conversation comes in the next build step" stub — the exact mount point S-03 will replace with the real voice conversation.

## Current State Analysis

- `/` (`src/app/page.tsx`) is a Server Component showing a header (app name, user identity via `requireUser()`, sign-out form) and a dashed-border placeholder card "Rozpocznij sesję" (`page.tsx:66-76`) — left there by S-01 explicitly for this slice.
- The whole app is behind the auth gate in `src/proxy.ts`; any UI on `/` is automatically login-protected. No per-route work needed.
- **Zero `'use client'` in the codebase** — everything is Server Components, Server Actions, and route handlers. This slice introduces the first client component (the reject-and-redraw interaction).
- **No database schema exists and none is wanted here** — the roadmap states S-05 introduces the first migration. Topics are a code constant.
- UI copy is Polish (`lang="pl"` in `layout.tsx:28`); styling is Tailwind v4 utility-only with theme tokens in `src/app/globals.css` and dark mode via `prefers-color-scheme`.
- No test framework is configured; verification is `npm run lint`, `npm run build`, and manual checks (local + PR preview).

## Desired End State

After login the user lands on `/` and sees: the header (unchanged), an animated orb in the background, and a topic proposal card covering the orb — topic title and a 1–2 sentence scenario description in English, with Polish action buttons: accept and redraw. Redraw replaces the topic with a random one that is never the currently displayed topic. Accept hides the card: the orb comes to the foreground with the accepted topic title and a Polish stub note that the voice conversation arrives in the next build step, plus a button returning to topic selection. Verified locally, on the PR preview, and in production after merge.

### Key Discoveries:

- `src/app/page.tsx:66-76` — the placeholder card to replace; header at `page.tsx:30-64` stays as is.
- `src/lib/supabase/server.ts:34-51` — `requireUser()` already guards the page; no auth work in this slice.
- Established button style to reuse: `rounded-full border border-solid border-black/[.08] ... hover:bg-black/[.04] dark:border-white/[.145]` (see `src/app/page.tsx:55-62`, `src/app/login/page.tsx:44-48`).
- Roadmap: "pierwszy plasterek, który cokolwiek trwale zapisuje" is S-05 → topics live in code, no persistence of accepted topic (S-03 will consume it in-memory/in-state).
- PRD Open Q3 (topic list) is resolved by this plan: 10 topics — the 5 PRD candidates + 5 additions covering the persona's pain contexts (team call, recruitment, client, conference, networking). Phase 2 writes this decision back.
- Lesson (`context/foundation/lessons.md`): never commit to master — branch + PR; all live communication with the user in Polish.

## What We're NOT Doing

- No voice conversation, no microphone, no OpenAI — that's S-03. The accepted-topic state is a visual stub.
- No orb speaking/listening states — only idle animation. S-03 extends the orb.
- No database table for topics, no migration, no persistence of the accepted topic or session record (S-05 owns the first schema).
- No skip limit (Open Q2 resolved: unlimited in v1; limit is a v2 candidate).
- No topic categories, difficulty levels, or user-picked topics — proposal + redraw only (PRD Socrates resolution on FR-003).
- No i18n framework — Polish UI copy inline, English topic content inline, matching S-01's approach.
- No test framework introduction.

## Implementation Approach

Server-first with a minimal client island. The page (Server Component) draws the initial topic server-side and passes it to a `SessionStart` client component — this avoids hydration mismatch (server and client would disagree on a randomly chosen topic) and keeps the first paint complete with no loading state (NFR ~500 ms signal: nothing here is async, so no spinner is needed anywhere). All subsequent interaction (redraw, accept, back to selection) is pure client state — instant, no server round-trips. The orb is a presentational, CSS-only-animated component; it needs no interactivity of its own.

## Critical Implementation Details

- **Hydration & randomness**: the initial topic MUST be drawn in the Server Component (`page.tsx`) and passed as a prop. Drawing it inside the client component during render would cause a server/client hydration mismatch. `/` is already dynamically rendered (auth cookies via `requireUser()`), so `Math.random()` server-side per request is safe.
- **Client boundary**: `SessionStart` is the app's first `'use client'` component. Keep the boundary tight — the page header, `requireUser()`, and the sign-out Server Action stay in the Server Component; only the orb + card area is client-rendered. Importing the presentational `Orb` into `SessionStart` makes it part of the client bundle, which is fine (it has no server dependencies).
- **Reduced motion**: the orb's continuous animation must respect `prefers-reduced-motion` (static or near-static fallback) — cheap to do in CSS and avoids motion discomfort on an always-on background element.

## Phase 1: Session screen — topics, orb, proposal flow

### Overview

Everything user-visible: the topics module, the orb, and the interactive proposal/accepted flow replacing the placeholder card on `/`.

### Changes Required:

#### 1. Topics module

**File**: `src/lib/topics.ts` (new)

**Intent**: Single source of truth for the predefined topic list (FR-003) and the redraw rule (FR-004). Resolves PRD Open Q3 with 10 topics.

**Contract**: Exports `type Topic = { id: string; title: string; description: string }` (title + description in English), `TOPICS: readonly Topic[]` with exactly these 10 entries, and a pure helper `drawTopic(excludeId?: string): Topic` that returns a uniformly random topic, never the one matching `excludeId`:

| id | title | description (scenario, EN) |
| --- | --- | --- |
| daily-standup | Daily standup | Tell your team what you did yesterday, what you're working on today, and what's blocking you. |
| job-interview | Job interview | You're interviewing for a developer role. Talk about your experience, your strengths, and why you want this job. |
| code-review | Code review discussion | Discuss a pull request with a colleague: explain your feedback and defend your implementation choices. |
| ordering-coffee | Ordering coffee | You're at a coffee shop abroad. Order your drink, ask a few questions, and handle small talk with the barista. |
| explaining-a-bug | Explaining a bug | Walk a colleague through a bug you found: what happens, how to reproduce it, and what you think causes it. |
| sprint-planning | Sprint planning | Discuss upcoming tasks with your team: estimate effort, raise concerns, and agree on priorities. |
| explaining-your-project | Explaining your project | A new teammate just joined. Describe what your project does, how it's built, and where they should start. |
| client-update | Client progress update | Give a client a status update: what's done, what's delayed, and what happens next. |
| conference-networking | Conference networking | You meet another developer at a tech conference. Introduce yourself and chat about what you both work on. |
| asking-for-help | Asking for help | You're stuck on a task. Ask a colleague for help: describe the problem and what you've already tried. |

#### 2. Orb component

**File**: `src/components/orb.tsx` (new)

**Intent**: The visual anchor of the session screen — an animated gradient orb rendered behind (proposal state) or in front of (accepted state) the card. Idle animation only; built so S-03 can extend it with speaking/listening states without restructuring.

**Contract**: Presentational component, no `'use client'` of its own, no props required in this slice (S-03 will add a state prop when real states exist). Animation is CSS-only — keyframes live in `globals.css`. Must respect `prefers-reduced-motion`.

#### 3. Orb animation styles

**File**: `src/app/globals.css`

**Intent**: Keyframes for the orb's idle animation (slow pulse/drift of a gradient blob) plus a `prefers-reduced-motion` guard, following the existing convention that global CSS lives here.

**Contract**: Adds keyframes + orb-specific classes; touches nothing existing. Works in both light and dark scheme (the file already themes via `prefers-color-scheme`).

#### 4. Session start client component

**File**: `src/components/session-start.tsx` (new)

**Intent**: The interactive core of the slice — owns the two-phase UI state and the redraw logic. First `'use client'` component in the app.

**Contract**: `'use client'`; props: `{ initialTopic: Topic }`. Internal state: current topic + phase (`'proposal' | 'accepted'`). Renders:
- **Proposal phase**: orb in the background (dimmed/blurred behind), card on top with the topic `title` + `description` (English) and two Polish buttons — accept (e.g. „Rozpocznij rozmowę") and redraw (e.g. „Inny temat"). Redraw calls `drawTopic(current.id)` — instant, client-side.
- **Accepted phase**: card hidden; orb in the foreground with the accepted topic title and a Polish stub note that the voice conversation arrives in the next build step, plus a button (e.g. „Zmień temat") returning to the proposal phase with the current topic still shown.
Button styling reuses the established rounded-full pattern from `page.tsx:55-62`. The orb is ONE persistent element across both phases — reposition/deblur it with class changes only; rendering it as separate subtrees per phase would remount it and restart the CSS animation with a visible jump.

#### 5. Wire into the home page

**File**: `src/app/page.tsx`

**Intent**: Replace the dashed placeholder card (`page.tsx:66-76`) with the session screen; keep the header (identity + sign-out) untouched.

**Contract**: The Server Component draws the initial topic (`drawTopic()`) and renders `<SessionStart initialTopic={...} />` in the main area. `<main>` becomes the orb's positioning context: add `relative` + `overflow-hidden` (no positioned ancestor exists anywhere today, and body is `min-h-full` — an unconstrained absolute orb near the edges creates scrollbars). Keep `flex-1` on `<main>` — it's what makes the area fill the viewport under the header.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Production build passes (includes typecheck): `npm run build`

#### Manual Verification:

- After login, `/` shows the orb with the topic proposal card on top: English title + scenario description, Polish accept/redraw buttons; header and sign-out still work.
- Redraw replaces the topic instantly and never shows the same topic twice in a row (spot-check several redraws).
- Accept hides the card: orb in the foreground, accepted topic title + Polish stub note visible, and the return button brings back the proposal card.
- Orb animates smoothly in light and dark scheme; with `prefers-reduced-motion` enabled the animation is static/minimal.
- Screen is usable on a mobile viewport (mobile web is in scope per PRD).

**Implementation Note**: After this phase and green automated checks, pause for manual confirmation before Phase 2. Work happens on a branch — direct commits to `master` are blocked (lessons.md).

---

## Phase 2: Preview verification + decision write-back

### Overview

Ship through the standard PR pipeline and record the resolved decisions (topic list — PRD/roadmap Open Q3) in the foundation docs, mirroring how S-01 closed its open question.

### Changes Required:

#### 1. Resolve Open Q3 in the PRD

**File**: `context/foundation/prd.md`

**Intent**: Mark Open Question 3 (predefined topic list) as resolved: 10 topics (5 PRD candidates + 5 additions), final list lives in `src/lib/topics.ts`.

**Contract**: Amend `## Open Questions` item 3 with a resolution line dated to the merge, following the pattern used for Open Q1 (auth method).

#### 2. Resolve Open Q3 in the roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Mirror the resolution: roadmap `## Open Roadmap Questions` item 3 and the S-02 `Unknowns` bullet (working list → final list) both point at the resolved decision.

**Contract**: Edit-in-place annotations only; S-02 `Status` stays `ready` (it flips to `done` at `/10x-archive` time).

#### 3. PR + preview + production

**Intent**: Branch → PR against `master` → Vercel preview verification → merge → production check. ESLint runs locally (not in CI).

**Contract**: PR contains Phase 1 code + Phase 2 doc amendments. Preview URL sits behind Deployment Protection — verify with a logged-in browser (anonymous 401 is expected).

### Success Criteria:

#### Automated Verification:

- Lint clean before push: `npm run lint`
- Vercel preview build (with typecheck) is green on the PR

#### Manual Verification:

- Full flow (propose → redraw → accept → back) verified on the PR preview URL in a logged-in browser
- Flow spot-checked in a second browser engine (e.g. Safari or Firefox alongside Chrome) — PRD NFR cross-browser
- PRD and roadmap amendments render correctly and record the 10-topic decision
- After merge: production (`https://english-talk-black.vercel.app`) shows the session screen

---

## Testing Strategy

### Unit Tests:

- None — no test framework is configured (introducing one is out of scope; Module 3 territory). `drawTopic` is written as a pure function so it's trivially testable when a framework lands.

### Manual Testing Steps:

1. Sign in with Google locally (`npm run dev` + local Supabase stack) — `/` shows orb + proposal card.
2. Click redraw ~10 times — topic always changes, UI never flickers or shows a loading state.
3. Accept a topic — card hides, orb + accepted topic + stub note appear; return button restores the card with the same topic.
4. Toggle OS dark mode and `prefers-reduced-motion` — orb renders correctly in both schemes; animation stills under reduced motion.
5. Repeat the core flow on a mobile-sized viewport and on the PR preview URL.

## Performance Considerations

Everything is synchronous and client-local after first paint — no spinners needed (NFR ~500 ms signal is satisfied by never being slow). The orb animation should use transform/opacity-based CSS (GPU-friendly), not layout-affecting properties.

## Migration Notes

None — no data, no schema, no config changes. Rollback = revert the PR.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- Requirements: `context/foundation/prd.md` FR-003, FR-004, US-01, Open Q3
- Placeholder being replaced: `src/app/page.tsx:66-76`
- Auth/page patterns from S-01: `context/archive/2026-07-20-minimal-oauth-login/plan-brief.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Session screen — topics, orb, proposal flow

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 785a915
- [x] 1.2 Production build passes (includes typecheck): `npm run build` — 785a915

#### Manual

- [x] 1.3 `/` shows orb + proposal card (EN topic, PL buttons); header/sign-out intact — 785a915
- [x] 1.4 Redraw is instant and never repeats the current topic — 785a915
- [x] 1.5 Accept → orb foreground + accepted topic + stub note; return button restores card — 785a915
- [x] 1.6 Orb OK in light/dark; static under `prefers-reduced-motion` — 785a915
- [x] 1.7 Usable on mobile viewport — 785a915

### Phase 2: Preview verification + decision write-back

#### Automated

- [x] 2.1 Lint clean before push: `npm run lint`
- [ ] 2.2 Vercel preview build green on the PR

#### Manual

- [ ] 2.3 Full flow verified on PR preview (logged-in browser)
- [ ] 2.4 Flow spot-checked in a second browser engine
- [ ] 2.5 PRD + roadmap record the 10-topic resolution of Open Q3
- [ ] 2.6 Production shows the session screen after merge
