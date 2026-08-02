<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: README Project Overview

- **Plan**: `context/changes/readme-project-overview/plan.md`
- **Scope**: Phase 1–2 of 2 (full plan; all 19 Progress items `[x]`)
- **Date**: 2026-08-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations
- **Git scope**: `73098c2` (p1), `3a664d5` (p2), `54b78e5` (epilogue) — merged as PR #24 (`6779457`) into `origin/master`

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence — success criteria re-run on 2026-08-02

| Kryterium | Wynik |
|---|---|
| 1.1 `npm run lint` | PASS — „ESLint: No issues found" |
| 1.2 `npm run build` | PASS — 8 route'ów + `ƒ Proxy (Middleware)` |
| 1.3 grep boilerplate | PASS — 0 trafień |
| 1.4 grep sekretów (`sk-`\|`eyJ`\|`GOCSPX-`) | PASS — 0 trafień |
| 1.5 nazwy zmiennych istnieją w `.env.example`/kodzie | PASS — 5/5 (agent weryfikacyjny) |
| 1.6 komendy `npm run <x>` istnieją w `package.json` | PASS — README używa tylko `npm run dev`; patrz F1 dla twierdzenia negatywnego |
| 1.7 linki relatywne | PASS — 13/13 plików istnieje; 2 „dead" trafienia to anchory `#zmienne-środowiskowe` / `#google-oauth-logowanie`, oba mają odpowiadające nagłówki |
| 1.8 `english-talk` + URL produkcji | PASS — 3 wystąpienia nazwy, 1 URL |
| 2.1–2.3 cykl Supabase / `db reset` / dev server | NOT RE-RUN — lokalny stack zgaszony (brak kontenera `supabase_db_english-talk`); patrz F4 |
| 2.4 `npm run lint` po fazie 2 | PASS (jak 1.1) |
| 1.9–1.11, 2.5–2.8 (manual) | Evidence obecne w diffie — patrz F4 |

## Findings

### F1 — README twierdzi, że projekt nie ma frameworka testowego

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability of instructions)
- **Location**: README.md:95-96
- **Detail**: README mówi: „Dostępne skrypty npm: `dev`, `build`, `start`, `lint`. Projekt nie ma jeszcze frameworka testowego — skryptu `test` nie znajdziesz." W chwili pisania (`73098c2`) było to prawdą i plan wprost tego wymagał („README nie może obiecywać testów", plan.md:70,192). Dziś jest fałszem: `package.json` ma `test: vitest` i `test:run: vitest run` (commit `298508a`, zmiana `testing-session-lifecycle`), a `npm run test:run` przechodzi 11 testów w 2 plikach. README sprzeczne z `AGENTS.md` §Testing Guidelines. Źródłem rozjazdu jest późniejszy commit, nie ta zmiana — ale README jest bramką wejścia do repo, więc recenzent czytający tylko README uzna, że projekt nie ma testów.
- **Fix A ⭐ Recommended**: Zostaw naprawę slice'owi **S-11 `readme-testing-sync`** (`roadmap.md:219`, status `not started`), który już opisuje dokładnie ten rozjazd wraz z guardrailem „linkuj, nie kopiuj".
  - Strength: Poprawka README wymaga branch + PR (lesson „nigdy nie commituj na master"), a S-11 grupuje ją z dwoma pokrewnymi drobiazgami (F2 i F3) w jednym przejściu zamiast trzech mikro-PR-ów.
  - Tradeoff: README pozostaje nieprawdziwe do czasu wykonania S-11 — jeśli recenzja zewnętrzna wypada wcześniej, kosztuje to kryterium „projekt ma testy".
  - Confidence: HIGH — slice istnieje, ma spisany zakres i prerequisite S-10 spełniony.
  - Blind spot: Nie wiadomo, kiedy S-11 wejdzie do realizacji; jeśli nigdy, rozjazd zostaje.
- **Fix B**: Popraw teraz — dwa zdania w README.md:95-96 na `npm test` (watch) / `npm run test:run` (bramka) + link do `context/foundation/test-plan.md`, na osobnym branchu i PR-em.
  - Strength: README przestaje kłamić natychmiast; zmiana jest dosłownie dwuwierszowa i nie ma ryzyka technicznego.
  - Tradeoff: Otwiera PR poza rytuałem plasterków i wydrąża S-11 (trzeba go wtedy zamknąć albo przepisać na resztki: `test-plan.md` w liście dokumentacji, zakres `S-01…S-11`).
  - Confidence: HIGH — treść poprawki jest znana, komendy zweryfikowane (`npm run test:run` → 11 passed).
  - Blind spot: Nie sprawdzono, czy S-11 nie miał wejść w paczce z innymi zmianami dokumentacji.
- **Decision**: DEFERRED via Fix A — delegowane do slice'a **S-11 `readme-testing-sync`**; zakres dopisany w `roadmap.md` 2026-08-02 (sekcja „Dodatkowy zakres"). README pozostaje nieprawdziwe do wykonania S-11 — świadomie przyjęte.

### F2 — Lista „Dokumentacja projektu" rozjechała się z zawartością `context/foundation/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: README.md:143-157
- **Detail**: Sekcja zawiera jeden link **poza** kontraktem planu (Contract 5 wymieniał 7 pozycji: `prd.md`, `roadmap.md`, `tech-stack.md`, `infrastructure.md`, `deploy-plan.md`, `context/archive/`, `AGENTS.md`) — dodano `context/foundation/lessons.md` (README.md:151-152). Dodatek jest nieszkodliwy i spójny z intencją sekcji. Jednocześnie lista **pomija** `context/foundation/test-plan.md` (24 KB, strategia testów) oraz `shape-notes.md`, mimo że opisuje się jako komplet dokumentów foundation, a opis roadmapy mówi „plasterki (`S-01`…`S-10`)" — dziś jest ich 11.
- **Fix**: Dopisać `context/foundation/test-plan.md` do listy i zaktualizować zakres plasterków na `S-01…S-11`; link do `lessons.md` zostawić (EXTRA zaakceptowany post factum). Naturalne miejsce: S-11.
- **Decision**: DEFERRED — dopisane do zakresu S-11 (`roadmap.md`, „Dodatkowy zakres", F2). Link do `lessons.md` zaakceptowany post factum i zostaje.

### F3 — `npx supabase db reset` bez ostrzeżenia o utracie lokalnych danych

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: README.md:87-88
- **Detail**: Krok 6 quickstartu to „`npx supabase db reset` — aplikuje migracje od zera", bez informacji, że komenda **kasuje i odtwarza** lokalną bazę. Przy pierwszym setupie to bez znaczenia (nie ma czego stracić), ale ten sam krok czyta wracający użytkownik z sesjami w lokalnym archiwum. Weryfikacja ryzyka zdalnego: repo **jest** podlinkowane do zdalnego projektu Supabase (`supabase/.temp/project-ref`, katalog gitignorowany), ale README nigdzie nie używa `--linked`, więc komenda w spisanej formie nie może dosięgnąć produkcyjnej bazy — dlatego OBSERVATION, nie CRITICAL.
- **Fix**: Dopisać pół zdania: „kasuje lokalną bazę i aplikuje migracje od zera — lokalne sesje przepadają".
- **Decision**: DEFERRED — dopisane do zakresu S-11 (`roadmap.md`, „Dodatkowy zakres", F3).

### F4 — Kryteria automatyczne Fazy 2 nieodtwarzalne w tej recenzji

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md:386-389 (Progress 2.1–2.3)
- **Detail**: `npx supabase status` zwraca „No such container: supabase_db_english-talk" — lokalny stack jest zgaszony, więc 2.1 (`stop && start`), 2.2 (`db reset`) i 2.3 (dev server) nie zostały niezależnie powtórzone; `db reset` jest destrukcyjny i nie uruchamiam go bez zgody. Nie jest to jednak rubber-stamping: diff Fazy 2 (`3a664d5`) zawiera obserwowalny dowód realnego smoke testu — dopisanie `npx supabase status` do kroku 3 i przepisanie pułapki na kluczach z legacy `ANON_KEY` na `PUBLISHABLE_KEY`. Takich korekt nie da się wyprodukować z czytania dokumentacji; wynikają z patrzenia na wyjście CLI. Manualne 2.5–2.8 mają to samo pokrycie dowodowe.
- **Fix**: Brak akcji — przyjąć dowód z diffu; przy ewentualnej ponownej weryfikacji odpalić `npx supabase start` i powtórzyć 2.1–2.3.
- **Decision**: SKIPPED — 2.1–2.3 nie były powtarzane w tej recenzji; obserwacja zostaje otwarta, `db reset` nieuruchamiany.

### F5 — Zmiana zmergowana, ale nie zarchiwizowana — roadmapa pokazuje S-10 jako `not started`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:42,216 · context/changes/readme-project-overview/
- **Detail**: `change.md` ma `status: implemented`, epilog domknięty (`54b78e5`), PR #24 w `origin/master` — ale folder zmiany nadal żyje w `context/changes/`, w `context/archive/` nie ma wpisu `*-readme-project-overview` (ostatni: `2026-07-26-conversation-flow-tuning`), S-10 ma `Status: not started` w tabeli i w sekcji slice'a, a `## Done` nie ma wpisu S-10. Plan celowo oddał flip statusu rytuałowi zamknięcia (plan.md:93-94) — więc to nie naruszenie planu, tylko niewykonany krok po nim. Ten sam rozjazd dotyczy zmiany `testing-session-lifecycle` (PR #25, też zmergowany, też w `context/changes/`). Uwaga operacyjna: lokalny `master` jest 12 commitów za `origin/master`.
- **Fix**: `git checkout master && git pull`, potem `/10x-archive readme-project-overview` (i osobno `testing-session-lifecycle`) — to przenosi folder do `context/archive/` i flipuje S-10 na `done` wraz z wpisem w `## Done`.
- **Decision**: SKIPPED — użytkownik wykonuje pull i `/10x-archive` samodzielnie; nic nie ruszane w gitcie przez recenzję.

## Triage — 2026-08-02

| Finding | Decyzja |
|---|---|
| F1 | DEFERRED → S-11 `readme-testing-sync` (Fix A) |
| F2 | DEFERRED → S-11 (zakres dopisany) |
| F3 | DEFERRED → S-11 (zakres dopisany) |
| F4 | SKIPPED — obserwacja otwarta |
| F5 | SKIPPED — archiwizacja po stronie użytkownika |

Jedyna zmiana na dysku z tego triage'u: sekcja „Dodatkowy zakres" w `context/foundation/roadmap.md` §S-11. README **nie** był modyfikowany.
