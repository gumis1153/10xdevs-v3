# Header Avatar Menu — Plan Brief

> Full plan: `context/changes/header-avatar-menu/plan.md`

## What & Why

The header is copy-pasted into three pages and looks different on each one, and the start screen's header carries six elements — logo, avatar, name, e-mail, `Archiwum`, `Wyloguj się`. Roadmap slice S-08 collapses that into one shared, minimal header (logo + avatar), moves the rare destructive action (`Wyloguj się`) into a dropdown under the avatar, and relocates the archive entry point to under the orb, where a user actually looks for it.

## Starting Point

Three hand-maintained headers: `src/app/page.tsx:22-74` (logo, avatar, name, e-mail, archive link, sign-out form), `src/app/archive/page.tsx:57-65` (logo, `Nowa sesja`), `src/app/archive/[id]/page.tsx:61-69` (logo, `← Archiwum`). No layout exists other than the root one, which only wires fonts. No UI library is installed — Tailwind v4 only — so the dropdown is hand-written. Each of the three pages calls `requireUser()` itself, and that call is a real network round trip to Supabase Auth.

## Desired End State

Every authenticated route shows the same header: `english-talk` on the left linking to `/`, a 32 px avatar button on the right. The avatar opens a small dropdown with one item, `Wyloguj się`; Escape or an outside click closes it and returns focus to the avatar. `/login` still has no header. The start screen carries a discreet `Archiwum sesji` link under the topic card, present only before a session starts, and the session-detail page's `← Archiwum` back-link sits above its title in page content rather than in global chrome.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| How to share the header | Route group `(app)/` with its own `layout.tsx` | The header then exists exactly once, and `/login`, `/auth`, `/api` stay outside the group so they can never inherit it. |
| Dropdown contents | `Wyloguj się` only | Keeps the menu to the one action it exists for; the archive gets a single entry point under the orb rather than a duplicate here. |
| Header trigger | Avatar only, no name or chevron | Removes the widest elements from the header, which is the point of the slice, and matches the Google/GitHub convention users already know. |
| Other header actions | Header is logo + avatar everywhere; `← Archiwum` moves into page content, `Nowa sesja` is dropped | A slot-per-route header would reintroduce the divergence we are removing; the logo covers "back to start". |
| Archive link placement | Under the topic card, `proposal` phase only | A `<Link>` clicked mid-conversation would tear down the realtime connection and lose the session. |
| Dropdown implementation | `useState` + Escape + outside click + focus return | Covers mouse, keyboard, and screen-reader paths for a one-item menu without a new dependency; native `<details>` cannot close on Escape or outside click, and full `role="menu"` machinery is disproportionate for one item. |
| Duplicated user read | `cache()` on the raw read, `requireUser()` stays the gate | Keeps per-page defense-in-depth while the layout's added read costs zero extra Supabase round trips; the Next.js docs recommend this exact pattern for the current-user read. |
| Mobile | No separate variant | Two elements fit at 320 px; the minimalism removes the responsiveness problem instead of adding breakpoints. |

## Scope

**In scope:** route group `(app)/` + its layout; new `app-header.tsx` (server) and `account-menu.tsx` (client); `cache()`-backed user read in `src/lib/supabase/server.ts`; removal of the three inline headers; `← Archiwum` relocated into `<main>` on the session detail; `Archiwum sesji` link under the topic card.

**Out of scope:** name/e-mail in the dropdown; an archive link inside the dropdown; the `Nowa sesja` button on `/archive`; a mobile dropdown variant or a broader responsiveness audit; any UI library, `role="menu"` ARIA machinery, or animation; `src/proxy.ts`, the schema, RLS, the realtime token route, the report pipeline; adding a test framework.

## Architecture / Approach

```
src/app/
  layout.tsx            ← unchanged (fonts, <body>)
  login/, auth/, api/   ← outside the group: no header
  (app)/
    layout.tsx          ← requireUser() → derives avatarUrl + displayName
      └─ <AppHeader>    ← server: logo link + <AccountMenu>
           └─ <AccountMenu>  ← 'use client': avatar button + dropdown + signOut
      └─ {children}
    page.tsx, archive/, archive/[id]/   ← <main> only; keep own requireUser()
```

The server/client seam runs through the header: only the dropdown is a client island, following the existing `delete-session-button.tsx` pattern. The archive link cannot live in the header or layout because its visibility depends on `phase` state inside the client component `session-start.tsx`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared header with account menu | One header on all authenticated routes, `Wyloguj się` in a dropdown, three inline headers gone, `← Archiwum` moved into page content | Route-group move: a typo in `(app)` silently prefixes every URL — verify all three routes resolve after `git mv` |
| 2. Archive entry point under the orb | `Archiwum sesji` link under the topic card, `proposal` phase only | Link must sit above the absolutely positioned orb layer (`relative z-10`) or it becomes unclickable |

**Prerequisites:** S-01 (sign-out action) and S-05 (archive routes) — both already shipped and in `context/archive/`. Nothing else blocks.

**Estimated effort:** ~1 session; Phase 1 is the bulk, Phase 2 is a single file.

## Open Risks & Assumptions

- Between Phase 1 and Phase 2 the archive is reachable only by URL — Phase 1 removes the header link before Phase 2 adds the new one. Do not leave the change parked between phases.
- With name and e-mail gone from both the header and the dropdown, "which account am I signed in as" survives only as the avatar button's `aria-label`/`title`. If that proves too subtle in use, adding a name row to the dropdown is a one-line follow-up.
- The dropdown's outside-click and Escape handling is hand-written; its `useEffect` listeners must be gated on the open state and cleaned up, or they leak across navigations.
- `Nowa sesja` disappears from `/archive` as an explicit CTA, replaced by the clickable logo — a small discoverability trade the empty-state link on `/archive` partly offsets.

## Success Criteria (Summary)

- The header looks and behaves identically on `/`, `/archive`, and `/archive/[id]`; `/login` has none.
- Signing out works from the avatar dropdown on any route, by mouse and by keyboard, with Escape and outside-click closing it.
- The archive is reachable in one click from the start screen and unreachable mid-conversation; `npm run lint` and `npm run build` are clean.
