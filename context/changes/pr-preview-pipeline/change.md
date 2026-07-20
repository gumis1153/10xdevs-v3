---
change_id: pr-preview-pipeline
title: Podpięcie delivery pipeline: Git → auto-deploy + preview per PR
status: implemented
created: 2026-07-18
updated: 2026-07-20
archived_at: null
---

## Notes

@context/foundation/roadmap.md Zaczynajmy

Roadmap item: F-01 (foundation, Stream C — Delivery). Outcome: merge do `master` buduje produkcję automatycznie, każdy PR dostaje preview URL.

- Roadmap marks F-01 as `blocked` on a human gate: zgoda na `vercel git connect` + branch protection na `master` (rejestr bramek w `context/deployment/deploy-plan.md`, krok 1). Owner: user — starting this change implies the user is ready to execute that gate within the change.
- Unlocks: ścieżka weryfikacji (preview per PR) dla S-01–S-06; punkt egzekwowania MERGE-GATE dla S-03.
