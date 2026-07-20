<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Delivery Pipeline (Git → auto-deploy + preview per PR)

- **Plan**: context/changes/pr-preview-pipeline/plan.md
- **Mode**: Deep
- **Date**: 2026-07-18
- **Verdict**: SOUND (po triage 2026-07-19; pierwotnie REVISE)
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

7/7 ścieżek ✓, symbole ✓ („There is no CI gate" w AGENTS.md, MERGE-GATE i linie 19/21/53-68/81/95 w deploy-plan.md), brief↔plan ✓. Zweryfikowane na żywo: `vercel curl` istnieje w CLI 56.2.0 (beta; składnia `vercel curl <ścieżka> --deployment <ID|URL>`, jest też `--protection-bypass`); `vercel api /v9/projects/…` → `link: null` przed podłączeniem Gita; repo `private: true`, konto typu User.

## Findings

### F1 — Pre-check „production branch = master" jest niewykonalny przed connect

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — Verify platform assumptions (plan.md, „Verify platform assumptions" + kryterium w Fazie 1)
- **Detail**: Faza 1 każe zweryfikować ustawienie production branch projektu Vercel i „zatrzymać zmianę" przy niezgodności. Zweryfikowano przez `vercel api`: przed `vercel git connect` projekt ma `link: null` — ustawienie nie istnieje, check jest niewykonalny w Fazie 1. „Stop" to również zła remediacja dla zwykłego ustawienia projektu.
- **Fix**: Przenieść weryfikację production branch do Fazy 2 (bezpośrednio po `vercel git connect`, w Contract kroku 2.1) i zamienić „mismatch stops the change" na remediację: ustawić `master` przez API/dashboard, jeśli po connect ustawienie jest inne.
- **Decision**: FIXED (2026-07-19)

### F2 — Aktualizacja docs (Faza 3.4) nie ma ścieżki lądowania po włączeniu ochrony

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny tradeoff; warto się zatrzymać
- **Dimension**: End-State Alignment / Plan Completeness
- **Location**: Faza 3 — Update operational docs
- **Detail**: Po Fazie 2 `master` wymaga PR-ów (decyzja „everything via PR"), a Faza 3.4 edytuje `context/deployment/deploy-plan.md` i `AGENTS.md`, nie mówiąc, jak te edycje trafią na master. Po merge'u testowego PR-a nie da się ich wypchnąć bezpośrednio — implementer utknie albo złamie świeżo włączoną zasadę.
- **Fix A ⭐ Recommended**: Włożyć aktualizacje docs do testowego PR-a (docs-only diff = treść testowego PR-a).
  - Strength: Jeden PR zamiast dwóch; testowy PR przestaje być „pusty", pozostając zero-risk.
  - Tradeoff: Docs opisują stan „pipeline proven" zanim merge to udowodni; przy porażce merge'a poprawiamy forward.
  - Confidence: HIGH — diff docs-only nie może zepsuć builda.
  - Blind spot: Kryterium 3.8 (docs accurate) weryfikować po merge'u, nie przy pisaniu.
- **Fix B**: Osobny PR na docs po zakończonej weryfikacji pipeline'u.
  - Strength: Docs opisują już udowodniony stan; czysta kolejność przyczynowo-skutkowa.
  - Tradeoff: Drugi PR + drugi prod deploy dla czystej biurokracji; wydłuża fazę.
  - Confidence: HIGH — mechanicznie zawsze zadziała.
  - Blind spot: Brak istotnych.
- **Decision**: FIXED via Fix A (2026-07-19)

### F3 — Błędna składnia `vercel curl` w kryteriach

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Faza 3, kryterium 3.1 + Contract kroku „Test PR: preview verification"
- **Detail**: Plan pisze `vercel curl <preview-url>`. W CLI 56.2.0 (beta) składnia to `vercel curl <ścieżka> --deployment <ID|URL>`; pełny URL jako argument nie zadziała.
- **Fix**: Poprawić na `vercel curl / --deployment <preview-url>` w kryterium 3.1 i w Contract kroku 3.1 (oraz w Progress 3.1).
- **Decision**: FIXED (2026-07-19)

### F4 — Furtka „deferral" pozwala zaliczyć Fazę 2 bez osiągnięcia end state

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: End-State Alignment
- **Location**: Desired End State ↔ kryterium 2.2
- **Detail**: Kryterium 2.2 przechodzi także przez „deferral recorded", ale Desired End State bezwarunkowo obiecuje ochronę mastera. Furtka jest celowa (user może wstrzymać flip na public przy wykonaniu), lecz rozjazd między sekcjami może zmylić implementera.
- **Fix**: Dopisać w Desired End State zdanie o wariancie odroczonym („…lub ochrona jawnie odroczona decyzją usera, odnotowana w change.md").
- **Decision**: FIXED (2026-07-19)
