# Post-Session Report (S-04) — Plan Brief

> Full plan: `context/changes/post-session-report/plan.md`
> Research: `context/changes/post-session-report/research.md`

## What & Why

After a voice session ends, the user sees a real report instead of the S-03 stub: a CEFR estimate (with an honest ±1 band and an uncertainty disclaimer), a grouped list of genuine language errors with corrections and explanations, and concrete study suggestions. This closes the product's primary Success Criterion (FR-010–FR-013, US-01) — the feedback loop that makes the safe-practice conversations worth repeating.

## Starting Point

S-03 already produces the raw material for free: the full conversation history (both sides transcribed) is kept in memory on the ended screen as an explicit hand-off point (`voice-conversation.tsx:87-91`). There is no DB, no migrations — Supabase is auth-only — and the ended screen is a placeholder card. The token route (`/api/realtime/token`) provides the API pattern to mirror (auth, safety identifier, 502-on-upstream, no-store).

## Desired End State

Ending a conversation immediately shows "Analizuję rozmowę…", then the report: CEFR level with range and Polish justification + disclaimer, errors grouped by category (each with a verbatim quote, minimal-edit correction, explanation — an empty list is a valid, positively-presented result), suggestions, and a collapsed full transcript. Sessions with too little speech get "za mało materiału do analizy"; failures get an error card with retry (the transcript stays in memory until "Nowa sesja").

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Analysis architecture | Client POSTs text turns → `/api/report` → Responses API + Structured Outputs (zod v4, strict) → grounding gate → inline render | Matches the two closest published CEFR-from-transcript systems and needs zero new infrastructure. | Research |
| Anti-hallucination guardrail | Verbatim quote required per error + deterministic substring post-check; "empty list is OK"; learner turns only; minimal-edit framing | Best-documented mitigation for the #1 product risk (fabricated corrections destroy trust). | Research |
| Pronunciation category (FR-011) | Dropped; disclaimer says pronunciation isn't assessed from a transcript | Not assessable from text (EvalYaks precedent) — keeping it would guarantee hallucinated errors. | Plan |
| "Too little material" gate | ≥ 40 learner words (server-side, before the model call) | Session cap is exactly 2:00, so the PRD's "< 2 min" duration test is unmeasurable; word count measures actual material. | Plan |
| Persistence | None — stateless S-04; report lost on "Nowa sesja" | First migration (with RLS) stays in S-05 per roadmap sequence. | Research |
| Transcript in UI (FR-014) | Yes — collapsed "Pokaż transkrypcję" section | Data is already client-side; one presentational component closes a nice-to-have FR. | Plan |
| Prompt calibration | Official CEFR spoken-interaction descriptors + analytic-before-holistic; no few-shot in v1 | Documented quality gain without needing a labeled example set; few-shot is a follow-up. | Plan |
| Failure UX | Error card + manual "Spróbuj ponownie" (same in-memory transcript) | Consistent with the existing session retry pattern; material isn't lost without user consent. | Plan |
| Analysis trigger | Automatic on entering `ended` | Zero extra clicks to the product's main value; NFR covered by the loading state. | Plan |
| Model | `gpt-5.6-luna`, `reasoning.effort: 'low'`, no temperature param | Live-verified 2026-07-23 ($1/$6 per MTok, cost-optimized tier); reasoning models reject `temperature`. | Plan |

## Scope

**In scope:** explicit `openai` dependency; shared zod contract (`src/lib/report/schema.ts`); grading prompt module; `POST /api/report` (auth, payload validation, material gate, model call, refusal handling, grounding gate); transcript builder (`src/lib/realtime/transcript.ts`); ended-screen report flow with loading/insufficient/error+retry states; report component with collapsed transcript.

**Out of scope:** persistence/migrations/archive (S-05); pronunciation category; few-shot calibration; streaming/background jobs; rate limiting beyond auth; level adaptation (S-06); changes to conversation instructions; any audio capture.

## Architecture / Approach

`historyRef` → `buildTurns()` (text-only, learner/tutor) → `POST /api/report` → [401 auth gate | 400 invalid payload | insufficient-material short-circuit] → `responses.parse()` on `gpt-5.6-luna` with strict `ReportSchema` → refusal check → grounding gate (quote must be substring of learner corpus) → JSON report → rendered inline in the `ended` branch. Route mirrors the token route's auth/safety-identifier/502/no-store pattern; `maxDuration = 30`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Report Contract & Analysis Route | Working, guarded `/api/report` + shared schema + grading prompt | Grading quality/CEFR honesty — mitigated by descriptors-in-prompt, ±1 band, grounding gate |
| 2. Client Hand-off & Report UI | Ended screen becomes the report flow (loading/report/insufficient/error+retry, transcript toggle) | StrictMode double-POST and state-machine edge cases on the ended screen |

**Prerequisites:** S-03 archived (done); `OPENAI_API_KEY` already configured; work on a branch + PR (protect-master).
**Estimated effort:** ~2 sessions (one per phase), each ending in a preview-deployment manual check.

## Open Risks & Assumptions

- CEFR from one short session is inherently noisy (central bias, weak at C levels) — mitigated by ±1 band + disclaimer, but real-session validation of grading quality is a follow-up task.
- The 40-word threshold is a first calibration — expect to tune it after real sessions.
- ASR artifacts can masquerade as learner errors; the prompt tells the model to skip doubtful cases, which trades recall for precision (intentionally).

## Success Criteria (Summary)

- Ending any session leads, without extra clicks, to a report (or an honest "too little material" / error+retry state) — US-01 closed end-to-end.
- No fabricated errors: every displayed quote is a verbatim learner utterance (enforced deterministically), and an empty error list renders as a valid, positive outcome.
- Raw audio never leaves the client; the report request carries text turns only.
