<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Conversation Flow Tuning

- **Plan**: `context/changes/conversation-flow-tuning/plan.md`
- **Scope**: full plan (Phase 1–2 of 2)
- **Date**: 2026-07-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations
- **Commits reviewed**: `36d5487` (p1), `df68bdb` (p2), `351e664` (epilogue) — merged to `master` as `16c805a` (PR #21)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria verification

Automated — all 6 re-run at review time and passing:

| Criterion | Command | Result |
|---|---|---|
| 1.1 / 2.1 | `npm run lint` | PASS — ESLint: No issues found |
| 1.2 / 2.2 | `npm run build` | PASS — compiled + TypeScript clean |
| 2.3 | `! grep -q "offer the missing word" src/lib/realtime/instructions.ts` | PASS |
| 2.4 | `! grep -q "two or three sentences" src/lib/realtime/instructions.ts` | PASS |

Manual — 14/14 checked in `## Progress`, each confirmed by the user during implementation (1.3–1.9, 2.5–2.11). No rubber-stamping detected: every manual row has observable backing in the diff or was verified on the preview deployment.

## Plan adherence detail

All five planned changes are implemented as contracted:

| Planned change | Location | Verdict |
|---|---|---|
| Opening trigger via `requestResponse?.()` after connect | `voice-conversation.tsx:282` | MATCH — inside `try`, after the `cancelled` guard, as specified |
| Post-connect state `processing` | `voice-conversation.tsx:271` | MATCH |
| Reachable `speaking` via `response.output_audio_transcript.delta` | `voice-conversation.tsx:214-224` | MATCH — in the existing `transport_event` handler |
| ~5 s fallback out of `processing` | `voice-conversation.tsx:281-285`, cleared at `:194`, `:222`, `:303` | MATCH — all three clear sites present |
| Prompt: no teaching, 1–2 sentences + one question, narrow rescue, A2 rewrite | `instructions.ts:38-45`, `:53`, `:11` | MATCH |

Plan guarantees upheld: `session.sendMessage()` not used; no `ConversationState` member added or renamed; `STATE_LABELS` texts unchanged; countdown logic and `SESSION_SECONDS` untouched.

Edge paths traced and correctly guarded: session ended within the fallback window (`stateRef` guard), retry via `attempt` (effect cleanup), React StrictMode double-invocation (`cancelled` flag), unmount (cleanup clears the timer). No leak, no double-arming.

## Findings

### F1 — A rule the plan's contract did not name was removed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/realtime/instructions.ts` (former line 37)
- **Detail**: The Phase 2 contract named only the "two or three sentences" rule for replacement. The implementation also removed "Keep the conversation flowing: react to what the user says and ask natural follow-up questions related to the topic". The effect is beneficial: "ask natural follow-up questionS" (plural) would have contradicted the new "ask exactly ONE question" rule. Its content is absorbed by "Each turn: react briefly to what the user said, then ask exactly ONE question", and topic adherence is still covered by the separate "Stay on the topic above" rule.
- **Fix**: Nothing to change in code — the removal prevented a contradiction. Optionally record it in the Phase 2 contract so a future reader does not read it as an accidental loss.
- **Decision**: PENDING

### F2 — Fallback can briefly show "Słucham" on a slow opening

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/components/voice-conversation.tsx:281-285`
- **Detail**: The timer fires after 5 s in `processing`. Two benign scenarios trigger it: (a) the greeting's first token arrives later than 5 s — the label jumps to "Słucham — mów śmiało" and the tutor starts speaking shortly after, so an invited learner may talk over it; (b) the learner spoke during the opening window, `speech_stopped` returned the state to `processing`, and the model takes longer than the remaining window. Both self-correct via `agent_start` → `processing`. Post-expiry behaviour is identical to pre-S-07, so this is degradation to a safe state, not a defect. The 5 s threshold is already recorded in the plan and brief as an unmeasured blind spot.
- **Fix**: Leave as is. If (a) shows up in practice, raising the threshold is cheaper than complicating the condition — measure real first-token latency before changing anything.
- **Decision**: PENDING

### F3 — `audio_start` handler is now dead code on WebRTC

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/voice-conversation.tsx:195`
- **Detail**: Two handlers now set `speaking`: `audio_start` (never fires on WebRTC — `RealtimeSession` emits it from the transport's `audio` event, which only the WebSocket transport emits) and the new `response.output_audio_transcript.delta` branch. The plan explicitly required keeping the former as the correct signal should the transport ever change to WebSocket, and an in-code comment explains it, so this is not accidental duplication.
- **Fix**: Leave unchanged.
- **Decision**: PENDING

### F4 — Speaking label clears at `audio_done`, not at end of playback

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/voice-conversation.tsx:199`
- **Detail**: `audio_stopped` → `listening` fires on `response.output_audio.done`, and `_afterAudioDoneEvent()` defers nothing on WebRTC (`openaiRealtimeWebRtc.mjs:394`) — i.e. it fires when the model finished *sending* audio, not when the learner finished hearing it. "Rozmówca odpowiada…" can therefore clear slightly before silence. The discrepancy predates S-07 (the transition was invisible while `speaking` was dead); plan-review F1 merely made it visible. Manually verified as acceptable (criterion 1.4).
- **Fix**: Leave as is. Closing the gap would require tracking audio-element events, which is outside this change.
- **Decision**: PENDING

### F5 — Commit carries artifacts from another lesson

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit `36d5487`
- **Detail**: `CLAUDE.md`, `.claude/.10x-cli-manifest.json` and `.claude/skills/10x-test-plan/` (1109 lines) landed with Phase 1 — m3l1 course artifacts, not S-07. The user chose "Stage all" deliberately after being shown the contents, and the fact is documented in the PR #21 body. The dimension takes a WARNING because this is formally an out-of-plan change; the finding itself is closed by the user's decision.
- **Fix**: Nothing to do — PR merged, decision recorded.
- **Decision**: ACCEPTED — authorized by the user during the Phase 1 commit ritual.
