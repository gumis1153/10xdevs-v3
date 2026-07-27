<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Conversation Flow Tuning

- **Plan**: `context/changes/conversation-flow-tuning/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-27
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 1 critical, 4 warnings, 1 observation — all fixed in the plan

## Verdicts

| Dimension | Verdict | After fixes |
|-----------|---------|-------------|
| End-State Alignment | WARNING | PASS |
| Lean Execution | PASS | PASS |
| Architectural Fitness | PASS | PASS |
| Blind Spots | WARNING | PASS |
| Plan Completeness | FAIL | PASS |

## Grounding

4/4 paths ✓, 3/3 archive references ✓, symbols ✓, brief↔plan ✓, Progress↔Phase 2/2 phases and 20/20 criteria mapped ✓ (now 22/22).

## Findings

### F1 — Manual criterion 1.4 checks a state that cannot occur

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness / End-State Alignment
- **Location**: Phase 1, manual criterion 1.4
- **Detail**: The `speaking` state is set only by the `audio_start` handler (`voice-conversation.tsx:179`), and `RealtimeSession` emits `audio_start` only on the transport's `audio` event (`realtimeSession.mjs:576-580`), which is emitted **only by the WebSocket transport** (`openaiRealtimeWebsocket.mjs:85`). WebRTC plays audio over the media track and never fires it, so "Rozmówca odpowiada…" is unreachable and the orb never enters its speaking state (`session-start.tsx:16-18`). Pre-existing since S-03, but S-07 moves the defect into the first 10–15 s of every session, against FR-008.
- **Fix A**: Correct the criterion only; report the defect separately.
  - Strength: Keeps the scope chosen during planning; zero risk to the S-03 state machine.
  - Tradeoff: S-07's first impression stays inconsistent with FR-008.
  - Confidence: HIGH — unreachability confirmed in SDK sources.
  - Blind spot: Not checked whether S-03 made this choice deliberately.
- **Fix B ⭐ Recommended**: Map `speaking` from `response.output_audio_transcript.delta` in the existing `transport_event` handler and correct the criterion.
  - Strength: 3 lines in a handler that already exists (`voice-conversation.tsx:190-196`); restores FR-008 exactly where S-07 needs it most.
  - Tradeoff: Touches the S-03 state machine — the plan's own headline regression risk.
  - Confidence: MED — the event definitely arrives over the data channel, but its timing versus actual playback start was not measured.
  - Blind spot: `audio_start` remains in the code as a dead handler.
- **Decision**: FIXED via Fix B — new change entry "Reachable `speaking` state" in Phase 1; criterion 1.4 rewritten; Key Discoveries and "What We're NOT Doing" updated.

### F2 — New stuck state: `processing` with no escape

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 + Critical Implementation Details (State sequencing)
- **Detail**: Moving the post-connect state from `listening` to `processing` creates a failure path the plan did not describe. If the opening response never arrives, no `turn_started` / `audio_done` / `turn_done` follows, `session.on('error')` only logs (`voice-conversation.tsx:185-187`), and the learner watches "Chwila namysłu…" for the full 3:00 with the clock running. Before the change the same failure was harmless — the learner saw "Słucham — mów śmiało" and could start on their own.
- **Fix A ⭐ Recommended**: ~5 s timer without `agent_start` falls back to `listening`.
  - Strength: Preserves the product decision (tutor opens) and closes the error path; ~6 lines, and the file already has timer patterns.
  - Tradeoff: One more timer to clean up in the connect effect.
  - Confidence: HIGH — closes exactly the state that can hang.
  - Blind spot: The 5 s threshold was not measured against real Realtime latency.
- **Fix B**: Do not set `processing`; leave `listening` and let `agent_start` switch it.
  - Strength: Removes the class of problem rather than handling it; no new code.
  - Tradeoff: For ~0.5–1.5 s the learner sees the exact invitation-to-speak S-07 set out to remove.
  - Confidence: HIGH — no change means no new risk.
  - Blind spot: The real length of that window is unknown.
- **Decision**: FIXED via Fix A — new change entry "Fallback out of the opening `processing` state" in Phase 1; criterion 1.8 added; State sequencing section rewritten.

### F3 — `grep -c` in criteria 2.3 and 2.4 exits with code 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, automated criteria 2.3 and 2.4
- **Detail**: Verified locally: `grep -c` with no match prints "0" and exits 1. After Phase 2 both patterns are gone, so a command that should PASS reports failure and `/10x-implement` reads the step as failed.
- **Fix**: Replace both with `! grep -q "<pattern>" src/lib/realtime/instructions.ts`.
- **Decision**: FIXED — both criteria and their Progress entries updated; the Testing Strategy note explains why.

### F4 — Criterion 1.7 is unverifiable on a greeting-only session

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, manual criterion 1.7
- **Detail**: The `insufficient_material` branch returns before the archive insert (`api/report/route.ts:76-84` vs `146`), and the `insufficient` screen ignores `transcriptLines` (`session-report.tsx:56-75`). A session ended after the greeting leaves no transcript to inspect anywhere.
- **Fix**: Move the check to a full session in Phase 2 and sharpen it: the first line of the archived transcript is `Tutor:`, not `Learner:`.
- **Decision**: FIXED — 1.7 removed from Phase 1, new criterion 2.10 added in Phase 2; the edge-case testing step notes why no transcript exists on that path.

### F5 — The greeting is the first audio playback; no Safari iOS verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, Manual Verification
- **Detail**: After the change, the first playback happens immediately after connect with no preceding learner speech; the SDK creates the audio element with `autoplay = true`. The topic-card tap gesture is preserved deliberately for Safari (`session-start.tsx:24`), but until now the first playback followed learner speech. If Safari iOS blocks autoplay the greeting fails silently — on the platform roadmap S-03 flags as weakest. The plan verified desktop preview only.
- **Fix**: Add a Phase 1 manual criterion: the greeting is **audible** on Safari iOS (mobile web) after tapping a topic card.
  - Strength: Closes the cross-browser NFR and the known S-03 Unknown exactly where this change raises risk.
  - Tradeoff: Needs an iOS device to test the preview.
  - Confidence: MED — the gesture chain is intact, so it may simply work; unverified on hardware.
  - Blind spot: Autoplay behaviour with an active microphone track is often more permissive — not confirmed.
- **Decision**: FIXED — criterion 1.9 added, testing step 3 added, risk recorded in the brief.

### F6 — Criterion 2.9 cannot fail

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2, manual criterion 2.9
- **Detail**: "No flagged error quotes a tutor turn" is guaranteed by the server-side grounding gate (`api/report/route.ts:126-131`), which filters every quote to the learner corpus. The criterion verifies S-04, not this change. Note this does **not** invalidate the plan's warning against `sendMessage()`: an injected user item would be part of `learnerCorpus` and would pass the gate.
- **Fix**: Reduce 2.9 to "the report renders for both sessions".
- **Decision**: FIXED — 2.9 reduced; the fake-turn protection now lives in 2.10 (see F4). The `sendMessage()` caveat was added to Key Discoveries so the reasoning is not lost.
