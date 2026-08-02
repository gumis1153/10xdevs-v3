# README — synchronizacja z warstwą testową — Plan Brief

> Full plan: `context/changes/readme-testing-sync/plan.md`

## What & Why

`README.md:95-96` twierdzi, że projekt nie ma frameworka testowego i że skryptu `test`
nie ma. Faza 1 rolloutu testów (`testing-session-lifecycle`, zmergowana 2026-07-29)
uczyniła to zdanie nieprawdziwym. README jest jedynym dokumentem w roocie, który wciąż
kłamie o stanie repo — `AGENTS.md` i `test-plan.md` opisują go poprawnie.

## Starting Point

W repo działa Vitest 4.1.10 z `jsdom` i `@testing-library/react`: skrypty `test` (watch)
i `test:run` (jeden przebieg), `vitest.config.mts`, `vitest.setup.ts`, dwa pliki testowe
położone obok jednostek, które pokrywają, oraz współdzielone fake'y w `src/test/fakes/`.
Mapa dokumentacji w README (sekcja „Dokumentacja projektu") nie wymienia
`context/foundation/test-plan.md`.

## Desired End State

Czytelnik README wie, że projekt ma testy, wie czym je uruchomić w trybie watch i jako
bramkę, wie gdzie położyć nowy test — a po strategię i wzorce idzie linkiem do
`test-plan.md`. Żadne zdanie w README nie przeczy stanowi repo.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Zakres zmiany | Tylko sekcja testowa README | `AGENTS.md` i `test-plan.md` §4/§6 zaktualizowała już faza 1 — szerszy zakres dublowałby zrobioną pracę |
| Miejsce w dokumencie | Nowa podsekcja `### Testy` w „Uruchomienie lokalne" | Sekcja używa już podsekcji h3 (`Kroki`, `Zmienne środowiskowe`, `Google OAuth`) — wpisuje się bez zmiany struktury i ma gdzie rosnąć przy fazach 2-5 |
| Głębokość opisu | Komendy + konwencja umiejscowienia + link | Reguła z S-10: parafrazuj i linkuj, nie kopiuj — kopiowanie stanu z `test-plan.md` wyprodukowałoby ten sam rozjazd, który naprawiamy |
| Białe plamy pokrycia | Nie wymieniamy ich w README | Lista brakujących warstw starzeje się przy każdej fazie rolloutu; nośnikiem jest `test-plan.md §3`/`§7`, do którego README linkuje |
| Poprzeczka weryfikacji | Realne uruchomienie komend + audyt ścieżek i linków | Ten sam próg co w S-10: uruchomienie łapie komendę, która nie działa, audyt łapie zmyślony fakt |
| Mapa dokumentacji | Dopisujemy `test-plan.md` po `lessons.md` | Dokument musi dać się znaleźć również czytelnikowi, który nie wszedł w sekcję o uruchamianiu |

## Scope

**In scope:** akapit o skryptach npm (`README.md:95-96`); nowa podsekcja `### Testy`;
wpis `test-plan.md` w mapie dokumentacji; bramka weryfikacyjna.

**Out of scope:** opis niepokrytych warstw i tabela statusów rolloutu; nazwy plików
testowych i wersje paczek; audyt świeżości pozostałych faktów w README (modele, adres
produkcji, OAuth); zmiany w `AGENTS.md`, `test-plan.md`, `package.json`,
`vitest.config.mts`, `context/foundation/*`; troubleshooting, screeny, wersja angielska.

## Architecture / Approach

Jedno przejście edytorskie po `README.md` z trzema punktami dotknięcia (akapit o skryptach
→ nowa podsekcja → mapa dokumentacji), pisane w jednym podejściu, bo README jest spójnym
dokumentem o jednym tonie. Po nim bramka złożona z dwóch niezależnych sprawdzeń:
uruchomienie komend i audyt ścieżek/linków — każde łapie inną klasę błędu.

## Phases at a Glance

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Podsekcja „Testy" + weryfikacja | README zgodny ze stanem repo: pełna lista skryptów, podsekcja o testach z linkiem do `test-plan.md`, wpis w mapie dokumentacji | Podsekcja urośnie w streszczenie `test-plan.md` — i za dwie fazy rolloutu README znowu będzie kłamał |

**Prerequisites:** brak — działający `npm install` wystarcza do uruchomienia suite'u.
**Estimated effort:** jedna krótka sesja, jedna faza.

## Open Risks & Assumptions

- **Ryzyko powtórki błędu**: każdy fakt wpisany do README zamiast zalinkowany jest
  kandydatem na kolejny rozjazd. Kontrola: żadnych wersji paczek, nazw plików testowych
  ani statusów faz w treści.
- **Świadoma luka**: README nie powie, że `npm run test:run` na zielono nie oznacza
  sprawdzonej ścieżki krytycznej (e2e, integracje route'ów i izolacja danych to fazy 2-4).
  Ciężar tej informacji niesie link do `test-plan.md`.
- **Założenie**: fazy 2-5 rolloutu, gdy wjadą, dopiszą się do tej samej podsekcji —
  dlatego jest podsekcją, a nie zdaniem w akapicie.

## Success Criteria (Summary)

- W README nie ma zdania przeczącego stanowi repo; lista skryptów npm zgadza się
  z `package.json`
- Czytelnik wie, co uruchomić (watch vs jeden przebieg) i gdzie położyć nowy test, bez
  otwierania `AGENTS.md`
- Każda komenda wypisana w README przechodzi, każda ścieżka i link wskazuje na istniejący
  plik
