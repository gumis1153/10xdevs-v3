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
- `npm run lint` — run ESLint. Run before pushing.

## Coding Style & Naming Conventions

- TypeScript `strict` is on; import from `src/` via the `@/*` alias (e.g. `@/app/...`), not relative `../../` chains.
- Style with Tailwind utility classes; global CSS belongs in `src/app/globals.css`.
- ESLint enforces `next/core-web-vitals` + `next/typescript` (@eslint.config.mjs). React Server Components are the default — add `'use client'` only where interactivity is required.

## Testing Guidelines

No test framework is configured yet. If you add one, wire a `test` script into @package.json and place tests beside the unit they cover.

## Commit & Pull Request Guidelines

History is short and uses sentence-style summaries (`git log`); no strict convention is set. Keep subjects imperative and scoped. All changes land via PR against `master` — direct pushes are blocked by the `protect-master` ruleset. Every PR gets a Vercel preview build (typecheck included) with a preview URL; merging to `master` auto-deploys production. ESLint does not run in CI — run `npm run lint` locally before pushing. Preview URLs sit behind Deployment Protection: verify with `vercel curl / --deployment <preview-url>` or a logged-in browser (anonymous 401 is expected).
