# Vercel Build Test Gate — Plan Brief

> Full plan: `context/changes/vercel-build-test-gate/plan.md`

## What & Why

Testy jednostkowe/komponentowe biegają dziś wyłącznie lokalnie — ich uruchomienie zależy od
pamięci developera. Ta zmiana wplata `npm run test:run` w build Vercela przed `next build`,
więc czerwony suite kończy build błędem, ustawia required status check `Vercel` na FAILURE
i blokuje merge do `master` (a także deploy produkcyjny). 11 testów, które faza 1 rolloutu
napisała pod ryzyko #1 (teardown sesji — jedyny realnie przeżyty incydent w tym projekcie),
przestaje być dobrowolne.

## Starting Point

Jedyne CI w projekcie to build preview Vercela — nie ma katalogu `.github`, mimo że
`tech-stack.md` deklaruje `ci_provider: github-actions`. Ruleset `protect-master` **już**
wymaga status checka o kontekście `Vercel` (potwierdzone na PR #27), a `vercel.ts` istnieje
i zawiera tylko `regions: ['fra1']`. Dashboard nie ma override'u Build Command. Czyli:
łańcuch egzekucji merge'a jest gotowy — brakuje wyłącznie tego, żeby build umiał paść
z powodu testów.

## Desired End State

Otwarcie PR-a z padającym testem daje czerwony check `Vercel` i zablokowany merge —
udowodnione empirycznie, nie założone. Log builda pokazuje output Vitesta przed
kompilacją Next.js. `npm run test:run` daje ten sam wynik lokalnie i na Vercelu, mimo
`NODE_ENV=production` w buildzie. Trzy dokumenty (`test-plan.md`, `README.md`, `AGENTS.md`)
opisują bramkę zgodnie z tym, co faktycznie biega.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Mechanizm bramki | `buildCommand: 'npm run test:run && npm run build'` w `vercel.ts` | Konfiguracja platformy w jednym typowanym, wersjonowanym pliku, który projekt już ma; widoczna w diffie PR-a. Testy przed buildem, żeby czerwony suite nie płacił za kompilację. |
| Naprawa `NODE_ENV` | `process.env.NODE_ENV = 'test'` w `vitest.config.mts` | Działa przy każdym wywołaniu i w każdym systemie, więc przeniesie się na fazy 2–4 rolloutu bez powtarzania naprawy. Wariant `resolve.conditions` sprawdzony i nie działa. |
| Zakres bramki | Tylko testy; lint zostaje lokalny | Jedna zmienna na raz — dodanie lintu wciągnęłoby zmianę w sprzątanie istniejących ostrzeżeń ESLinta i zmieszało dwa niezależne powody czerwonego builda. |
| Deploy produkcyjny | Bramka obowiązuje też na produkcji | Nie ma być ścieżki, którą nieprzetestowany kod trafia na produkcję — także przy re-deployu wcześniejszego commita. Warunkowanie na `VERCEL_ENV` to logika w konfiguracji bez nowego sygnału. |
| Dowód blokowania | Celowo czerwony test na PR-ze, potem revert | Zielone preview dowodzi tylko, że testy się odpaliły. Blokowanie merge'a to osobne twierdzenie i wymaga osobnego dowodu. |
| Zakres doc-sync | `test-plan.md` §5+§3, README §Testy, AGENTS.md §Commit & PR | `§3` jest czytane przez orkiestrator `/10x-test-plan` jako stan; README to pierwsze miejsce, gdzie ktoś sprawdza „co musi przejść"; AGENTS.md to kontrakt czytany przez agenta na starcie. |

## Scope

**In scope:**
- `buildCommand` w `vercel.ts`
- Guard `NODE_ENV` w `vitest.config.mts` (z komentarzem)
- Empiryczny dowód, że czerwony suite blokuje merge
- Synchronizacja `test-plan.md` §5 i §3, `README.md` §Testy, `AGENTS.md` §Commit & PR

**Out of scope:**
- Lint w bramce (notka „ESLint does not run in CI" **zostaje**)
- Workflow GitHub Actions
- Warunkowanie bramki na `VERCEL_ENV`
- Pozostałe elementy §3 Phase 5 (post-edit hook, przegląd multimodalny) — zostają `not started`
- Nowe testy, nowe skrypty npm, ustawienia w dashboardzie Vercela
- Komentarz uzasadniający w `vercel.ts`

## Architecture / Approach

```
PR → Vercel build
       └─ npm run test:run   ← vitest.config.mts wymusza NODE_ENV=test
            ├─ ❌ → build FAIL → check `Vercel` FAILURE → ruleset protect-master blokuje merge
            └─ ✅ → npm run build (next build, typecheck) → preview URL
```

Bramka to dwie linie kodu. Właściwą pracą planu jest dowód i dokumentacja — bramka,
o której nie wiadomo, że blokuje, jest tylko dodatkowym krokiem w buildzie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Bramka + guard NODE_ENV | `buildCommand` + guard w jednym commicie; zielony preview z Vitestem w logu | Guard w innym commicie niż `buildCommand` → czerwony build z mylącą przyczyną |
| 2. Dowód, że bramka blokuje | Czerwony check `Vercel`, zablokowany merge, revert | Check `Vercel` raportuje się, ale merge nie jest blokowany (kontekst checka nie pokrywa się z rulesetem) |
| 3. Synchronizacja dokumentów | `test-plan.md` §5+§3, README, AGENTS.md | Przypadkowe usunięcie notki o ESLincie → konflikt `AGENTS.md` z `§5` |

**Prerequisites:** faza 1 rolloutu z `test-plan.md §3` wylądowała (11 testów w 2 plikach —
`context/archive/2026-07-29-testing-session-lifecycle/`); ruleset `protect-master` z
required checkiem `Vercel` jest aktywny; brak override'u Build Command w dashboardzie.

**Estimated effort:** ~1 sesja; 3 commity na jednym branchu + PR (fazy 1 i 3 po jednym
commicie, faza 2 dodaje commit dowodowy i revert).

## Open Risks & Assumptions

- **Założenie zweryfikowane lokalnie, nie na Vercelu**: że build Vercela ustawia
  `NODE_ENV=production`. Guard jest nieszkodliwy, gdyby było inaczej, ale to faza 1
  potwierdza go na realnym logu builda.
- **devDependencies w buildzie** — dowód jest pośredni (`next build` robi typecheck, a
  `typescript` żyje w devDependencies i build przechodzi dziś na produkcji). Gdyby jednak
  `vitest` nie był dostępny, wyjdzie to w pierwszym buildzie fazy 1.
- **Kolejność vs `test-plan.md §3`** — to wycinek Phase 5 wykonany przed fazami 2–4.
  Obronne, bo po fazie 1 jest co bramkować, ale rozjeżdża numerację; faza 3 zapisuje to
  jako adnotację, nie jako zamknięcie Phase 5.
- **Ten sam `buildCommand` przestanie być darmowy w fazach 3–4** rolloutu (integration na
  lokalnym stacku Supabase, e2e w Playwright). Integration wymagająca bazy w kontenerze
  builda może się okazać w tym miejscu niewykonalna — decyzja dla tamtych faz.
- **Flaky test zablokuje deploy produkcyjny.** Wyjście awaryjne: rollback do poprzedniego
  deployu albo revert commitu — nie obejście bramki.

## Success Criteria (Summary)

- Nie da się zmergować PR-a z padającym testem — sprawdzone przez faktyczną próbę, nie przez założenie.
- `npm run test:run` zachowuje się identycznie lokalnie i w buildzie Vercela.
- Developer (lub agent) czytający README albo AGENTS.md wie, że testy są bramką merge'a.
