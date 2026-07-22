<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session Topic Proposal (S-02)

- **Plan**: context/changes/session-topic-proposal/plan.md
- **Scope**: Phase 2 of 2 (full plan)
- **Date**: 2026-07-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence summary

- Drift scan: 7/7 planned items MATCH (topics module, orb, globals.css keyframes, session-start client island, page wiring, PRD Q3 resolution, roadmap annotations). The plan's flagged remount hazard is correctly avoided — the orb is one persistent element outside the phase ternary (`src/components/session-start.tsx:22-29`).
- Automated criteria re-verified at review time: `npm run lint` → no issues; `npm run build` → compiled + TypeScript clean.
- Manual criteria: all `[x]` in Progress with SHA suffixes; observable evidence in diff (reduced-motion guard in globals.css, dark variants on card, aria-hidden orb) — no rubber-stamping indicators.

## Findings

### F1 — Blur animowany przez `transition-all` bez osłony reduced-motion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/session-start.tsx:24-26
- **Detail**: Wrapper przejścia faz używa `transition-all duration-700`, co animuje `blur-[2px]` → `blur-none`. Animacja `filter: blur` nie jest compositor-only (rasteryzacja per klatka) — odstępstwo od planowego ograniczenia "transform/opacity-only, GPU-friendly". Dodatkowo przejście nie jest objęte osłoną `prefers-reduced-motion` z globals.css (ta wyłącza tylko keyframes orba) — użytkownicy z reduced motion nadal dostają 700 ms animacji. Ciągła animacja idle orba jest w pełni zgodna z planem; dotyczy to wyłącznie jednorazowego przejścia faz.
- **Fix**: Zamień `transition-all` na `transition-[transform,opacity]` (blur przełącza się bez animacji) i dodaj `motion-reduce:transition-none`.
- **Decision**: SKIPPED (2026-07-22) — poprawka początkowo zastosowana, następnie wycofana na życzenie użytkownika; kod pozostaje z `transition-all`.

### F2 — Pliki tooling kursu 10x-cli w commicie feature (zadeklarowane)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: commit 785a915 (CLAUDE.md, .claude/.10x-cli-manifest.json, .claude/skills/10x-impl-review/SKILL.md)
- **Detail**: Commit fazy 1 niesie też aktualizację modułu kursu 10x-cli (m2l2 → m2l3, nowy skill 451 linii). Nie jest to stealth scope creep — commit message jawnie to deklaruje ("Also carries 10x-cli course-module updates staged on user request") i żadne nieplanowane zmiany nie dotknęły `src/`. Miesza jednak tooling z feature w jednym commicie.
- **Fix**: Nic do naprawy wstecz; na przyszłość trzymaj aktualizacje toolingu w osobnym commicie/PR.
- **Decision**: SKIPPED (2026-07-22) — przyjęte do wiadomości, zmiana była zadeklarowana.

### F3 — `drawTopic` typowany jako `Topic`, może zwrócić `undefined` przy pustej puli

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/topics.ts:74-77
- **Detail**: `pool[Math.floor(Math.random()*pool.length)]` przy pustej `pool` zwróciłoby `undefined` mimo typu `Topic`. Dziś nieosiągalne (10 stałych tematów, wykluczany max 1 → pula ≥ 9). Implementacja przez `filter` + pojedynczy indeks strukturalnie unika pętli nieskończonej z rejection-sampling.
- **Fix**: Bez zmian w tym plasterku; jeśli TOPICS kiedyś zmaleje do ≤1, dodaj fallback (`pool.length ? pool[...] : TOPICS[0]`).
- **Decision**: SKIPPED (2026-07-22) — nieosiągalne przy statycznej liście 10 tematów; wrócić, gdy lista stanie się dynamiczna.
