# README — synchronizacja z warstwą testową Implementation Plan

## Overview

`README.md` twierdzi, że projekt nie ma frameworka testowego. Po fazie 1 rolloutu
testów (`testing-session-lifecycle`, zmergowane 2026-07-29) to zdanie jest nieprawdziwe:
w repo działa Vitest ze skryptami `test` / `test:run`, konfiguracją, setupem, katalogiem
współdzielonych fake'ów i dwoma plikami testowymi. Ta zmiana usuwa nieprawdę i dokłada
minimalną, odsyłającą do źródeł podsekcję o testach — bez powielania treści
`test-plan.md`.

## Current State Analysis

**Co README mówi dziś** (`README.md:95-96`, koniec sekcji „Uruchomienie lokalne"):

> Dostępne skrypty npm: `dev`, `build`, `start`, `lint`. Projekt nie ma jeszcze frameworka
> testowego — skryptu `test` nie znajdziesz.

**Co jest w repo naprawdę:**

- `package.json` — skrypty: `dev`, `build`, `start`, `lint`, `test` (`vitest`, tryb watch),
  `test:run` (`vitest run`, jeden przebieg).
- `vitest.config.mts` — środowisko `jsdom`, `globals: true`, `@vitejs/plugin-react`,
  `vite-tsconfig-paths` (alias `@/*`), `setupFiles: ['./vitest.setup.ts']`.
- `vitest.setup.ts` — matchery `@testing-library/jest-dom/vitest`.
- Testy leżą obok jednostek, którą pokrywają: `src/lib/realtime/transcript.test.ts`,
  `src/components/voice-conversation.test.tsx`.
- Współdzielone fake'y: `src/test/fakes/realtime-session.ts`.
- `context/foundation/test-plan.md` — strategia, mapa ryzyk, rollout (§3), stack (§4),
  bramki (§5), cookbook (§6, wypełniany fazami).
- `AGENTS.md:31` i `AGENTS.md:42` opisują już ten sam stan dla agentów — README jest
  jedynym dokumentem w roocie, który wciąż kłamie.

**Druga luka:** mapa w sekcji „Dokumentacja projektu" (`README.md:143-157`) wymienia
`prd.md`, `roadmap.md`, `tech-stack.md`, `infrastructure.md`, `lessons.md`,
`deploy-plan.md`, `context/archive/` i `AGENTS.md` — brakuje w niej `test-plan.md`.

**Ograniczenie z S-10** (`context/archive/2026-07-29-readme-project-overview/plan-brief.md`):
zakres README to minimum czterech sekcji, treść parafrazowana i linkowana, nigdy
kopiowana ze źródeł — inaczej README rozjeżdża się przy kolejnym plasterku. Dokładnie ten
mechanizm wyprodukował obecny błąd, więc naprawa nie może go powielić.

## Desired End State

Czytelnik README wie, że projekt ma testy, wie jak je uruchomić (watch i jeden przebieg),
wie gdzie położyć nowy test i skąd wziąć wzorce — a szczegóły strategii znajduje
w `test-plan.md`, do którego prowadzi link z dwóch miejsc (podsekcja „Testy" i mapa
dokumentacji). W README nie ma zdania, które przeczyłoby stanowi repo.

Weryfikacja: każda komenda wypisana w README daje się uruchomić, każda ścieżka i link
w niej wskazuje na istniejący plik.

### Key Discoveries:

- `README.md:95-96` — jedyne miejsce z nieprawdziwym twierdzeniem; zdanie o skryptach npm
  i zdanie o braku frameworka są w tym samym akapicie, więc naprawa dotyka obu.
- `README.md:139-157` — sekcja „Dokumentacja projektu" ma stałą formę listy
  `[ścieżka](ścieżka) — opis w jednej linii`; nowy wpis musi ją naśladować.
- Sekcja „Uruchomienie lokalne" używa już podsekcji `###` (`### Wymagania wstępne`,
  `### Kroki`, `### Zmienne środowiskowe`, `### Google OAuth (logowanie)`) — `### Testy`
  wpisuje się w istniejący wzorzec bez zmiany struktury dokumentu.
- `AGENTS.md:42` opisuje konwencję testów dla agentów po angielsku; README ma powiedzieć
  to samo po polsku i krócej — to nie duplikat do usunięcia, tylko ten sam fakt dla
  drugiego odbiorcy.
- README jest w całości po polsku (decyzja S-10) — nowa podsekcja też.

## What We're NOT Doing

- Nie opisujemy, czego suite dziś nie pokrywa (brak e2e, integracji route'ów, izolacji
  danych, bramek CI) — świadoma decyzja; nośnikiem tej informacji jest
  `test-plan.md §3`/`§7`, do którego README linkuje.
- Nie przenosimy do README tabeli statusów rolloutu ani listy narzędzi z `test-plan.md §4`.
- Nie wymieniamy nazw plików testowych ani liczby testów (starzeje się przy każdym nowym
  teście).
- Nie ruszamy `AGENTS.md`, `test-plan.md`, `package.json`, `vitest.config.mts` ani
  `context/foundation/*` — one już opisują stan poprawnie.
- Nie robimy szerszego audytu świeżości pozostałych faktów w README (wersje modeli, adres
  produkcji, procedura OAuth) — poza zakresem tej zmiany.
- Nie dodajemy sekcji troubleshooting, screenów ani wersji angielskiej.

## Implementation Approach

Jedno przejście edytorskie po `README.md` (trzy punkty dotknięcia: akapit o skryptach,
nowa podsekcja, mapa dokumentacji), a po nim bramka weryfikacyjna złożona z dwóch
niezależnych sprawdzeń: **uruchomienie** komend, żeby złapać komendę, która istnieje
w `package.json`, ale nie przechodzi, oraz **audyt ścieżek i linków**, żeby złapać
zmyśloną ścieżkę lub martwy odnośnik. Treść pisana jest w jednym podejściu, bo README
jest spójnym dokumentem o jednym tonie.

## Phase 1: Podsekcja „Testy" w README + weryfikacja

### Overview

Doprowadzenie README do zgodności ze stanem repo: poprawiona lista skryptów npm, nowa
podsekcja o testach, wpis w mapie dokumentacji, a na koniec sprawdzenie, że nic z tego
nie kłamie.

### Changes Required:

#### 1. Akapit o skryptach npm

**File**: `README.md` (linie 95-96, koniec sekcji „Uruchomienie lokalne", przed
`### Zmienne środowiskowe`)

**Intent**: Usunąć nieprawdziwe zdanie o braku frameworka testowego i uzupełnić listę
skryptów o `test` i `test:run`, żeby wyliczenie odpowiadało `package.json`.

**Contract**: Lista skryptów w README musi być pełnym odwzorowaniem klucza `scripts`
z `package.json`: `dev`, `build`, `start`, `lint`, `test`, `test:run`. Zdanie „Projekt nie
ma jeszcze frameworka testowego…" znika bez zamiennika w tym akapicie — jego rolę
przejmuje nowa podsekcja.

#### 2. Nowa podsekcja „### Testy"

**File**: `README.md` (nowa podsekcja w sekcji „Uruchomienie lokalne")

**Intent**: Dać czytelnikowi trzy rzeczy w kilku zdaniach: czym uruchomić testy, gdzie
położyć nowy test, gdzie szukać wzorców i strategii. Bez powielania treści `test-plan.md`.

**Contract**: Podsekcja `### Testy` na poziomie h3, umieszczona po `### Kroki`, a przed
`### Zmienne środowiskowe` (kolejność wynika z toku sekcji: najpierw uruchamiasz projekt,
potem go testujesz, potem konfigurujesz szczegóły). Musi zawierać:

- `npm test` — tryb watch, do pracy nad zmianą;
- `npm run test:run` — jeden przebieg, wersja do użycia jako bramka przed pushem;
- konwencję umiejscowienia: plik testu leży obok jednostki, którą pokrywa (przykład
  ze ścieżką, która musi istnieć), współdzielone fake'y w `src/test/fakes/`;
- link relatywny do [`context/foundation/test-plan.md`](context/foundation/test-plan.md)
  jako źródła wzorców (§6) i strategii.

Żadnych nazw wersji paczek ani listy plików testowych — po nie odsyła `package.json`
i sam kod.

#### 3. Mapa dokumentacji

**File**: `README.md` (sekcja „Dokumentacja projektu", lista linii 143-157)

**Intent**: Dopisać `test-plan.md` do mapy, żeby dokument dał się znaleźć również przez
czytelnika, który nie wszedł w sekcję o uruchamianiu.

**Contract**: Nowy punkt listy w formacie istniejących wpisów
(`[`ścieżka`](ścieżka) — opis w jednej linii`), umieszczony po `lessons.md`, opisujący
`test-plan.md` jako strategię testów: mapa ryzyk, fazy rolloutu i wzorce dodawania testów.

### Success Criteria:

#### Automated Verification:

- Suite przechodzi: `npm run test:run`
- Tryb watch startuje bez błędu konfiguracji: `npm test -- --run --reporter=dot`
- Każda ścieżka wymieniona w nowej treści istnieje: `src/test/fakes/`,
  `context/foundation/test-plan.md` oraz plik użyty jako przykład umiejscowienia testu
- Lista skryptów npm w README zgadza się co do joty z kluczem `scripts` w `package.json`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- W całym README nie ma już zdania sugerującego brak testów (przegląd sekcji
  „Uruchomienie lokalne" i „Stack")
- Podsekcja „### Testy" czyta się spójnie z resztą README: polski, ten sam ton, brak
  duplikacji treści `test-plan.md`
- Linki relatywne otwierają się poprawnie w widoku repozytorium na GitHubie
- Osoba wchodząca pierwszy raz do repo po przeczytaniu podsekcji wie, co uruchomić
  i gdzie dopisać nowy test, bez otwierania `AGENTS.md`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj
na potwierdzenie weryfikacji manualnej, zanim domkniesz zmianę.

---

## Testing Strategy

Zmiana jest prozą — nie dodaje kodu ani nie zmienia zachowania aplikacji, więc nie
powstają nowe testy. Rolę testu pełni bramka weryfikacyjna fazy 1: uruchomienie komend
wypisanych w README (łapie komendę, która istnieje, ale nie działa) i audyt ścieżek oraz
linków (łapie zmyślony fakt). Ten sam próg, którego użyto w S-10 przy pisaniu README.

### Manual Testing Steps:

1. Uruchom `npm run test:run` i potwierdź, że suite jest zielony.
2. Przeczytaj sekcję „Uruchomienie lokalne" od góry do dołu — sprawdź, że podsekcja
   „Testy" nie przerywa toku instrukcji uruchomieniowej.
3. Otwórz każdy link relatywny dodany w tej zmianie i potwierdź, że prowadzi do
   istniejącego pliku.
4. Porównaj listę skryptów npm w README z `package.json` linia po linii.

## References

- Zmiana, która wprowadziła Vitest: `context/archive/2026-07-29-testing-session-lifecycle/`
- Decyzje o kształcie README: `context/archive/2026-07-29-readme-project-overview/plan-brief.md`
- Stan warstwy testowej: `context/foundation/test-plan.md` §3, §4, §6
- Ten sam opis dla agentów: `AGENTS.md:31`, `AGENTS.md:42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Podsekcja „Testy" w README + weryfikacja

#### Automated

- [x] 1.1 Suite przechodzi: `npm run test:run` — 8a32e55
- [x] 1.2 Tryb watch startuje bez błędu konfiguracji: `npm test -- --run --reporter=dot` — 8a32e55
- [x] 1.3 Każda ścieżka wymieniona w nowej treści istnieje — 8a32e55
- [x] 1.4 Lista skryptów npm w README zgadza się z `scripts` w `package.json` — 8a32e55
- [x] 1.5 Lint przechodzi: `npm run lint` — 8a32e55

#### Manual

- [x] 1.6 W całym README nie ma już zdania sugerującego brak testów — 8a32e55
- [x] 1.7 Podsekcja „### Testy" czyta się spójnie z resztą README — 8a32e55
- [x] 1.8 Linki relatywne otwierają się poprawnie w widoku repo na GitHubie — 8a32e55
- [x] 1.9 Czytelnik wie, co uruchomić i gdzie dopisać nowy test, bez otwierania `AGENTS.md` — 8a32e55
