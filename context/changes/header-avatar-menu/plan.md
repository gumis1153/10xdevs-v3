# Header Avatar Menu Implementation Plan

## Overview

Unify the per-page headers into one shared, minimal header (logo + avatar) rendered once by a route-group layout, move `Wyloguj się` into a dropdown under the avatar, and relocate the archive entry point from the header to a link under the topic card on the start screen.

Roadmap slice S-08. Purely presentational/navigational — no schema, no API, no realtime changes.

## Current State Analysis

The header is duplicated three times and diverges on every route:

| Route | File | Header contents |
| --- | --- | --- |
| `/` | `src/app/page.tsx:22-74` | logo, avatar, `full_name`, `email`, `Archiwum` link, `Wyloguj się` form |
| `/archive` | `src/app/archive/page.tsx:57-65` | logo, `Nowa sesja` link |
| `/archive/[id]` | `src/app/archive/[id]/page.tsx:61-69` | logo, `← Archiwum` link |

All three share the same wrapper shape (`<div className="flex flex-1 flex-col font-sans">` + `<header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">`) and the same pill-button class string, copy-pasted.

Other constraints found:

- **No layout other than root.** `src/app/layout.tsx` only wires fonts and `<body className="min-h-full flex flex-col">`. There is no `/archive/layout.tsx`.
- **`/login` must not get the header** — it renders for anonymous visitors (`src/app/login/page.tsx`), and `src/proxy.ts:75-84` bounces authenticated users away from it.
- **No UI library.** `package.json` has no shadcn/ui and no Radix — Tailwind v4 only. The dropdown and its accessibility are hand-written.
- **Narrow client island is the established pattern.** `src/app/archive/delete-session-button.tsx` is `'use client'` for exactly the interactive fragment, with a Server Action bound via `.bind(null, id)`, while the rest of the page stays a Server Component.
- **`requireUser()` is a real network round trip.** `src/lib/supabase/server.ts:34-51` calls `supabase.auth.getUser()`, which validates the JWT against Supabase Auth. Three pages call it today (`page.tsx:9`, `archive/page.tsx:41`, `archive/[id]/page.tsx:35`). Adding a layout that also needs the user would double it per render.
- **The start screen's orb lives in a client component.** `src/components/session-start.tsx` owns `phase: 'proposal' | 'conversation'` and swaps between the topic card and `<VoiceConversation>`, which itself renders the post-session report. Anything whose visibility depends on the phase has to live inside that client tree.

## Desired End State

All three authenticated routes render one identical header: `english-talk` on the left (a link to `/`) and a 32 px avatar button on the right. Clicking the avatar opens a small dropdown whose only item is `Wyloguj się`; Escape or a click outside closes it and returns focus to the avatar. `/login` still has no header.

The start screen shows a discreet `Archiwum sesji` link under the topic card, visible only while a session has not started. The session-detail page carries its `← Archiwum` back-link above the session title in `<main>` instead of in the header.

Verify by walking `/` → avatar → `Wyloguj się` (lands on `/login`), then `/` → `Archiwum sesji` → a session → `← Archiwum`, with `npm run lint` and `npm run build` clean.

### Key Discoveries:

- Route groups do not affect URLs, and the "full page reload" caveat applies **only to multiple root layouts** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md:30`). We keep the single root layout, so moving `page.tsx` and `archive/` into `(app)/` changes no URL and costs no navigation behavior.
- The installed Next.js docs recommend exactly the memoization pattern we need for the duplicated user read: `export const getCurrentUser = cache(async () => ...)` (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:68-75`), and state its scope explicitly — "scoped to the current request only. Each request gets its own memoization scope with no sharing between requests" (`.../01-getting-started/06-fetching-data.md:724`).
- The avatar is deliberately a plain `<img>`, not `next/image`, to avoid configuring `remotePatterns` for a 32 px Google thumbnail (`src/app/page.tsx:29-31`). That decision carries over unchanged.
- `signOut` (`src/app/auth/actions.ts:41-50`) already redirects to `/login` and logs failures. It needs no change — only a new call site.
- `src/proxy.ts` is the outer session gate (fail-closed to `/login`, 401 JSON for `/api/*`); per-page `requireUser()` is defense-in-depth on top of it, and Supabase RLS is the third layer. This plan keeps all three.

## What We're NOT Doing

- Not adding the account name or e-mail to the dropdown body. The dropdown holds `Wyloguj się` only; the display name survives as the avatar button's accessible name (see Critical Implementation Details).
- Not adding an `Archiwum` link inside the dropdown — the archive gets exactly one entry point, under the orb.
- ~~Not keeping the `Nowa sesja` button on `/archive`. The logo links to `/`.~~ **Reversed during implementation (2026-07-26, user request):** the clickable logo turned out to be too weak an affordance for "back to start" from the archive list. `/archive` now carries a quiet `← Nowa sesja` text link at the top of `<main>`, mirroring the `← Archiwum` link on the session detail. The header itself stays logo + avatar on every route — the reversal restores the destination, not the header button, so the slice's core outcome is intact. Tracked as Progress row 2.9.
- Not showing the archive link during a conversation or on the post-session report screen.
- Not building a mobile-specific dropdown variant (bottom sheet, full-width) and not auditing the rest of the app for responsiveness.
- Not introducing a UI library, `role="menu"`/roving-focus ARIA machinery, or animation.
- Not touching `src/proxy.ts`, the Supabase schema, RLS, the realtime token route, or the report pipeline.
- Not adding a test framework. `package.json` has no `test` script and this change does not introduce one.

## Implementation Approach

Move the two authenticated route trees into a `(app)/` route group and let its `layout.tsx` render the header once. Split the header along the server/client seam: `AppHeader` stays a Server Component (it reads the user and renders logo + avatar markup), and only the dropdown — which needs `useState`, key handling, and outside-click detection — is a `'use client'` island, mirroring `delete-session-button.tsx`.

Because both the layout and the pages need the user, extract the raw read into a `cache()`-wrapped function and leave `requireUser()` as the thin gate on top of it. Control flow (`redirect`) stays outside the memoized function.

Then, in a second pass, add the archive link inside `session-start.tsx`, gated on `phase === 'proposal'`.

## Critical Implementation Details

**Avatar-only trigger must carry an accessible name.** With the name and e-mail gone from the header and out of the dropdown, an avatar `<img alt="">` inside a bare button leaves the control unnamed for screen readers, and leaves the user with no way to tell which account is signed in. Give the trigger an `aria-label` and `title` that include the display name (e.g. `Menu konta: <displayName>`) — this restores both the accessible name and the "which account" affordance at zero visual cost.

**Memoize the read, not the redirect.** Wrap only the `getUser()` read in `cache()`. `requireUser()` keeps its `redirect('/login')` outside the memoized function, so a redirect is never cached as a resolved value and the gate stays a plain, re-runnable control-flow check.

**Layout order matters for the avatar.** `(app)/layout.tsx` renders the header before `{children}`, so its user read happens first and the pages' `requireUser()` calls hit the memoized value. If a page is ever moved out of the group it loses the header but keeps its own gate — that asymmetry is intentional.

## Phase 1: Shared header with account menu

### Overview

One header for all authenticated routes, rendered by a route-group layout, with `Wyloguj się` inside a dropdown under the avatar. Removes the three inline headers and relocates the session-detail back-link into page content.

### Changes Required:

#### 1. Request-scoped user read

**File**: `src/lib/supabase/server.ts`

**Intent**: Both `(app)/layout.tsx` and each page need the current user, and each `auth.getUser()` call is a network round trip to Supabase Auth. Memoize the read per request so the added layout costs nothing.

**Contract**: Add an exported `getUser(): Promise<User | null>` wrapped in `cache` from `react`, holding the existing `createClient()` + `auth.getUser()` + error-logging body. `requireUser(): Promise<User>` keeps its current signature and becomes a thin wrapper: call `getUser()`, `redirect('/login')` when null, otherwise return the user. `createClient()` is unchanged and stays un-memoized (it is per-call cheap and callers mutate nothing).

#### 2. Account menu (client island)

**File**: `src/components/account-menu.tsx` (new)

**Intent**: The only interactive part of the header — the avatar button plus its dropdown containing `Wyloguj się`. Isolated as a client component so the rest of the header stays server-rendered.

**Contract**: `export function AccountMenu({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string })`, `'use client'`. Renders a `<button type="button">` trigger with `aria-expanded`, `aria-haspopup="true"`, `aria-controls` pointing at the panel, and an `aria-label`/`title` of `Menu konta: <displayName>`. Trigger content: the `<img>` avatar when `avatarUrl` is set (32 px, `rounded-full`, `referrerPolicy="no-referrer"`, `alt=""`, with the existing `eslint-disable-next-line @next/next/no-img-element`), otherwise the initial-letter fallback circle — both lifted verbatim from `src/app/page.tsx:28-47`. When open, renders an absolutely positioned panel anchored to the trigger's right edge containing `<form action={signOut}>` (imported from `@/app/auth/actions`) with a full-width submit button labelled `Wyloguj się`.

Closing behavior: Escape keydown, `pointerdown` outside the wrapper, and successful submit; the first two return focus to the trigger. Both listeners are attached in a `useEffect` gated on the open state and removed in its cleanup — do not leave document listeners attached while closed.

#### 3. Shared header (server)

**File**: `src/components/app-header.tsx` (new)

**Intent**: The non-interactive header shell, so no page is pulled into `'use client'` by the header.

**Contract**: `export function AppHeader({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string })` — no `'use client'`. Renders the existing `<header>` element and its class string from `src/app/page.tsx:22`, with `<Link href="/">english-talk</Link>` on the left (same `text-lg font-semibold tracking-tight` typography, plus a hover affordance now that it is a link) and `<AccountMenu />` on the right. Takes already-derived props rather than a `User` so the `user_metadata` narrowing lives in one place (the layout).

#### 4. Route group and its layout

**Files**: `src/app/(app)/layout.tsx` (new), `src/app/(app)/page.tsx` (moved from `src/app/page.tsx`), `src/app/(app)/archive/page.tsx` and `src/app/(app)/archive/[id]/page.tsx` (moved from `src/app/archive/`), plus `actions.ts` and `delete-session-button.tsx` moving with the `archive/` folder

**Intent**: Render the header exactly once for the authenticated surface. `login/`, `auth/`, and `api/` stay outside the group so they can never inherit it.

**Contract**: Move with `git mv` so history follows. URLs are unchanged (`/`, `/archive`, `/archive/[id]`). `layout.tsx` is an async Server Component that calls `requireUser()`, derives `avatarUrl` from `user.user_metadata?.avatar_url` and `displayName` from `user.user_metadata?.full_name` / `user.email` / `'Zalogowany użytkownik'` using the existing `typeof … === 'string'` narrowing (`src/app/page.tsx:11-18`), then returns `<div className="flex flex-1 flex-col font-sans">` wrapping `<AppHeader … />` and `{children}` — the wrapper that all three pages currently repeat individually.

The `@/app/archive/...` import specifiers in the moved files must be updated to their new paths; the `@/*` alias resolves against `src/`, and `(app)` is a real directory segment in that path.

#### 5. Strip the inline headers

**Files**: `src/app/(app)/page.tsx`, `src/app/(app)/archive/page.tsx`, `src/app/(app)/archive/[id]/page.tsx`

**Intent**: The layout now owns the header and the page wrapper; each page returns only its `<main>`.

**Contract**: Delete the `<header>` block and the `flex flex-1 flex-col font-sans` wrapper from all three, so each page's root becomes its existing `<main>`. In `page.tsx`, also drop the now-unused `signOut` import and the `avatarUrl`/`displayName` derivation (both moved to the layout); keep `requireUser()` as the page's own gate even though it no longer uses the return value on `/`. In `archive/page.tsx`, the `Nowa sesja` link and its `Link` import go away — verify `Link` is still needed for the session cards (it is) before removing the import.

#### 6. Contextual back-link on the session detail

**File**: `src/app/(app)/archive/[id]/page.tsx`

**Intent**: `← Archiwum` is contextual to this page's content, not global chrome, so it moves out of the header and above the session title.

**Contract**: Add a `← Archiwum` `<Link href="/archive">` as the first child of `<main>`, above the `<div>` holding the title and date. Style it as a quiet text link (the `text-sm font-medium underline underline-offset-4` treatment already used in `archive/page.tsx:82`) rather than re-using the header pill class.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build and typecheck pass: `npm run build`
- No stray header markup remains: `grep -rn "<header" src/app` returns nothing
- No page-level duplication of the wrapper remains: `grep -rn "flex flex-1 flex-col font-sans" src/app` matches only `src/app/(app)/layout.tsx`

#### Manual Verification:

- `/`, `/archive`, and `/archive/[id]` show a pixel-identical header (logo left, avatar right); `/login` still shows none
- Avatar click opens the dropdown; `Wyloguj się` logs out and lands on `/login`
- Escape closes the dropdown and focus returns to the avatar; a click outside does the same
- Tab reaches the avatar button and the dropdown item; the avatar button announces the display name
- Clicking the `english-talk` logo navigates to `/` from both archive routes
- `← Archiwum` above the session title returns to the archive list
- Header does not overflow or wrap at 320 px width, and the dropdown stays inside the right edge
- Dark mode borders and hover states match the previous header
- No visible regression in the orb or topic card layout on `/` (the layout wrapper replaced an identical page-level one)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Note that between Phase 1 and Phase 2 the archive has no UI entry point — it is reachable only by URL. Do not leave the change parked in that state.

---

## Phase 2: Archive entry point under the orb

### Overview

Restore an archive entry point in its new location: under the topic card on the start screen, visible only before a session begins.

### Changes Required:

#### 1. Archive link in the proposal phase

**File**: `src/components/session-start.tsx`

**Intent**: Give the archive a single, discoverable entry point that cannot be hit mid-conversation, where clicking a `<Link>` would tear down the realtime connection and lose the session.

**Contract**: Inside the `phase === 'proposal'` branch, after the card `<div>` (`src/components/session-start.tsx:68-94`), render an `Archiwum sesji` `<Link href="/archive">` — quiet text-link styling matching `archive/page.tsx:82`, and `relative z-10` so it sits above the absolutely positioned orb layer rather than under it. It must render only in the `proposal` branch, so it is absent during `conversation` and on the post-session report screen. Import `Link` from `next/link`; the component is already `'use client'`, where `next/link` works unchanged.

> **Drift note (implementation, 2026-07-26).** S-09 (`topic-selection-revamp`, PR #18) merged to `master` between planning and implementation and rewrote this file: the single-topic card became three topic buttons, and `Inny temat` became `Inne tematy` (re-rolls the whole set via `drawTopicSet`). The intent above is unchanged; only the anchors moved. Actual card `<div>` is at `:74-102`, and the `proposal` branch now needs a fragment wrapper (`<>…</>`) because it returned a single element. Progress row 2.5 keeps its original title — read `Inny temat` there as today's `Inne tematy`, and "re-draws the topic" as "re-draws the topic set".

#### 2. Return link on the archive list (added during implementation)

**File**: `src/app/(app)/archive/page.tsx`

**Intent**: Added at the user's request after Phase 2's original scope was verified working. The clickable logo alone proved too weak an affordance for returning to the start screen from the archive list, so the destination removed in Phase 1 comes back — as page content, not as a header button.

**Contract**: A `← Nowa sesja` `<Link href="/">` as the first child of `<main>`, above the `Archiwum sesji` heading, using the identical `self-start text-sm font-medium underline underline-offset-4` treatment as the session detail's `← Archiwum`. `AppHeader` is untouched — no per-route action slot is introduced. The empty state's `Rozpocznij pierwszą sesję` link stays; it targets `/` too but reads as a first-run CTA rather than a back link.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build and typecheck pass: `npm run build`

#### Manual Verification:

- `Archiwum sesji` is visible under the topic card on `/` and navigates to `/archive`
- The link disappears as soon as `Rozpocznij rozmowę` is clicked, and stays absent through the conversation and the post-session report
- `Inny temat` re-draws the topic without disturbing the link
- Returning to the proposal screen (`Nowa sesja` from the report, or exiting a conversation) brings the link back
- The link is clickable, not swallowed by the orb overlay, and does not shift the card's vertical centering noticeably
- Full loop works end to end: `/` → `Archiwum sesji` → a session → `← Archiwum` → logo → `/`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

No test framework is configured (`package.json` has no `test` script), and this change does not add one. Verification is `npm run lint` + `npm run build` plus the manual checklists above, and the Vercel preview build on the PR.

### Manual Testing Steps:

1. `npm run dev`, sign in, and confirm the header is identical on `/`, `/archive`, and `/archive/[id]`.
2. Open the dropdown with the mouse; close it with Escape, then with an outside click — confirm focus lands back on the avatar both times.
3. Navigate the header with the keyboard only (Tab to the avatar, Enter to open, Tab to `Wyloguj się`, Enter to submit).
4. Confirm `/login` renders without a header, and that visiting `/login` while signed in still redirects to `/` (`src/proxy.ts:75-84` untouched).
5. Narrow the viewport to 320 px and re-open the dropdown; confirm no horizontal overflow.
6. Toggle OS dark mode and re-check header borders, hover states, and the dropdown panel.
7. Start a conversation and confirm the archive link is gone for the whole conversation and the report screen.
8. Sign out from `/archive/[id]` to confirm the dropdown works from a nested route.

## Performance Considerations

Adding `(app)/layout.tsx` introduces a second consumer of the current user per render. The `cache()` wrapper (Phase 1, change 1) collapses layout + page into a single `auth.getUser()` round trip, so the net effect versus today is neutral rather than one extra Supabase Auth call per navigation.

The header is server-rendered; only `account-menu.tsx` ships to the client, and it is small enough that the client bundle is effectively unchanged — the start screen already ships `session-start.tsx`, `voice-conversation.tsx`, and `orb.tsx`.

## Migration Notes

Route-group moves are the only structural risk. Use `git mv` so history follows, and confirm after the move that `/`, `/archive`, and `/archive/[id]` still resolve — a `(app)` typo (e.g. `app/` without parentheses) would silently prefix every URL. `src/proxy.ts`'s `matcher` is path-based and unaffected by route groups, so the session gate needs no change.

No data migration. Fully revertible by reverting the commits.

## References

- Roadmap slice: `context/foundation/roadmap.md:174-186` (S-08), backlog row `:214`
- Lessons: `context/foundation/lessons.md` — branch + PR only, never commit to `master`; user-facing communication in Polish
- Route groups (installed docs): `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`
- `cache()` for the current-user read (installed docs): `node_modules/next/dist/docs/01-app/02-guides/data-security.md:65-80`, `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md:541-724`
- Narrow client island with a bound Server Action: `src/app/archive/delete-session-button.tsx:1-33`
- Current header to be unified: `src/app/page.tsx:22-74`, `src/app/archive/page.tsx:57-65`, `src/app/archive/[id]/page.tsx:61-69`
- Sign-out action: `src/app/auth/actions.ts:41-50`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared header with account menu

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 9a2eedc
- [x] 1.2 Production build and typecheck pass: `npm run build` — 9a2eedc
- [x] 1.3 No stray header markup remains: `grep -rn "<header" src/app` returns nothing — 9a2eedc
- [x] 1.4 Wrapper duplication gone: `grep -rn "flex flex-1 flex-col font-sans" src/app` matches only `src/app/(app)/layout.tsx` — 9a2eedc

#### Manual

- [x] 1.5 Identical header on `/`, `/archive`, `/archive/[id]`; none on `/login` — 9a2eedc
- [x] 1.6 Avatar opens dropdown; `Wyloguj się` logs out to `/login` — 9a2eedc
- [x] 1.7 Escape and outside click close the dropdown and return focus to the avatar — 9a2eedc
- [x] 1.8 Keyboard reaches avatar and menu item; avatar announces the display name — 9a2eedc
- [x] 1.9 Logo navigates to `/` from both archive routes — 9a2eedc
- [x] 1.10 `← Archiwum` above the session title returns to the archive list — 9a2eedc
- [x] 1.11 No header overflow at 320 px; dropdown stays inside the right edge — 9a2eedc
- [x] 1.12 Dark mode borders and hover states match the previous header — 9a2eedc
- [x] 1.13 No regression in orb or topic card layout on `/` — 9a2eedc

### Phase 2: Archive entry point under the orb

#### Automated

- [x] 2.1 Linting passes: `npm run lint`
- [x] 2.2 Production build and typecheck pass: `npm run build`

#### Manual

- [x] 2.3 `Archiwum sesji` visible under the topic card and navigates to `/archive`
- [x] 2.4 Link absent during the conversation and on the post-session report
- [x] 2.5 `Inny temat` re-draws the topic without disturbing the link
- [x] 2.6 Returning to the proposal screen brings the link back
- [x] 2.7 Link is clickable above the orb overlay and does not disturb card centering
- [x] 2.8 Full loop: `/` → `Archiwum sesji` → session → `← Archiwum` → logo → `/`
- [x] 2.9 `← Nowa sesja` on `/archive` returns to the start screen and matches the `← Archiwum` treatment
