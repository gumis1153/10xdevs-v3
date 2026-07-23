# Post-Session Report (S-04) Implementation Plan

## Overview

Replace the ended-screen stub in `voice-conversation.tsx` with a real post-session report: the client hands the in-memory conversation history to a new `POST /api/report` route, which grades the learner's English with the OpenAI Responses API + Structured Outputs and returns a CEFR report (level with ±1 band and disclaimer, grouped errors with corrections, suggestions). Closes FR-010–FR-013 and the primary Success Criterion; S-04 is deliberately **stateless** — nothing is persisted (first migration stays in S-05).

## Current State Analysis

- The report's raw material already exists client-side: `historyRef: RealtimeItem[]` (`src/components/voice-conversation.tsx:91`) is filled by the `history_updated` handler (`:151-153`) and kept alive in memory on the ended screen — the plan of S-03 explicitly marked it as this slice's hand-off point. Learner speech text lives in `input_audio.transcript` (transcribed by `gpt-4o-mini-transcribe`), tutor speech in `output_audio.transcript`.
- The ended branch (`voice-conversation.tsx:304-322`) renders a placeholder card ("Raport z rozmowy pojawi się w następnym kroku…") + "Nowa sesja" button — this is the seam to replace.
- API pattern to mirror exists at `src/app/api/realtime/token/route.ts`: auth via `createClient()` + `getUser()` (401 on no user, benign `AuthSessionMissingError` not logged), `OpenAI-Safety-Identifier` = sha256(user.id), upstream failures → 502 `{ error: 'upstream_error' }`, success with `Cache-Control: no-store`.
- `src/proxy.ts` gates `/api/*` with 401 JSON for anonymous requests (defense-in-depth on both layers). Plain `/api/report` is matched by the proxy matcher (no image-extension suffix — do not name the route anything like `/report.png`).
- No DB schema, no migrations, Supabase = auth only. Roadmap parks the first migration (with RLS) on S-05.
- `openai@6.48.0` is present only **transitively** (via `@openai/agents-core`); `zod` v4 is a direct dep and is supported by the SDK's `zodTextFormat` helper.
- Session hard cap is exactly 2:00 (`SESSION_SECONDS`, `voice-conversation.tsx:36`), so the PRD's literal "session < 2 min → too little material" is unmeasurable by duration — resolved below via learner word count.
- Live-verified 2026-07-23: model **`gpt-5.6-luna`** exists ($1/$6 per MTok, "optimized for cost-sensitive workloads", supports `reasoning.effort`). Research Open Question #1 closed.

## Desired End State

Ending a conversation (button or timer) immediately shows an "Analizuję rozmowę…" loading state, then one of:

1. **Report** — CEFR level + ±1 range + justification + disclaimer, grouped errors (each with verbatim quote, minimal-edit correction, category, explanation; empty list is a valid result), study suggestions, and a collapsed "Pokaż transkrypcję" section with the full conversation.
2. **Too little material** — deterministic server-side gate (< 40 learner words) returns a friendly "za mało materiału do analizy" message without calling the model.
3. **Error card** — "Analiza nie powiodła się" with "Spróbuj ponownie" (re-POSTs the same in-memory transcript) and "Nowa sesja".

Verify by completing a real session on the preview deployment and exercising all three outcomes.

### Key Discoveries:

- `RealtimeItem` union (verified in `node_modules/@openai/agents-realtime/dist/items.d.ts:92`): only `type: 'message'` items carry text; user text = `input_audio.transcript` (may be `null` while in progress), assistant text = `output_audio.transcript`; fields are camelCase; array already ordered. `research.md` §1 includes a verified transcript-builder shape.
- Structured Outputs on the Responses API: schema goes under `text.format` via `zodTextFormat(schema, name)` from `openai/helpers/zod`; `client.responses.parse()` returns typed `output_parsed`; output items can instead carry a `refusal` (`docs-openai-responses-structured-outputs.md` §4–§6).
- Strict-mode rules: every object `additionalProperties: false`, all fields required → optional fields must be `.nullable()`, never `.optional()`; `z.enum` maps cleanly (docs §5).
- Hallucinated corrections are the #1 product guardrail (PRD Guardrails, roadmap S-04 risk). Strongest documented mitigation (research §8): verbatim-quote requirement + deterministic substring post-check, explicit "empty list is OK", minimal-edit framing, learner turns only.
- Pronunciation is not assessable from a text transcript (research §9, EvalYaks precedent) — category dropped by decision (see brief).
- POST route handlers are always dynamic; `Cache-Control: no-store` is belt-and-suspenders. `maxDuration = 30` gives model-call headroom, well under the 300 s Hobby cap (docs-nextjs §1, §4).

## What We're NOT Doing

- **No persistence** — no tables, no migrations, no RLS; report lives only on the ended screen and is lost on "Nowa sesja". Archive (FR-015) = S-05.
- **No pronunciation error category** (decision 2026-07-23, EvalYaks precedent): categories are grammar / vocabulary / syntax / word-order; the report disclaimer states pronunciation is not assessed from a transcript. Conscious deviation from FR-011's literal wording.
- **No few-shot calibration examples** in the grading prompt (v1 = official CEFR descriptors + analytic-before-holistic; few-shot is a follow-up after validating on real sessions).
- **No streaming / background jobs / `after()`** — a single synchronous POST returning JSON.
- **No audio anywhere**: raw audio is never captured, sent, or stored (PRD guardrail); the client sends text turns only.
- **No dedicated report page/route** (`/report/[id]` needs persistence → S-05); no rate limiting beyond auth (cost per call is a fraction of a cent and calls are user-action-bound).
- **No level adaptation** (S-06) and no changes to `src/lib/realtime/instructions.ts`.

## Implementation Approach

Client builds a sanitized, text-only turn list from `historyRef.current` and POSTs it to `/api/report`. The route (mirroring the token route's auth/error/cache pattern) validates the payload with zod, applies the deterministic material gate, calls `client.responses.parse()` on `gpt-5.6-luna` (`reasoning.effort: 'low'`) with a strict `ReportSchema`, handles refusals, then applies the deterministic grounding gate (drop any error whose `quote` is not an exact substring of the learner corpus) and returns the report JSON. The ended branch of `voice-conversation.tsx` orchestrates loading / report / insufficient / error+retry states and renders a presentational report component.

Both phases land on a feature branch and enter via PR (lessons.md: never commit to master).

## Critical Implementation Details

- **StrictMode double-fire on the ended effect**: the effect that auto-POSTs on entering `ended` runs twice in dev. Guard with a per-entry ref (e.g. `reportRequestedRef`) so only one request is sent; retry resets the guard. Mirror the existing `cancelled`-flag discipline for unmount during fetch.
- **Structured turns, not a flat string, over the wire**: the client sends `{ turns: [{ speaker: 'learner' | 'tutor', text }] }`. The server derives both the prompt transcript and the learner-only corpus (grounding + word count) from it deterministically — a flat prefixed string would make the learner/tutor split spoofable by utterance content.
- **Reasoning models reject `temperature`**: research §6 suggested `temperature: 0`, but `gpt-5.6-luna` is a reasoning-effort model — omit `temperature` entirely; determinism comes from strict schema + `reasoning.effort: 'low'`.
- **Report language split**: `justification`, `explanation`, `suggestions`, `disclaimer`, and the insufficient-material message are user-facing → Polish (UI language). `quote` and `correction` stay in English (they quote/fix English utterances). Encode this in the prompt.
- **Grounding gate compares against learner turns only**, exactly as sent (the model sees the same text); drop non-grounding errors silently and `console.warn` the dropped count server-side — an empty surviving list is a correct result, not an error.

## Phase 1: Report Contract & Analysis Route (server)

### Overview

Everything needed for a working, guarded `/api/report`: explicit `openai` dependency, shared schema/type contract, grading prompt, and the route itself.

### Changes Required:

#### 1. Explicit `openai` dependency

**File**: `package.json`

**Intent**: Stop relying on hoisting for the transitively-present SDK; pnpm/strict resolution would break it.

**Contract**: `npm i openai` pinned to the already-resolved major (`^6.48.0`); no second copy in the lockfile.

#### 2. Shared report contract

**File**: `src/lib/report/schema.ts` (new)

**Intent**: One zod v4 source of truth for the request payload, the Structured Outputs schema, and the response union — imported by both the route and the client UI.

**Contract**: Exports `TurnsPayloadSchema` (request), `ReportSchema` (model output), inferred types, and the route response union. Strict-mode rules apply (all fields required, `.nullable()` not `.optional()`). Other phases depend on this exact shape:

```ts
const CEFR = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export const TurnsPayloadSchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z.enum(['learner', 'tutor']),
        text: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(200),
})

export const ReportSchema = z.object({
  cefrLevel: CEFR.describe('Holistic CEFR level for the whole session'),
  cefrRange: z
    .object({ low: CEFR, high: CEFR })
    .describe('Honest ±1 uncertainty band around the holistic level'),
  // confidence is not rendered in v1 — kept as raw material for S-05+ (persisted
  // reports enable threshold calibration / logging of low-confidence gradings).
  confidence: z.number().describe('0..1 soft signal only; not a validated probability'),
  analytic: z
    .object({
      grammaticalAccuracy: CEFR,
      vocabularyRange: CEFR,
      coherenceCohesion: CEFR,
      interaction: CEFR,
    })
    .describe('Per-dimension sub-levels, derived before the holistic verdict'),
  justification: z.string().describe('Polish; rationale AFTER the analytic reasoning'),
  errors: z
    .array(
      z.object({
        quote: z.string().describe('VERBATIM substring from a LEARNER turn only'),
        correction: z.string().describe('English; minimal-edit fix, no rephrasing of correct text'),
        category: z.enum(['grammar', 'vocabulary', 'syntax', 'word-order']),
        explanation: z.string().describe('Polish; short, learner-friendly'),
      }),
    )
    .describe('MAY be empty — return [] when no genuine errors are found'),
  suggestions: z.array(z.string()).describe('Polish; concrete study suggestions from THIS session'),
  disclaimer: z.string().describe('Polish; single-session, text-only, ±1-band, no-pronunciation wording'),
})

export type Report = z.infer<typeof ReportSchema>
export type ReportResponse =
  | { kind: 'report'; report: Report }
  | { kind: 'insufficient_material'; learnerWordCount: number }
```

#### 3. Grading prompt

**File**: `src/lib/report/prompt.ts` (new)

**Intent**: The examiner instructions, kept out of the route (same separation rationale as `src/lib/realtime/instructions.ts`) so S-06 or prompt tuning never touches route logic.

**Contract**: Exports a function returning the `instructions` string plus a transcript formatter (turn list → `Learner:`/`Tutor:` lines). The instructions must contain, in this order of importance: (1) grade **learner turns only**; (2) every flagged error requires a **verbatim quote** from a learner turn, minimal-edit correction, and **"return an empty errors list if there are no genuine errors"** stated explicitly; (3) transcripts come from ASR — an odd word may be a transcription artifact, do not flag it as a learner error when in doubt; (4) embedded official CEFR **spoken-interaction** descriptors (global scale, A1–C2, abbreviated from the Council of Europe texts linked in research §7); (5) assess the four analytic dimensions before the holistic verdict, report an honest ±1 `cefrRange`; (6) the language split (Polish user-facing fields, English quote/correction); (7) disclaimer content: automatic estimate from a short, text-only sample, least reliable at C levels, pronunciation not assessed, not a substitute for an exam.

#### 4. Analysis route

**File**: `src/app/api/report/route.ts` (new)

**Intent**: The one-shot grading endpoint — mirrors the token route's auth/error/cache pattern, adds the two deterministic guardrails around the model call.

**Contract**: `export const maxDuration = 30`; `POST` only. Pipeline:

1. Auth exactly like `src/app/api/realtime/token/route.ts:20-33` (401, benign-error filter). Safety identifier = sha256(user.id) — same value the token route sends as the `OpenAI-Safety-Identifier` header — passed as the native `safety_identifier` **body param** of `responses.parse` (first-class in `openai@6.48.0`, `resources/responses/responses.d.ts:7101`; `user` is deprecated in its favor). No raw header needed.
2. Body → `TurnsPayloadSchema.safeParse` → 400 `{ error: 'invalid_payload' }` on failure.
3. **Material gate**: learner word count = whitespace-split tokens across `speaker === 'learner'` turns; `< 40` → 200 `{ kind: 'insufficient_material', learnerWordCount }` (no model call).
4. `client.responses.parse({ model: 'gpt-5.6-luna', reasoning: { effort: 'low' }, safety_identifier: safetyIdentifier, instructions, input: formattedTranscript, text: { format: zodTextFormat(ReportSchema, 'session_report') } })` wrapped in try/catch → 502 `{ error: 'upstream_error' }` (console.error, mirroring token route).
5. Refusal item or missing `output_parsed` → 502 `{ error: 'analysis_failed' }`.
6. **Grounding gate**: drop every `errors[]` entry whose `quote` is not an exact substring of the learner corpus built by joining learner turns with `'\n'` (no-separator concatenation would accept a quote spanning a turn boundary — verbatim from no single turn); `console.warn` dropped count.
7. 200 `{ kind: 'report', report }` with `Cache-Control: no-store`.

### Success Criteria:

#### Automated Verification:

- `openai` appears in `package.json` dependencies and the lockfile resolves a single copy
- Linting passes: `npm run lint`
- Production build (includes type checking) passes: `npm run build`

#### Manual Verification:

- From a logged-in browser console, `fetch('/api/report', …)` with a sample turns payload returns a schema-valid report; a payload with < 40 learner words returns `insufficient_material` (and, per network timing, visibly skips the model call)
- Anonymous `curl` to `/api/report` gets 401 (proxy) — route auth also verified by temporarily bypassing proxy locally if desired
- A sample containing a deliberately correct learner sentence produces no fabricated error for it (spot-check of the anti-hallucination prompt + grounding gate)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Client Hand-off & Report UI

### Overview

Turn `historyRef` into the request payload and replace the ended-screen stub with the loading / report / insufficient / error+retry flow.

### Changes Required:

#### 1. Transcript builder

**File**: `src/lib/realtime/transcript.ts` (new)

**Intent**: Pure function converting `RealtimeItem[]` into the `turns` payload — the only place that knows the `RealtimeItem` content shape; strips everything non-text (privacy guardrail: no audio ever leaves the client).

**Contract**: `buildTurns(history: RealtimeItem[]): Turn[]` — keep only `type: 'message'`, skip `role: 'system'`, map `input_text`/`output_text` → `text` and `input_audio`/`output_audio` → `transcript ?? ''`, join parts, trim, drop empty turns; `role: 'user'` → `speaker: 'learner'`, `assistant` → `'tutor'`. Shape verified against installed types in research §1.

#### 2. Report request lifecycle in the conversation component

**File**: `src/components/voice-conversation.tsx`

**Intent**: On entering `ended`, snapshot `buildTurns(historyRef.current)` once and auto-POST to `/api/report`; hold a report-phase state machine (`analyzing` / `report` / `insufficient` / `error`) alongside the existing session states; expose a retry that re-POSTs the same snapshot.

**Contract**: New effect keyed on `state === 'ended'` guarded against StrictMode double-fire and unmount (see Critical Details). **Empty-snapshot short-circuit**: if the snapshot contains no learner turns (including a fully empty history — "Zakończ rozmowę" works even during `connecting`), set the `insufficient` outcome locally without POSTing — an empty payload would fail `TurnsPayloadSchema.min(1)` with 400 and strand the user on a retry that can never succeed. The ended branch renders the new `SessionReport` component with the outcome + `onRetry` + existing `onNewSession`. The `ended` card copy "Raport z rozmowy pojawi się…" disappears. No changes to session/timer logic, props contract unchanged.

#### 3. Report presentation component

**File**: `src/components/session-report.tsx` (new)

**Intent**: Presentational component for all four outcomes, styled like the existing cards (reuse the card/button class constants or local equivalents; widen the card for report content if needed).

**Contract**: Props: `{ outcome, transcriptLines, onRetry, onNewSession }`. Renders:

- `analyzing`: "Analizuję rozmowę…" with a visible activity indicator and `aria-live="polite"` (NFR ≥ 500 ms signal),
- `report`: CEFR level + range (e.g. "B1 (pasmo A2–B2)") + justification; errors grouped by category with quote → correction → explanation, and an explicit friendly line when `errors` is empty; suggestions list; disclaimer; collapsed `<details>`-style "Pokaż transkrypcję" section listing the `Learner:`/`Tutor:` lines (FR-014),
- `insufficient`: "Za mało materiału do analizy" message + "Nowa sesja",
- `error`: "Analiza nie powiodła się" + "Spróbuj ponownie" (primary) + "Nowa sesja" (secondary).

All user-facing copy in Polish, matching the tone of existing cards.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Real session on preview: end via button → loading state appears immediately, report renders with CEFR + range + disclaimer, grouped errors with plausible verbatim quotes, suggestions; timer-driven end (2:00) behaves identically
- Short session (a few words, then end) → "za mało materiału do analizy", no model latency
- Failure path: with `OPENAI_API_KEY` broken locally (or DevTools request blocking), error card appears; "Spróbuj ponownie" re-sends and succeeds once unblocked
- "Pokaż transkrypcję" expands to the full conversation; network tab shows the POST body contains only text turns (no audio/base64)
- A session with deliberately correct English yields an empty error list presented as a positive result (guardrail: no fabricated errors)
- No StrictMode double-POST in dev (single request in network tab per ended entry)
- Ending immediately after entering the conversation (no speech at all) → "za mało materiału do analizy" with zero `/api/report` requests in the network tab

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

No test framework is configured (AGENTS.md); none introduced in this slice. The two pure seams built here (`buildTurns`, grounding/word-count helpers) are deliberately extracted into `src/lib/` so tests can be added the moment a runner lands.

### Integration Tests:

Covered by manual verification against the dev server / preview deployment (see phase criteria).

### Manual Testing Steps:

1. Full happy path on preview (auth → topic → conversation → ended → report).
2. Empty-ish session → insufficient-material message.
3. Forced upstream failure → error card → retry recovers.
4. Correct-English session → empty error list rendered positively.
5. Transcript toggle + payload inspection (text-only) in DevTools.

## Performance Considerations

Transcript of a 2-minute session is ~hundreds of tokens; `gpt-5.6-luna` at `reasoning.effort: 'low'` should respond in single-digit seconds — `maxDuration = 30` is generous headroom, far under the 300 s Hobby cap (standing constraint #2). The material gate short-circuits before any model cost. Cost per report ≈ fractions of a cent ($1/$6 per MTok).

## Migration Notes

None — stateless slice, no schema, no data. Rollback = revert the PR; the ended screen falls back to the S-03 stub.

## References

- Research: `context/changes/post-session-report/research.md` (esp. §1 transcript source, §8 anti-hallucination, §10 SDK verification)
- API docs snapshots: `docs-openai-responses-structured-outputs.md`, `docs-nextjs-route-handler.md` (same folder)
- Pattern to mirror: `src/app/api/realtime/token/route.ts`
- Hand-off seam: `src/components/voice-conversation.tsx:87-91, 304-322`
- Roadmap slice: `context/foundation/roadmap.md:119-130` (S-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Report Contract & Analysis Route (server)

#### Automated

- [x] 1.1 `openai` in dependencies, single copy in lockfile
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Production build passes: `npm run build`

#### Manual

- [x] 1.4 Logged-in fetch returns schema-valid report; < 40 learner words returns `insufficient_material`
- [x] 1.5 Anonymous request gets 401
- [x] 1.6 Correct learner sentence produces no fabricated error (spot-check)

### Phase 2: Client Hand-off & Report UI

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Production build passes: `npm run build`

#### Manual

- [ ] 2.3 Happy path: loading → report (CEFR + range + disclaimer + grouped errors + suggestions), both end triggers
- [ ] 2.4 Short session → "za mało materiału do analizy" without model latency
- [ ] 2.5 Failure → error card; retry re-sends same transcript and recovers
- [ ] 2.6 Transcript toggle works; POST payload is text-only (no audio/base64)
- [ ] 2.7 Correct-English session → empty error list rendered positively
- [ ] 2.8 No StrictMode double-POST in dev
- [ ] 2.9 Immediate end (empty history) → insufficient message, zero /api/report requests
