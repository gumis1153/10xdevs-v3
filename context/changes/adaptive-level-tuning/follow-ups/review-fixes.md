# Follow-ups from the implementation review

> Source: `context/changes/adaptive-level-tuning/reviews/impl-review.md` (2026-07-26).
> Both items were triaged as hand-offs to **S-07 (`conversation-flow-tuning`)**, which owns
> the conversation-flow rules S-06 promised to leave verbatim.

## From F1 — length dimension is inert in S-06

`src/lib/realtime/instructions.ts:46` states that the pre-existing "two or three sentences"
budget always wins over the per-band targets. Measured consequence (`verification.md`): tutor
sentence length was 12.5 words for an A2-graded learner and 12.4 for a B2-graded one — no
differentiation at all, while question type and vocabulary register did differentiate.

**For S-07**: the turn budget and the per-band sentence-length target are in direct tension.
When S-07 rewrites talk-time distribution, decide explicitly which one governs sentence length.
The candidate fix is to scope the budget to sentence *count* while letting per-band sentence
length and vocabulary stand. `verification.md` is the baseline to regress against, and S-06's
reserved tuning round was never spent.

## From F4 — unauthorised live language-help offer

Archived scenario (a) (`c92e20f3-fa87-4968-9ffa-8bf7a0a97207`) ends with the tutor saying:

> "If you like, try saying that in English and I'll help you keep it smooth."

The learner was speaking English at the time. `instructions.ts:34` authorises encouraging
English only when the user speaks **Polish**; `:35` forbids correcting language mistakes during
the conversation. This is neither a level leak nor a correction, but it is an unprompted offer
of live language coaching — and S-06's A2 instruction ("wait several seconds, then offer the
missing word or rephrase more simply") plausibly widened the opening for it.

**For S-07**: when reworking correction balance, either authorise this behaviour explicitly or
close it. If the A2 scaffolding stays, scope it to supplying a missing word rather than
coaching how the learner delivers a sentence.
