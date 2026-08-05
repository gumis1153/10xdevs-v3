<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Repository Guidelines

Next.js 16 App Router application (React 19, Tailwind CSS v4, TypeScript strict mode), scaffolded with `create-next-app`. See @package.json for exact versions.

## Hard Rules

- Read `node_modules/next/dist/docs/` before writing Next.js code (see top of file). This is Next.js 16 — request interception goes in `proxy.ts`, not `middleware.ts`.
- Do not edit `context/foundation/*` unless the task explicitly asks to update planning docs (PRD, tech-stack, shape-notes) — these drive the 10xDevs workflow, not application code.
- `CLAUDE.md.scaffold` only `@`-references this file; keep agent guidance here.

## Project Structure

- `src/app/` — App Router routes, layouts, and `globals.css` (Tailwind entrypoint). Add pages/layouts here.
- `public/` — static assets served at root.
- `context/` — planning docs (`foundation/`, `changes/`, `archive/`); see @context/foundation/README.md.
- Config lives at root: @next.config.ts, @tsconfig.json, @eslint.config.mjs, @postcss.config.mjs.

## Build, Test, and Development Commands

- `npm run dev` — start the dev server at http://localhost:3000.
- `npm run build` — production build.
- `npm run start` — serve the production build.
- `npm run test:run` — run the Vitest suite once. `npm test` is watch mode.
- `npm run lint` — run ESLint. Run before pushing.

## Coding Style & Naming Conventions

- TypeScript `strict` is on; import from `src/` via the `@/*` alias (e.g. `@/app/...`), not relative `../../` chains.
- Style with Tailwind utility classes; global CSS belongs in `src/app/globals.css`.
- ESLint enforces `next/core-web-vitals` + `next/typescript` (@eslint.config.mjs). React Server Components are the default — add `'use client'` only where interactivity is required.

## Testing Guidelines

Vitest in `jsdom` with `@testing-library/react` (config: @vitest.config.mts, setup: @vitest.setup.ts). Run `npm run test:run` for a single pass (gate) and `npm test` for watch mode. Place tests beside the unit they cover (`src/lib/realtime/transcript.test.ts` next to `transcript.ts`); shared fakes live in `src/test/fakes/`. Read `context/foundation/test-plan.md` §6 before writing a new test — it holds the per-layer patterns, the mocking policy (external module boundaries only, never internal modules), and what the current suite deliberately does not cover.

## Commit & Pull Request Guidelines

History is short and uses sentence-style summaries (`git log`); no strict convention is set. Keep subjects imperative and scoped. All changes land via PR against `master` — direct pushes are blocked by the `protect-master` ruleset. Every PR gets a Vercel preview build with a preview URL; that build runs `npm run test:run && npm run build` (configured as `buildCommand` in @vercel.ts), so the Vitest suite and the typecheck are both merge gates — a red test fails the build, and the required `Vercel` status check then blocks the merge. Merging to `master` auto-deploys production, so a red suite blocks production too. ESLint does not run in CI — run `npm run lint` locally before pushing. Preview URLs sit behind Deployment Protection: verify with `vercel curl / --deployment <preview-url>` or a logged-in browser (anonymous 401 is expected).
