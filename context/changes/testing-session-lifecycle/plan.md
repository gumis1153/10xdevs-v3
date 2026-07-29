# Bootstrap runnera + cykl życia sesji — plan implementacji

## Overview

Faza 1 rolloutu z `context/foundation/test-plan.md` §3. Dwa splecione cele:
postawić runner testów od zera (dziś w repo nie ma nic) i zamknąć ryzyko #1 —
jedyne High × High w mapie ryzyk i jedyny realnie przeżyty incydent
(„rozmowa się zakończyła, ale głos nadal odpowiadał", wywiad Q2).

Research (`research.md`) potwierdził, że ryzyko nie jest hipotetyczne: przycisk
„Zakończ rozmowę" wciśnięty w oknie `connecting` prowadzi do w pełni działającej
sesji WebRTC **po** pokazaniu ekranu raportu — mikrofon wraca na antenę, tutor
mówi, licznik OpenAI bije do unmountu. Ten plan najpierw dowodzi tego testem
(czerwonym), potem usuwa przyczynę.

## Current State Analysis

**Runner: zero infrastruktury.** Brak skryptu `test`, brak `vitest` / `jsdom` /
`@testing-library/*` w `package.json`, w `package-lock.json` (także tranzytywnie)
i na dysku. Brak `.github/`. Brak jakiegokolwiek pliku `*.test.*` / `*.spec.*`.
Brak frameworka był **powtarzaną decyzją, nie przeoczeniem** — deklaracja „no
test framework" wraca w sześciu planach w archiwum.

**Cykl życia sesji nie istnieje jako jednostka.** Konstrukcja sesji, wiring
9 subskrypcji, `connect()` i teardown siedzą inline w jednym ciele `useEffect`
(`src/components/voice-conversation.tsx:157-307`) w komponencie `'use client'`.
Nie ma `useRealtimeSession`, nie ma modułu transportowego, nie ma czego
zaimportować i wywołać. Cała powierzchnia SDK to **jeden statyczny import**
(`voice-conversation.tsx:4-8`).

**Asymetria, która wywołała incydent.** Z 9 ścieżek wyjścia znalezionych przez
research **tylko jedna robi pełny teardown** — cleanup efektu (`:301-306`).
Przycisk (`:383-388`) i twardy limit 3:00 (`:314-330`) robią wyłącznie
`close()`: nie ustawiają flagi anulowania i nie czyszczą fallback-timera. Flaga
`cancelled` (`:160`) jest ustawiana **wyłącznie** przez cleanup efektu
(`:302`), więc nic, co nie odmontowuje komponentu, nie potrafi jej ustawić.

**Warstwa czysta jest już zdrowa.** `buildTurns` (`src/lib/realtime/transcript.ts:10`)
i `buildInstructions` (`src/lib/realtime/instructions.ts:30`) są czyste i totalne
— testowalne od ręki, bez żadnego setupu.

**Powierzchnia konfiguracji jest wroga plikom testowym.** `tsconfig.json`
`include` łapie `**/*.ts` / `**/*.tsx`, nie ma klucza `types`, a `next.config.ts`
nie ma `typescript.ignoreBuildErrors` — więc plik testowy bez zarejestrowanych
typów runnera **wywróci `next build` na preview Vercela**.

## Desired End State

1. `npm test` uruchamia Vitest w jsdom z aliasem `@/*`; `npm run build` i
   `npx tsc --noEmit` pozostają zielone przy obecnych w repo plikach testowych.
2. Trzy ścieżki wyjścia (przycisk, twardy limit 3:00, unmount) mają testy
   dowodzące, że po zakończeniu rozmowy **żadna aktywność sesji nie następuje** —
   w szczególności że zakończenie w oknie `connecting` nie prowadzi do
   `connect()` ani `requestResponse()`.
3. Defekt D1 naprawiony: świadome zakończenie jest respektowane przez każdą
   późniejszą gałąź efektu łączącego. Wraz z nim D2 — raport nie jest już
   nadpisywany kartą „Połączenie przerwane".
4. `test-plan.md` §6.1 i §6.2 nie zawierają już „TBD"; §6.7 notuje granicę jsdom
   i ścieżki niepokryte; status fazy 1 w §3 to `complete`.

Weryfikacja: `npm test -- --run`, `npm run build`, `npm run lint` zielone;
w `test-plan.md` `grep -c "TBD"` w §6.1/§6.2 daje 0.

### Key Discoveries:

- **Epicentrum D1**: `voice-conversation.tsx:381-388` — komentarz „dostępne
  w każdym stanie, także w trakcie łączenia" jest zapisaną intencją, ale jej
  konsekwencja w stanie `connecting` nie została nigdzie przeanalizowana.
- **`close()` na nieistniejącym transporcie to no-op bez żadnego śladu**
  (`node_modules/@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs:20-25`,
  `:400-419`), a `connect()` (`:76-88`) ma tylko warunek `if (status === 'connected') return`
  — brak warunku „byłem zamykany".
- **`userEndedRef` już istnieje i jest ustawiany przez oba brakujące teardowny**
  (`:384` przycisk, `:321` timer) oraz resetowany na starcie efektu (`:161`).
  Jest dziś czytany tylko w jednym miejscu (`:230`) jako klasyfikator. To znaczy,
  że fix D1 nie wymaga nowej flagi — wymaga podniesienia tej istniejącej z roli
  klasyfikatora do roli strażnika.
- **Pułapka jsdom**: bez `window.RTCPeerConnection` SDK po cichu wybiera
  transport WebSocket (`realtimeSession.mjs:107-116`), którego `close()`
  **nie dotyka żadnych ścieżek mediów i nigdy nie woła `getUserMedia`**
  (`openaiRealtimeWebsocket.mjs:306-313`). Test na niezamockowanym SDK ćwiczyłby
  inny transport niż produkcja i strukturalnie nie wykryłby wycieku mikrofonu.
- **Nasz kod nie trzyma żadnej referencji do `MediaStream`.** Nasze
  `getUserMedia` (`:248-253`) to probe uprawnień zatrzymywany linijkę dalej.
  Zwolnienie mikrofonu zależy wyłącznie od SDK — czyli fizycznego zwolnienia
  nie da się udowodnić w tej warstwie.
- **Drzewo importów `voice-conversation.tsx` nie czyta `process.env`** (potwierdzone:
  `session-report` → `report-view` → `report/schema` → `zod`; `topics`, `instructions`,
  `orb` bez importów środowiskowych). Otwarte pytanie #6 z researchu rozstrzygnięte
  negatywnie: `dotenv` / `@next/env` nie jest w tej fazie potrzebny.

## What We're NOT Doing

- **Nie refaktorujemy `voice-conversation.tsx` do hooka `useRealtimeSession`.**
  Seam to podmiana modułu, nie wydzielenie abstrakcji. Plik był dotykany przez
  6 slice'ów bez siatki testowej — refaktor przed postawieniem tej siatki ma
  ujemny bilans ryzyka.
- **Nie testujemy ścieżek D/E/F** („Spróbuj ponownie", „Wróć do tematu", „Nowa
  sesja"). Wszystkie trzy sprowadzają się do cleanupu efektu, który faza pokrywa
  jako ścieżkę C; trzy osobne testy byłyby redundantnymi kopiami.
- **Nie testujemy ani nie naprawiamy ścieżki H** (link logo w headerze — soft-nav
  na tę samą trasę nie zatrzymuje sesji) **ani ścieżki I** (zamknięcie karty —
  zero handlerów `beforeunload` / `pagehide` w `src/`). Oba leżą poza drzewem
  `SessionStart`, więc są testowalne tylko e2e. Ścieżka H jest prawdopodobnie
  realnym defektem i zostaje w produkcji — świadomie, z notatką w §6.7.
- **Nie testujemy ścieżek błędowych** (non-2xx z `/api/realtime/token`, reject
  `connect()`, `session.on('error')`). Należą do ryzyka #4 i fazy 4.
- **Nie naprawiamy D3, D4 ani D6.** D3 to ryzyko #4 (faza 4). D4 neutralizuje
  się sam przez odczyt `stateRef`. D6 nie jest realnym wyciekiem — obiekt sesji
  jest po `close()` porzucany i zbierany przez GC.
- **Nie wprowadzamy MSW.** Wchodzi w fazie 2 dla route'ów. Tutaj potrzebna jest
  kontrola nad *momentem* odpowiedzi, nie nad jej treścią.
- **Nie asertujemy fizycznego zwolnienia mikrofonu.** Warstwa jsdom nie jest do
  tego zdolna (patrz Key Discoveries). Zostaje ręcznym smoke'em.
- **Nie stawiamy CI ani mutation testingu.** CI to faza 5; Stryker nie występuje
  w `test-plan.md` §4.
- **Nie dotykamy `src/app/api/**`, migracji Supabase ani konfiguracji Vercela.**

## Implementation Approach

Kolejność wynika z jednej zasady: **czerwony test musi być wiarygodny**. Gdyby
pierwszy napisany test od razu celował w D1, jego czerwony kolor byłby
dwuznaczny — defekt produkcyjny czy błąd w świeżo napisanym fake'u? Dlatego
faza 2 najpierw pisze testy dwóch ścieżek, które **są dziś poprawne** (limit
3:00 i unmount). Ich zielony kolor jest dowodem, że fake i harness poprawnie
rejestrują `close()` i `connect()`. Dopiero wtedy faza 3 stawia czerwony test,
którego kolor już nie ma alternatywnego wyjaśnienia.

Granica podmiany: moduł `@openai/agents-realtime`, zgodnie z polityką
`test-plan.md:113` („nigdy nie mockować modułów wewnętrznych"). Fake jest
**minimalny** — modeluje wyłącznie to, czego dotyka nasz kod, i nie udaje
przeglądarki. Konsekwencja przyjęta świadomie: testy dowodzą *sekwencji
i kontraktu naszego kodu*, nie fizyki urządzenia.

## Critical Implementation Details

**Klucz `types` musi zawierać `"node"`.** Dodanie `types` do `tsconfig.json`
wyłącza automatyczne ładowanie wszystkiego z `@types`. `src/` ma 6 użyć
`process.env` (`api/realtime/token/route.ts:48`, `proxy.ts:13-14`,
`lib/supabase/server.ts:13-14`, `auth/callback/route.ts:22`), więc pominięcie
`"node"` wywróciłoby `next build` — dokładnie awaria, której ta decyzja miała
zapobiec. Docelowa wartość: `["node", "vitest/globals"]`. Typy matcherów
jest-dom **nie** idą przez ten klucz (to ścieżka Jestowa) — wchodzą przez import
`@testing-library/jest-dom/vitest` w `vitest.setup.ts`, który obecny `include`
(`**/*.ts`) już łapie do programu TS.

**`fireEvent`, nie `user-event`.** `@testing-library/user-event` wymaga opcji
`advanceTimers` do współpracy z `vi.useFakeTimers()` i łatwo zakleszcza test
odliczania 3:00. Ścieżki A i B potrzebują wyłącznie kliknięcia przycisku, więc
`fireEvent.click` z `@testing-library/react` wystarcza i omija tę klasę
problemów. Nie dodajemy `user-event` jako zależności.

**`vi.mock` jest hoistowany.** Fabryka nie może odwoływać się do zmiennych
zadeklarowanych w ciele pliku testowego — instancje fake'a muszą być dostępne
przez funkcję eksportowaną z modułu fake'a albo przez `vi.hoisted`. Vitest 4
zaleca formę `vi.mock(import('@openai/agents-realtime'), factory)` (zamiast
literału string), bo wtedy TypeScript typuje zwrotkę fabryki.

**Odliczanie startuje dopiero po `connect()`.** Interval (`:314-330`) arma się
warunkiem `isActive`, a stan wchodzi w `processing` dopiero w bloku
po-connectowym (`:272`). Test ścieżki B musi więc doprowadzić `connect()` do
rozwiązania, zanim zacznie przesuwać czas. Dodatkowo w oknie 180 s wystrzeli
fallback otwarcia (5 s, `:283-287`) — przełącza stan na `listening`, co jest
nadal stanem aktywnym i nie przerywa odliczania.

**Okno wyścigu D1 leży na fetchu tokenu, nie na `connect()`.** Test musi
wstrzymać `POST /api/realtime/token` (`:258`), kliknąć „Zakończ rozmowę",
a dopiero potem rozwiązać żądanie — stąd rozwiązywalny deferred zamiast
statycznej odpowiedzi.

---

## Phase 1: Bootstrap runnera

### Overview

Postawić Vitest w jsdom tak, żeby pliki testowe współistniały z `next build`.
Zamknąć fazę smoke testem na warstwie czystej — dowód, że harness żyje, jeszcze
przed dotknięciem SDK.

### Changes Required:

#### 1. Zależności runnera

**File**: `package.json`

**Intent**: dodać devDependencies runnera i skrypt `test`. Zestaw pakietów jest
wzięty z przewodnika Next.js zainstalowanej wersji
(`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md:37`), nie z pamięci.

**Contract**: devDependencies (wersje sprawdzone w npm 2026-07-29):
`vitest@4.1.10`, `@vitejs/plugin-react@6.0.4`, `jsdom@30.0.1`,
`@testing-library/react@16.3.2`, `@testing-library/dom@10.4.1`,
`@testing-library/jest-dom@7.0.0`, `vite-tsconfig-paths@6.1.1`.
Skrypty: `"test": "vitest"`, `"test:run": "vitest run"` (druga forma jest tym,
co wołają bramki — `vitest` bez flagi wchodzi w watch mode).

#### 2. Konfiguracja Vitest

**File**: `vitest.config.mts`

**Intent**: środowisko jsdom, globals, alias `@/*` przez plugin tsconfig-paths,
plik setupu. Rozszerzenie `.mts` jest wymuszone: `tsconfig.json` `include` łapie
`**/*.mts`, ale **nie** `**/*.mjs` — więc `.mts` będzie typowany, `.mjs` nie.

**Contract**: `plugins: [tsconfigPaths(), react()]`;
`test: { environment: 'jsdom', globals: true, setupFiles: ['./vitest.setup.ts'] }`.
`globals: true` jest wymagane przez wybór `vitest/globals` w tsconfig — jedno bez
drugiego daje typy bez runtime'u albo runtime bez typów.

#### 3. Setup testów

**File**: `vitest.setup.ts`

**Intent**: zarejestrować matchery jest-dom dla Vitest.

**Contract**: import `@testing-library/jest-dom/vitest` (entrypoint dedykowany
Vitestowi — zwykły `@testing-library/jest-dom` rejestruje pod Jest).

#### 4. Typy globalne

**File**: `tsconfig.json`

**Intent**: zarejestrować globalne typy runnera tak, żeby pliki testowe
przechodziły typecheck w tym samym programie, którym buduje Next — patrz
Critical Implementation Details.

**Contract**: dodać `"types": ["node", "vitest/globals"]` do `compilerOptions`.
`include` bez zmian. Dopisać komentarz-ostrzeżenie, że jawny `types` odcina
automatyczne `@types` i każdy przyszły pakiet typów globalnych trzeba tu dodać.

#### 5. Zakres ESLint dla testów

**File**: `eslint.config.mjs`

**Intent**: upewnić się, że pliki testowe przechodzą lint tą samą konfiguracją
co kod aplikacji; dodać blok `files:` **tylko jeśli** lint faktycznie zgłosi
błędy na globalach testowych.

**Contract**: zmiana warunkowa — jeśli `npm run lint` jest czysty po dodaniu
smoke testu, plik zostaje nietknięty. Nie dodawać bloku „na wszelki wypadek".

#### 6. Smoke test warstwy czystej

**File**: `src/lib/realtime/transcript.test.ts` (obok jednostki, którą pokrywa —
`AGENTS.md` §Testing Guidelines)

**Intent**: dowieść, że harness działa, i przy okazji zabezpieczyć guardrail
prywatności. Oracle pochodzi z PRD, nie z implementacji: PRD §Guardrails mówi,
że surowe nagranie głosu nie jest przechowywane — więc z elementu audio wolno
przepuścić **wyłącznie transkrypcję**, nigdy bajtów audio; a tura `system` to
ziarno instrukcji, nie wypowiedź uczestnika rozmowy.

**Contract**: `buildTurns` — mapowanie `role: 'user'` → `speaker: 'learner'`
i `role: 'assistant'` → `'tutor'`; element audio z `transcript: null`
(tura in-progress) nie produkuje tury; tura `system` jest pomijana; historia
pusta daje `[]`. Asercje na wartościach z oracle'a, nie na przebiegu pętli.

### Success Criteria:

#### Automated Verification:

- Testy przechodzą: `npm run test:run`
- Typecheck czysty: `npx tsc --noEmit`
- Build produkcyjny czysty (bramka Vercela): `npm run build`
- Lint czysty: `npm run lint`

#### Manual Verification:

- `npm test` wchodzi w watch mode i reaguje na zapis pliku testowego
- Edytor nie zgłasza błędów typów w `transcript.test.ts` ani w `vitest.setup.ts`

**Implementation Note**: po zaliczeniu weryfikacji automatycznej zatrzymaj się
i poproś o potwierdzenie ręcznego sprawdzenia, zanim przejdziesz do fazy 2.

---

## Phase 2: Fake modułu SDK + ścieżki B i C

### Overview

Zbudować minimalny fake `@openai/agents-realtime` i pokryć dwie ścieżki wyjścia,
które **są dziś poprawne**: twardy limit 3:00 i unmount. Zielony kolor tych
testów jest walidacją harnessu — bez niej czerwony test z fazy 3 byłby
dwuznaczny.

### Changes Required:

#### 1. Fake sesji Realtime

**File**: `src/test/fakes/realtime-session.ts`

**Intent**: odtworzyć powierzchnię SDK, której faktycznie dotyka
`voice-conversation.tsx` — i **nic** ponad to. Fake rejestruje wywołania
w kolejności, żeby test mógł asertować sekwencję, oraz daje testowi uchwyt do
emitowania zdarzeń sesji i transportu.

**Contract**: eksport fabryki zwracającej `{ RealtimeAgent, RealtimeSession }`
zgodne z importem z `voice-conversation.tsx:4-8`, plus rejestr instancji
dostępny dla testu. `RealtimeSession` musi wystawić: `connect(opts)` (async,
z możliwością wstrzymania), `close()`, `on(event, handler)` dla 8 zdarzeń
sesyjnych (`agent_start`, `agent_end`, `audio_start`, `audio_stopped`,
`audio_interrupted`, `history_updated`, `error`, `transport_event`) oraz
`transport` z `on('connection_change')`, `status`, `requestResponse()`.
Rejestr wywołań musi rozróżniać `connect`, `close` i `requestResponse`.

**Świadomie NIE modelowane**: `getSenders()`, `track.readyState`,
`peerConnection`, element `<audio>`. Asercja o zwolnieniu mikrofonu na takim
fake'u byłaby asercją o fake'u — przeszłaby na zielono nawet gdyby produkcja
przeciekała.

#### 2. Uprzęż testu komponentu

**File**: `src/components/voice-conversation.test.tsx`

**Intent**: wspólny setup dla wszystkich testów cyklu życia: `vi.mock` modułu
SDK, stub `navigator.mediaDevices.getUserMedia` (probe uprawnień, `:248-253`),
stub `fetch` z rozwiązywalnym deferredem dla `/api/realtime/token` i domyślną
odpowiedzią dla `/api/report`.

**Contract**: helper renderujący `VoiceConversation` z minimalnym `topic`
i atrapami callbacków (`onStateChange`, `onExit`, `onNewSession`). Stub
`getUserMedia` musi zwracać obiekt z `getTracks()` oddającym ścieżkę ze `stop()`
— inaczej `:253` rzuci i test wpadnie w gałąź `mic-denied`. `vi.mock` deklarowany
w formie `vi.mock(import('@openai/agents-realtime'), ...)`; instancje pobierane
przez funkcję z modułu fake'a, nie przez zmienną z ciała pliku (hoisting).

#### 3. Ścieżka B — twardy limit 3:00

**File**: `src/components/voice-conversation.test.tsx`

**Intent**: dowieść, że wyczerpanie limitu sesji zamyka sesję dokładnie raz
i prowadzi do ekranu końcowego. Oracle: FR-009 i `test-plan.md` ryzyko #1 („po
zakończeniu nie płynie ani jeden token"), nie stała `SESSION_SECONDS`.

**Contract**: po rozwiązaniu `connect()` przesunąć czas o czas trwania sesji;
asercje: `close()` wywołane raz, żadnego `connect()` ponad ten pierwszy, UI na
ekranie raportu. Fake timers włączane per test i przywracane w `afterEach`
(`vi.useRealTimers()`). Uwaga: fallback otwarcia (5 s) wystrzeli w trakcie
przesuwania i przełączy stan na `listening` — to jest stan aktywny, odliczanie
biegnie dalej.

#### 4. Ścieżka C — unmount, w tym unmount w trakcie łączenia

**File**: `src/components/voice-conversation.test.tsx`

**Intent**: dowieść, że cleanup efektu robi pełny teardown — i że unmount
**w trakcie** łączenia nie dopuszcza do powstania sesji. Ten drugi przypadek
jest bliźniakiem scenariusza z fazy 3 i **przechodzi dziś na zielono**, bo
cleanup ustawia `cancelled`. Kontrast między nim a fazą 3 jest właściwym
dowodem asymetrii „przycisk robi mniej niż unmount".

**Contract**: (a) unmount po udanym connect → `close()` wywołane raz;
(b) unmount przy wstrzymanym fetchu tokenu, następnie rozwiązanie fetcha →
`connect()` **nigdy** nie wywołane, `requestResponse()` nigdy nie wywołane,
brak ostrzeżeń Reacta o aktualizacji stanu po odmontowaniu.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy przechodzą: `npm run test:run`
- Typecheck czysty: `npx tsc --noEmit`
- Build produkcyjny czysty: `npm run build`
- Lint czysty: `npm run lint`

#### Manual Verification:

- Przegląd fake'a: nie modeluje niczego, czego nasz kod nie dotyka —
  w szczególności brak `getSenders()` i `track.readyState`
- Testy B i C przechodzą **bez żadnej zmiany w kodzie produkcyjnym** (gdyby
  wymagały zmiany, założenie planu o poprawności tych ścieżek jest błędne —
  zatrzymaj się i zgłoś)

**Implementation Note**: zatrzymaj się po tej fazie po potwierdzenie, że fake
jest wystarczająco płytki. Zbyt głęboki fake unieważnia fazę 3.

---

## Phase 3: Ścieżka A w oknie `connecting` — czerwony test i fix D1

### Overview

Faza TDD. Najpierw test, który **musi być czerwony** na obecnym kodzie, potem
minimalny fix, który go zieleni. Pierwsza czerwona asercja, nazwana jednym
zdaniem: *po kliknięciu „Zakończ rozmowę" w stanie `connecting` żadne
`connect()` ani `requestResponse()` nie zostaje wywołane na sesji*.

### Changes Required:

#### 1. Czerwony test — zakończenie w trakcie łączenia

**File**: `src/components/voice-conversation.test.tsx`

**Intent**: udokumentować D1 jako regresję. Oracle pochodzi z FR-009
(„użytkownik może zakończyć sesję w dowolnym momencie") w koniunkcji z ryzykiem
#1 z `test-plan.md` — zakończenie oznacza brak dalszej aktywności sesji, nie
tylko zmianę ekranu. Oracle **nie** pochodzi z obecnego zachowania kodu, które
jest właśnie tym, co test ma sfalsyfikować.

**Contract**: wstrzymać `POST /api/realtime/token`, kliknąć „Zakończ rozmowę"
(`fireEvent.click`, rola `button`, nazwa dostępna „Zakończ rozmowę"), rozwiązać
fetch, odczekać na mikrozadania. Asercje: `connect()` nigdy nie wywołane;
`requestResponse()` nigdy nie wywołane; UI pozostaje na ekranie końcowym
(nie na karcie „Połączenie przerwane" — to pokrywa D2).

#### 2. Fix D1 — świadome zakończenie jako strażnik

**File**: `src/components/voice-conversation.tsx`

**Intent**: podnieść `userEndedRef` z roli klasyfikatora do roli strażnika.
Nowa zasada, którą kod ma trzymać: **po świadomym zakończeniu żadna późniejsza
gałąź efektu łączącego nie tworzy sesji ani nie zapisuje stanu UI.** Nie
wprowadzać nowej flagi — `userEndedRef` jest już ustawiany przez oba brakujące
teardowny (`:384` przycisk, `:321` timer) i już resetowany na starcie efektu
(`:161`), więc semantyka retry pozostaje poprawna bez dodatkowej pracy.

**Contract**: warunek anulowania w IIFE (`:246-299`) uwzględnia świadome
zakończenie na równi z `cancelled` — w każdym z trzech istniejących punktów
kontrolnych (`:256`, `:263`, `:266`) oraz przed blokiem po-connectowym
(`:272-287`). Gdy zakończenie padło już po rozpoczęciu `connect()`, sesja musi
zostać zamknięta (jak dziś robi to gałąź `cancelled` w `:266-269`) — inaczej
naprawiamy jedno okno, a otwieramy drugie. Zaktualizować komentarz przy
`userEndedRef` (`:110-112`), bo jego rola się rozszerza.

#### 3. Fix D2 — raport nie jest nadpisywany kartą błędu

**File**: `src/components/voice-conversation.tsx`

**Intent**: usunąć poboczny wariant tego samego wyścigu: gdy klik pada już po
starcie `connect()`, `close()` faktycznie zamyka, `connect()` rzuca, a `catch`
(`:288-298`) wykonuje **surowy** `setState('error')`, który nadpisuje ekran
`ended` — i raport przepada.

**Contract**: gałąź `catch` respektuje świadome zakończenie tak samo jak
`cancelled` (`:289`) — nie ustawia `errorKind`, nie zeruje odliczania i nie
przechodzi w `error`, gdy użytkownik już zakończył. Zachowanie dla błędów
w rozmowie **nieprzerwanej** przez użytkownika pozostaje nietknięte.

#### 4. Test regresji D2

**File**: `src/components/voice-conversation.test.tsx`

**Intent**: przypiąć zachowanie z punktu 3 — inaczej fix D2 nie ma siatki.

**Contract**: zakończenie w trakcie łączenia, gdzie `connect()` odrzuca po
kliknięciu → UI zostaje na ekranie końcowym, karta „Połączenie przerwane" nie
jest renderowana.

### Success Criteria:

#### Automated Verification:

- Test z punktu 1 **jest czerwony przed** wprowadzeniem fixa (odnotuj to
  w `## Progress` — to jest dowód, że test łapie regresję)
- Wszystkie testy przechodzą po fixie: `npm run test:run`
- Testy ścieżek B i C z fazy 2 nadal przechodzą (fix nie zepsuł teardownu, który
  już działał)
- Typecheck czysty: `npx tsc --noEmit`
- Build produkcyjny czysty: `npm run build`
- Lint czysty: `npm run lint`

#### Manual Verification:

- **Smoke w przeglądarce, którego jsdom nie zastąpi**: rozpocząć sesję, kliknąć
  „Zakończ rozmowę" w trakcie „Łączenie z rozmówcą…", i potwierdzić, że
  wskaźnik mikrofonu w przeglądarce gaśnie oraz że tutor **nie** zaczyna mówić
  na ekranie raportu. To jedyny dowód fizycznego zwolnienia urządzenia.
- Normalna sesja (rozmowa do końca, potem „Zakończ rozmowę") nadal prowadzi do
  poprawnego raportu — fix nie zablokował ścieżki szczęśliwej
- Retry po błędzie połączenia („Spróbuj ponownie") nadal tworzy świeżą sesję —
  potwierdza, że reset `userEndedRef` na starcie efektu działa

**Implementation Note**: smoke w przeglądarce jest wymagany przed zamknięciem
tej fazy. Zatrzymaj się po potwierdzenie.

---

## Phase 4: Cookbook i synchronizacja test-planu

### Overview

Zamienić to, czego faza się nauczyła, w instrukcję dla następnego kontrybutora.
Bez tego kolejna faza rolloutu odtworzy te same decyzje od zera.

### Changes Required:

#### 1. Wzorzec testu jednostkowego

**File**: `context/foundation/test-plan.md` (§6.1)

**Intent**: zastąpić „TBD" konkretnym wzorcem: gdzie leżą pliki testowe (obok
jednostki), jak uruchomić (`npm test` / `npm run test:run`), skąd bierze się
oracle (PRD / FR, nigdy implementacja).

**Contract**: 3–6 linii, z odwołaniem do `src/lib/realtime/transcript.test.ts`
jako wzorca referencyjnego.

#### 2. Wzorzec testu komponentu z podmienioną granicą SDK

**File**: `context/foundation/test-plan.md` (§6.2)

**Intent**: zapisać politykę mockowania i jej granicę: podmieniany jest moduł
`@openai/agents-realtime`, fake jest minimalny, a rzeczy, których fake **nie**
modeluje, są nimi celowo.

**Contract**: 5–10 linii z odwołaniem do `src/test/fakes/realtime-session.ts`
i `src/components/voice-conversation.test.tsx`; jawnie: `fireEvent`, nie
`user-event`; stub `fetch` z deferredem, MSW dopiero od fazy 2.

#### 3. Notatki per faza

**File**: `context/foundation/test-plan.md` (§6.7)

**Intent**: odnotować trzy rzeczy, które będą kosztowne do odkrycia po raz drugi:
granicę jsdom (zwolnienie mikrofonu jest niedowodliwe w tej warstwie, zostaje
ręcznym smoke'em), pułapkę `types` w `tsconfig.json` (musi zawierać `"node"`),
oraz ścieżki wyjścia H i I jako świadomie niepokryte, skierowane do fazy 4.

**Contract**: 4–6 linii.

#### 4. Status rolloutu i bramka

**File**: `context/foundation/test-plan.md` (§3, §5)

**Intent**: przesunąć status fazy 1 na `complete` i odnotować, że bramka
„unit + integration" jest od teraz wymuszana lokalnie (CI nadal faza 5).

**Contract**: w §3 wiersz 1 Status = `complete` (literał parsera); w §5 wiersz
„unit + integration" bez zmiany brzmienia — bramka była już opisana jako
„required after §3 Phase 1", a ta faza właśnie ją aktywuje.

#### 5. Zamknięcie change'a

**File**: `context/changes/testing-session-lifecycle/change.md`

**Intent**: zaktualizować metadane zmiany.

**Contract**: `status: complete`, `updated:` na dzień wylądowania.

#### 6. Wzmianka o runnerze w instrukcjach dla agentów

**File**: `AGENTS.md` (§Testing Guidelines)

**Intent**: sekcja mówi dziś „No test framework is configured yet" — po tej
fazie to nieprawda i wprowadza w błąd każdego kolejnego agenta.

**Contract**: zastąpić zdaniem opisującym Vitest + jsdom, polecenie `npm run test:run`,
konwencję kolokacji testów i wskazaniem `context/foundation/test-plan.md` §6
jako źródła wzorców.

### Success Criteria:

#### Automated Verification:

- W §6.1 i §6.2 nie ma już „TBD": `grep -c "TBD" context/foundation/test-plan.md`
  jest mniejsze niż przed fazą, a żadne trafienie nie leży w §6.1/§6.2
- Status fazy 1 w §3 to `complete`
- `AGENTS.md` nie zawiera już „No test framework is configured yet"
- Cały zestaw nadal zielony: `npm run test:run`, `npm run build`, `npm run lint`

#### Manual Verification:

- Ktoś czytający tylko §6.1 i §6.2 potrafi dopisać drugi test komponentu bez
  otwierania tego planu
- §6.7 uczciwie mówi, czego faza **nie** pokryła (mikrofon fizycznie, ścieżki
  H i I) — bez tego następna faza uzna ryzyko #1 za zamknięte w całości

---

## Testing Strategy

### Unit Tests:

- `buildTurns` — mapowanie ról na `speaker`, pominięcie tury `system`, element
  audio bez transkrypcji nie produkuje tury, pusta historia daje `[]`. Oracle
  z PRD §Guardrails (bajty audio nie opuszczają klienta).

### Component Tests (granica SDK podmieniona):

- Ścieżka B (limit 3:00): zamknięcie dokładnie raz, przejście na ekran końcowy.
- Ścieżka C (unmount po connect): zamknięcie dokładnie raz.
- Ścieżka C (unmount w trakcie łączenia): `connect()` nigdy nie wywołane.
- Ścieżka A (przycisk w trakcie łączenia): `connect()` i `requestResponse()`
  nigdy nie wywołane — **test czerwony przed fixem**.
- Regresja D2: zakończenie + odrzucone `connect()` nie nadpisuje raportu kartą
  błędu.

Gdyby przy pisaniu okazało się, że ścieżki A, B i C dzielą kształt asercji,
skonsolidować je jednym `it.each` po ścieżce wyjścia — nie kopiować testu
trzykrotnie (anty-wzorzec „redundant copies").

### Manual Testing Steps:

1. Rozpocząć sesję, kliknąć „Zakończ rozmowę" w trakcie „Łączenie z rozmówcą…".
   Potwierdzić: wskaźnik mikrofonu w przeglądarce gaśnie, tutor nie mówi na
   ekranie raportu.
2. Przeprowadzić normalną sesję do końca i zakończyć przyciskiem — raport
   generuje się poprawnie.
3. Wywołać błąd połączenia (np. offline na moment), kliknąć „Spróbuj ponownie" —
   powstaje świeża sesja.
4. Odczekać do wyczerpania limitu 3:00 — sesja kończy się sama i prowadzi do
   raportu.

## Performance Considerations

Brak wpływu na runtime aplikacji: cały dodany kod to devDependencies i pliki
testowe. Jedyna zmiana w kodzie produkcyjnym (fix D1/D2) dodaje odczyty refa
w istniejących punktach kontrolnych.

Jedno ryzyko po stronie build-time: jawny klucz `types` w `tsconfig.json` zmienia
zestaw typów widziany przez `next build`. Dlatego `npm run build` jest bramką
automatyczną w **każdej** fazie tego planu, nie tylko w pierwszej.

## Migration Notes

Nie dotyczy — brak migracji danych i brak zmian schematu. Zmiana jest w pełni
odwracalna: wycofanie devDependencies, dwóch plików konfiguracyjnych, plików
testowych i jednego commita w `voice-conversation.tsx`.

## References

- Research: `context/changes/testing-session-lifecycle/research.md`
- Strategia i rollout: `context/foundation/test-plan.md` (§2 ryzyko #1,
  §3 Phase 1, §4 stack, §5 bramki, §6.1–6.2 cookbook)
- Oracle: `context/foundation/prd.md` — FR-009 (zakończenie w dowolnym momencie),
  §Guardrails (surowe audio nie jest przechowywane)
- Przewodnik runnera dla zainstalowanej wersji Next:
  `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- Epicentrum defektu: `src/components/voice-conversation.tsx:381-388`
- Jedyny pełny teardown: `src/components/voice-conversation.tsx:301-306`
- Pułapka jsdom: `node_modules/@openai/agents-realtime/dist/realtimeSession.mjs:107-116`
- Historyczny dowód, że `close()` nie jest dowodem zamknięcia:
  `context/archive/2026-07-23-post-session-report/reviews/impl-review.md:44`
- Zasady: `CLAUDE.md` (oracle rules, anty-wzorce vibe-testingu, wybór
  `/10x-tdd` vs `/10x-implement`), `AGENTS.md` (alias `@/*`, kolokacja testów),
  `context/foundation/lessons.md` (branch + PR, komunikacja po polsku)

## Progress

> Konwencja: `- [ ]` pending, `- [x]` done. Dopisz ` — <commit sha>`, kiedy krok
> wyląduje. Nie zmieniaj tytułów kroków.

### Phase 1: Bootstrap runnera

#### Automated

- [x] 1.1 Testy przechodzą: `npm run test:run`
- [x] 1.2 Typecheck czysty: `npx tsc --noEmit`
- [x] 1.3 Build produkcyjny czysty (bramka Vercela): `npm run build`
- [x] 1.4 Lint czysty: `npm run lint`

#### Manual

- [x] 1.5 `npm test` wchodzi w watch mode i reaguje na zapis pliku testowego
- [x] 1.6 Edytor nie zgłasza błędów typów w `transcript.test.ts` ani w `vitest.setup.ts`

### Phase 2: Fake modułu SDK + ścieżki B i C

#### Automated

- [ ] 2.1 Wszystkie testy przechodzą: `npm run test:run`
- [ ] 2.2 Typecheck czysty: `npx tsc --noEmit`
- [ ] 2.3 Build produkcyjny czysty: `npm run build`
- [ ] 2.4 Lint czysty: `npm run lint`

#### Manual

- [ ] 2.5 Przegląd fake'a: nie modeluje niczego, czego nasz kod nie dotyka (brak `getSenders()`, brak `track.readyState`)
- [ ] 2.6 Testy B i C przechodzą bez żadnej zmiany w kodzie produkcyjnym

### Phase 3: Ścieżka A w oknie `connecting` — czerwony test i fix D1

#### Automated

- [ ] 3.1 Test zakończenia w trakcie łączenia jest czerwony PRZED fixem
- [ ] 3.2 Wszystkie testy przechodzą po fixie: `npm run test:run`
- [ ] 3.3 Testy ścieżek B i C z fazy 2 nadal przechodzą
- [ ] 3.4 Typecheck czysty: `npx tsc --noEmit`
- [ ] 3.5 Build produkcyjny czysty: `npm run build`
- [ ] 3.6 Lint czysty: `npm run lint`

#### Manual

- [ ] 3.7 Smoke w przeglądarce: zakończenie w trakcie łączenia gasi wskaźnik mikrofonu i tutor nie mówi
- [ ] 3.8 Normalna sesja nadal prowadzi do poprawnego raportu
- [ ] 3.9 Retry po błędzie połączenia nadal tworzy świeżą sesję

### Phase 4: Cookbook i synchronizacja test-planu

#### Automated

- [ ] 4.1 W §6.1 i §6.2 test-planu nie ma już „TBD"
- [ ] 4.2 Status fazy 1 w §3 to `complete`
- [ ] 4.3 `AGENTS.md` nie zawiera już „No test framework is configured yet"
- [ ] 4.4 Cały zestaw nadal zielony: `npm run test:run`, `npm run build`, `npm run lint`

#### Manual

- [ ] 4.5 §6.1 i §6.2 wystarczają, żeby dopisać drugi test komponentu bez czytania tego planu
- [ ] 4.6 §6.7 uczciwie wymienia to, czego faza nie pokryła (mikrofon fizycznie, ścieżki H i I)
