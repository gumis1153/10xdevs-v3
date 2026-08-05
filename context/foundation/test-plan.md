# Test Plan

> Fazowy rollout testów dla tego projektu. Strategia jest zamrożona u góry
> (§1–§5); wzorce z książki kucharskiej na dole (§6) wypełniają się w miarę
> dostarczania faz. Przeczytaj przed napisaniem jakiegokolwiek nowego testu.
>
> Odświeżenie: uruchom `/10x-test-plan --refresh`, kiedy plan się zestarzeje (patrz §8).
>
> Last updated: 2026-07-29

## 1. Strategy

Testy w tym projekcie podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje realny sygnał dla
   danego ryzyka. Nie promuj do e2e, bo e2e „wydaje się bezpieczniejsze".
   Nie stawiaj modelu wizyjnego na deterministycznym diffie, który już łapie
   tę regresję.
2. **Obawy użytkownika to dowód pierwszej kategorii.** Ryzyka zakotwiczone w
   „zespół boi się X, a awaria wyszłaby gdzieś w obszarze `<obszar>`" mają tę
   samą wagę co linie PRD czy dane o churnie.
3. **Ryzyka są scenariuszami, nie lokalizacjami w kodzie.** Ten plan
   dokumentuje *co może pęknąć* i *dlaczego uważamy, że jest to prawdopodobne*
   — na podstawie dokumentów, wywiadu i *sygnału* z kodu (churn, struktura,
   baza testowa). NIE rości sobie prawa do wiedzy, która linia jest
   właścicielem awarii. Tę wiedzę produkuje `/10x-research` w trakcie każdej
   fazy rolloutu. Jeśli plan i research nie zgadzają się co do tego, gdzie
   mieszka awaria, prawdą podstawową jest research.

Zakres hot-spotów użyty do wagowania prawdopodobieństwa: `src/`,
`supabase/migrations/` (wykluczone: `context/`, `node_modules`, `.next`,
`public`, lockfile).

## 2. Risk Map

Główne scenariusze awarii, przed którymi ten projekt musi się obronić,
uporządkowane po ryzyku = impact × likelihood. Ryzyka są scenariuszami awarii
w kategoriach użytkownika/biznesu, nie nazwami testów. Kolumna Źródło cytuje
*dowód, który wyniósł to ryzyko na wierzch* — nigdy konkretnego pliku jako
„miejsca, gdzie mieszka awaria" (to zadanie researchu, patrz §1 zasada #3).

| # | Ryzyko (scenariusz awarii) | Impact | Likelihood | Źródło (dowód — nie anchor) |
|---|---|---|---|---|
| 1 | Użytkownik kończy sesję, ale rozmowa żyje dalej: model mówi, strumień mikrofonu nie jest zwolniony, licznik OpenAI bije | High | High | wywiad Q2 (realny incydent: „rozmowa się zakończyła, ale głos nadal odpowiadał"); wywiad Q3 (obszar zmieniany bez pewności); hot-spot `src/lib/realtime/` (3 commity/30d), `src/components/` (12/30d) |
| 2 | Endpoint mintujący tokeny Realtime jest nadużywany — rachunek OpenAI wystrzeliwuje | High | Medium | wywiad Q1; `context/deployment/deploy-plan.md` MERGE-GATE (rate limit + TTL ≤600 s + nagłówek identyfikacyjny), egzekwowany dziś wyłącznie ręcznie w review PR; `tech-stack.md`: OpenAI direct, bez gatewaya |
| 3 | Użytkownik widzi transkrypcję lub raport innej osoby | High | Medium | wywiad Q1; PRD §Access Control (płaska rola, własne konto); `context/archive/2026-07-23-session-archive-transcript/plan.md`; hot-spot `src/app/(app)/archive/` (9/30d — powierzchnia przenoszona w S-08) |
| 4 | Start rozmowy pada (brak zgody na mikrofon, błąd mintowania tokenu) i UI zostaje w stanie nierozstrzygniętym — użytkownik nie wie, czy czekać | High | Medium | wywiad Q1; PRD §Non-Functional Requirements (ciągły sygnał wizualny dla operacji >500 ms); roadmap S-03 Unknowns (kompatybilność toru audio, otwarte) |
| 5 | Raport łamie guardrail zaufania: pusta lista błędów renderuje się jak awaria, sesja krótsza niż 2 minuty dostaje wymyśloną ocenę, a odpowiedź niezgodna ze schematem renderuje pół raportu | High | Medium | PRD §Success Criteria → Guardrails; PRD US-01 kryteria akceptacji; hot-spot `src/app/api/report/` (2/30d) |
| 6 | Analiza po-sesyjna pada lub przekracza cap 300 s — sesja użytkownika przepada bezpowrotnie, bo surowe audio już nie istnieje | High | Medium | roadmap S-04 Unknowns (otwarte: jak zmieścić analizę transkryptu w capie 300 s); `context/deployment/deploy-plan.md` standing constraint #2; PRD §Guardrails (surowe audio usunięte po sesji) |
| 7 | Serwerowy klucz OpenAI trafia do przeglądarki zamiast efemerycznego sekretu klienta | High | Low | `tech-stack.md` (Realtime wymaga efemerycznych tokenów — powód odrzucenia OpenRoutera); `context/deployment/deploy-plan.md` (TTL ≤600 s, klucz per-środowisko) |

Ryzyko #7 ma niską prawdopodobność i normalnie należałoby do obserwowalności,
nie do testu. Zostaje w mapie, bo jego test jest niemal darmowy (celowana
asercja kształtu odpowiedzi route'u plus skan zbudowanego bundle'a), a koszt
awarii jest nieodwracalny.

### Risk Response Guidance

| Ryzyko | Co udowodni ochronę | Co zakwestionować | Kontekst, który `/10x-research` musi ugruntować | Prawdopodobnie najtańsza warstwa | Anty-wzorzec do uniknięcia |
|---|---|---|---|---|---|
| #1 | Każda ścieżka wyjścia z sesji (przycisk, unmount, błąd, zamknięcie karty) zwalnia połączenie i strumień mikrofonu; po zakończeniu nie płynie ani jeden token | „wywołanie metody zamykającej dowodzi, że połączenie padło" — nie dowodzi; oraz „jest jedna ścieżka wyjścia" | ile jest realnych ścieżek wyjścia, czy teardown jest synchroniczny, kto trzyma referencję do strumienia mediów, gdzie mieszka maszyna stanów rozmowy | unit / component z podmienioną granicą SDK | over-mockowanie wnętrza zamiast granicy transportu; test tylko szczęśliwej ścieżki (jeden przycisk) |
| #2 | Powtarzane żądania o token są odrzucane, zanim dotrą do OpenAI; token ma TTL ≤600 s; nagłówek identyfikacyjny jest wysyłany | „route jest za loginem, więc jest bezpieczny" — zalogowany użytkownik też może zapętlić żądania | czy limit działa per-IP, per-użytkownik czy per-sesja; gdzie żyje stan limitu (stan w module scope zabroniony przez deploy-plan); co dokładnie route wysyła do OpenAI | integration route handlera + contract | asercja skopiowana z kodu route'u zamiast z MERGE-GATE jako niezależnego kontraktu |
| #3 | Żądanie o cudzą sesję zwraca „nie znaleziono", nie cudze dane — i to samo dotyczy listy, szczegółu oraz usuwania | „RLS jest włączone, więc jest OK" — grant, polityka i ścieżka serwerowa to trzy osobne warunki, a jeden z nich już raz zawiódł | jak tożsamość użytkownika dociera do zapytania, którym klientem Supabase, czy któraś ścieżka omija RLS | integration na lokalnym stacku Supabase, dwa konta | test z jednym użytkownikiem — nie dowodzi izolacji |
| #4 | Nieudany start kończy się rozstrzygniętym, czytelnym stanem („brak zgody na mikrofon", „nie udało się połączyć — spróbuj ponownie"), nigdy wiszącym wskaźnikiem | „pusty stan znaczy, że nic się nie stało" — wiszący wskaźnik wygląda dla użytkownika jak trwające przetwarzanie | jakie stany ma maszyna rozmowy, jak błąd mintowania tokenu i odmowa dostępu do mikrofonu tłumaczą się na UI, czy istnieje stan terminalny | unit / component maszyny stanów, plus jedno przejście e2e | matryca przeglądarek jako substytut testu ścieżki błędu — droga i o niskim sygnale |
| #5 | Zerowa liczba błędów renderuje się jako poprawny wynik; sesja krótsza niż 2 minuty dostaje komunikat „za mało materiału", nie ocenę; odpowiedź niezgodna ze schematem pada głośno zamiast renderować pół raportu | „status 200 znaczy, że raport jest dobry"; „pusta lista znaczy brak wyniku" | gdzie mieszka próg 2 minut, jak liczona jest długość sesji, jak porażka walidacji schematu tłumaczy się na UI, skąd bierze się fixture transkryptu | integration z fixture'em transkryptu, oracle wzięty z PRD | **oracle problem** — wartość oczekiwana zdjęta z implementacji zamiast z wymagania; ocenianie jakości merytorycznej poprawki (wykluczone, §7) |
| #6 | Przekroczenie budżetu czasu kończy się komunikatem i zachowanym transkryptem — nie cichą utratą sesji | „analiza się udała, bo status końcowy to 200" | jaka jest strategia wobec capu 300 s (cap długości wejścia / streaming / route w tle), co jest zapisywane przed analizą, czy transkrypt przeżywa porażkę analizy | integration route'u z wymuszoną porażką i wymuszonym timeoutem | test tylko szczęśliwej ścieżki; symulacja timeoutu logiką skopiowaną z route'u |
| #7 | Odpowiedź route'u tokenów zawiera wyłącznie efemeryczny sekret z TTL; klucz serwerowy nie występuje w zbudowanym bundlu klienta | „prefiks publiczny w nazwie zmiennej jest jedyną drogą wycieku" | które zmienne środowiskowe są czytane po stronie klienta, co dokładnie route zwraca w ciele odpowiedzi | contract (celowana asercja kształtu odpowiedzi) + skan bundle'a | snapshot całej odpowiedzi bez znaczenia zamiast celowanej asercji |

## 3. Phased Rollout

Każdy wiersz to odrębna faza rolloutu, która otworzy własny folder zmiany
przez `/10x-new`. Status przesuwa się od lewej do prawej po wartościach ze
słownika poniżej; orkiestrator aktualizuje Status w miarę pojawiania się
artefaktów na dysku. Wartości Status pozostają po angielsku — parser
orkiestratora od nich zależy.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Bootstrap runnera + cykl życia sesji | Udowodnić, że każda ścieżka wyjścia z rozmowy faktycznie zamyka połączenie i zwalnia mikrofon | #1 | unit + component | complete | `context/changes/testing-session-lifecycle/` |
| 2 | Kontrakty route'ów serwerowych | Udowodnić, że route tokenów i route raportu trzymają się swoich kontraktów, a nie tylko szczęśliwej ścieżki | #2, #5, #6, #7 | integration + contract | not started | — |
| 3 | Izolacja danych między kontami | Udowodnić, że cudza sesja jest nieosiągalna na liście, w szczególe i w usuwaniu | #3 | integration (lokalny stack DB, dwa konta) | not started | — |
| 4 | E2E ścieżki krytycznej + widoczny stan startu | Udowodnić, że pełny przepływ przechodzi, a nieudany start kończy się czytelnym stanem terminalnym | #4 | e2e | not started | — |
| 5 | Bramki CI + warstwa AI-native | Zablokować podłogę w CI i dołożyć selektywny przegląd multimodalny stanów rozmowy | cross-cutting | gates, post-edit hook, przegląd multimodalny | not started | — |

**Słownik Status** (stały — literały parsera): `not started` → `change opened`
→ `researched` → `planned` → `implementing` → `complete`.

Kolejność wynika z trzech rzeczy: faza 1 jest jedynym ryzykiem High × High i
jedynym realnie przeżytym incydentem, a bez runnera żadna kolejna faza nie ma
na czym stanąć; fazy 2–3 idą przed 4, bo integration jest tańsza niż e2e; e2e
w fazie 4 jest promowane tylko dlatego, że nic tańszego nie łapie przejścia
auth + WebRTC + route; faza 5 jest na końcu, bo bramka ma sens dopiero wtedy,
gdy jest co bramkować.

**Bramka testów z fazy 5 wyszła poza kolejność.** Została dostarczona w
`context/changes/vercel-build-test-gate/`: `buildCommand` w `vercel.ts` uruchamia
`npm run test:run` przed `next build`, więc czerwony suite kończy build błędem i
przez required status check `Vercel` blokuje merge oraz deploy produkcyjny
(udowodnione empirycznie na PR #29 — czerwony commit dał `FAILURE` i zablokowany
merge, revert wrócił na `SUCCESS`). Wcześniejsze domknięcie było obronne, bo po
fazie 1 jest już co bramkować: 11 hermetycznych testów w 2 plikach. Status fazy 5
zostaje `not started`, bo jej pozostałe elementy — lint w bramce, post-edit hook i
przegląd multimodalny stanów rozmowy — nie ruszyły.

**Brak osobnej fazy AI-native.** Warstwa AI-native jest zmieszczona w fazie 5
i ograniczona do jednego zastosowania, które daje sygnał niedostępny tanio
klasycznie: animowany wskaźnik stanu rozmowy (`src/components/` — 12
commitów/30 d), gdzie deterministyczny diff wizualny generuje szum, a awaria
jest semantyczna („użytkownik nie wie, czy aplikacja go słyszy", PRD §NFR).
Warunek odwrotny zapisany w §4.

## 4. Stack

Klasyczna baza testowa tego projektu. Narzędzia AI-native noszą datę
`checked:`, żeby przyszły czytelnik widział, które linie wymagają ponownej
weryfikacji. Rekomendacje w tej sekcji są ugruntowane w lokalnych manifestach
i configach oraz w MCP faktycznie wystawionych w sesji, w której plan powstał.

| Warstwa | Narzędzie | Wersja | Notatka |
|---|---|---|---|
| unit + integration | Vitest | `vitest` 4.1.10 (Phase 1) | Setup dla App Router: `vitest.config.mts` z `@vitejs/plugin-react` i `vite-tsconfig-paths` (alias `@/*` jest wymagany przez AGENTS.md), środowisko `jsdom` 30.0.1 |
| komponenty | @testing-library/react | 16.3.2 + `jest-dom` 7.0.0 (Phase 1) | Asercje na rolach i tekście, nie na strukturze DOM |
| granica sieci / SDK | mock na granicy transportu (MSW dla HTTP, podmiana modułu dla SDK Realtime) | fake SDK: `src/test/fakes/realtime-session.ts` (Phase 1); MSW: brak — patrz Phase 2 | Nigdy nie mockować modułów wewnętrznych — polityka §6.2 |
| integration DB / polityki dostępu | lokalny stack Supabase przez CLI | `supabase` 2.109.1 (już w devDependencies) | Jedyna warstwa, która realnie sprawdza grant + politykę + ścieżkę serwerową razem |
| e2e | Playwright | brak — patrz Phase 4 | Wymagane też dla async Server Components — Vitest ich nie wspiera (docsy Next.js) |
| walidacja kontraktów | `zod` 4.4 | już w dependencies | Schemat produktowy jest źródłem oracle'a dla #5, o ile pochodzi z wymagania, nie z odpowiedzi modelu |
| accessibility | axe-core | nie planowane | PRD §Non-Goals wyklucza zgodność WCAG-AA w v1 — patrz §7 |
| (opcjonalnie) AI-native | przegląd multimodalny 1–3 ekranów (stany rozmowy) — checked: 2026-07-29 | n/a | **Kiedy NIE używać:** gdy zmiana dotyczy tekstu, statycznego układu albo czegokolwiek, co łapie asercja na roli lub tekście — wtedy przegląd multimodalny jest droższy i mniej powtarzalny niż zwykły test |
| (opcjonalnie) AI-native | post-edit hook w pętli agenta — checked: 2026-07-29 | n/a | **Kiedy NIE używać:** jako substytutu bramki CI — hook jest lokalny i da się go pominąć |

**Stack grounding tools (current session):**

- Docs: Context7 MCP — sprawdzony setup Vitest dla Next.js 16 App Router (`vitest.config.mts`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`; async Server Components niewspierane przez Vitest, kierowane do e2e); checked: 2026-07-29
- Search: Exa MCP — dostępny, nieużyty w tej fazie (oficjalne docsy Next.js pokryły temat setupu; użyć w fazach 4–5 do weryfikacji aktualnego statusu narzędzi e2e i przeglądu multimodalnego); checked: 2026-07-29
- Runtime/browser: Playwright MCP **niedostępny w tej sesji**. Vercel MCP wystawia pobranie preview URL za Deployment Protection — użyteczne jako ręczny smoke, nie jako automatyzacja przeglądarki; checked: 2026-07-29
- Provider/platform: Vercel MCP dostępny (build logs, runtime logs, runtime errors) — istotny dla pre-prod smoke i diagnostyki (uwaga: logi runtime na Hobby żyją 1 h). Supabase MCP i GitHub MCP niedostępne w tej sesji; dostępne `gh` CLI i `supabase` CLI; checked: 2026-07-29

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana dotrze na produkcję.
„required after §3 Phase N" znaczy, że bramka jest wymuszana, gdy ta faza
rolloutu wyląduje; przed tym bramka jest planowana.

| Bramka | Gdzie | Wymagana? | Co łapie |
|---|---|---|---|
| typecheck | Vercel preview build (już podłączone) + CI | required | dryf typów |
| lint (ESLint) | dziś tylko lokalnie | required after §3 Phase 5 | dryf stylu i błędy wykrywalne statycznie; AGENTS.md potwierdza, że ESLint nie biegnie dziś w CI |
| unit + integration | lokalnie + Vercel preview build (podpięte: `buildCommand` w `vercel.ts`) | required | regresje logiki, w szczególności teardown sesji |
| MERGE-GATE tokenów Realtime (rate limit + TTL ≤600 s + nagłówek identyfikacyjny) | dziś review PR; test od §3 Phase 2 | required | runaway bill (ryzyko #2) — dziś egzekwowane wyłącznie ludzkim review |
| integration polityk dostępu (dwa konta) | lokalnie + CI | required after §3 Phase 3 | wyciek danych między kontami (ryzyko #3) |
| e2e ścieżki krytycznej | CI na PR | required after §3 Phase 4 | zerwana ścieżka login → temat → rozmowa → raport → archiwum |
| post-edit hook | lokalnie (pętla agenta) | recommended after §3 Phase 5 | regresje w momencie edycji; nie jest substytutem CI |
| przegląd multimodalny stanów rozmowy (1–3 ekrany) | CI na PR | optional after §3 Phase 5 | semantyczne awarie wskaźnika stanu, których nie łapie asercja na tekście |
| pre-prod smoke na preview URL | między mergem a produkcją | optional | awarie zależne od środowiska (zmienne, redirect OAuth) |

## 6. Cookbook Patterns

Jak dodawać nowe testy w tym projekcie. Każda podsekcja wypełnia się, kiedy
odpowiednia faza rolloutu wyląduje; przed tym podsekcja mówi
„TBD — patrz §3 Phase N".

### 6.1 Dodanie testu jednostkowego

- **Gdzie**: obok jednostki, którą pokrywasz — `src/lib/realtime/transcript.test.ts`
  leży przy `transcript.ts` (kolokacja z AGENTS.md §Testing Guidelines).
- **Jak uruchomić**: `npm test` w pracy (watch), `npm run test:run` jako bramka
  (samo `vitest` bez flagi wchodzi w watch i zawiesza skrypt w CI).
- **Skąd oracle**: z wymagania — PRD, FR, guardrail — **nigdy** z implementacji.
  Asercja policzona tą samą logiką co kod jest lustrem, które przejdzie na
  zielono także na buggu. Nie importuj stałych z testowanego modułu do asercji.
- `describe` / `it` / `expect` / `vi` są globalne (`globals: true` w
  `vitest.config.mts` + `types: ["node", "vitest/globals"]` w `tsconfig.json`) —
  nie importuj ich.
- **Wzorzec referencyjny**: `src/lib/realtime/transcript.test.ts` — oracle wzięty
  z PRD §Guardrails, cztery asercje na wartościach, zero asercji na przebiegu pętli.

### 6.2 Dodanie testu komponentu z podmienioną granicą SDK

- **Co podmieniamy**: cały moduł `@openai/agents-realtime` — granica zewnętrzna.
  Modułów wewnętrznych (`@/lib/**`, `@/components/**`) nie mockujemy nigdy.
- **Fake**: `src/test/fakes/realtime-session.ts`. Rejestr wywołań jest globalny
  dla modułu (instancje powstają wewnątrz efektu komponentu, test nie ma szansy
  wstrzyknąć własnego) — dlatego `resetRealtimeFake()` w `beforeEach` jest
  obowiązkowy.
- **Deklaracja mocka**: `vi.mock(import('@openai/agents-realtime'), async () => (await import('@/test/fakes/realtime-session')).realtimeFakeModule())`.
  Dynamiczny `await import` w fabryce, nie symbol z góry pliku — `vi.mock` jest
  hoistowany nad importy i statyczny symbol byłby jeszcze niezainicjalizowany.
- **Uchwyty fake'a** (to jest cała jego wartość — bez nich zostaje licznik):
  `realtimeSessions()[0].emit('history_updated', items)` wystrzeliwuje zdarzenie
  sesji, `.transport.emit('connection_change', 'disconnected')` — zdarzenie
  transportu, `holdConnect()` wstrzymuje każde kolejne `connect()` do ręcznego
  `resolve()` / `reject()` (wołaj **przed** renderem — instancja powstaje
  w efekcie), `realtimeCalls()` zwraca pełną sekwencję, gdy liczba nie wystarcza.
- **Drenaż łańcucha łączenia.** Efekt czeka na `getUserMedia → fetch → json →
  connect`; po renderze i po każdym rozwiązaniu bramki trzeba przepuścić
  mikrozadania — `await settle()` w `voice-conversation.test.tsx` (pętla
  `Promise.resolve()` wewnątrz `act`) jest tym helperem. Same mikrozadania, więc
  działa identycznie na prawdziwych i sfałszowanych timerach.
- **Pułapka `getUserMedia`.** Kod robi własny probe uprawnień przed `connect()`,
  więc stub `navigator.mediaDevices` musi oddać obiekt z `getTracks()`
  zwracającym ścieżkę ze `stop()`. Bez tego test po cichu bada gałąź
  `mic-denied` zamiast ścieżki, którą miał badać — i przechodzi.
- **Sprzątanie.** `afterEach`: `vi.useRealTimers()`, `vi.unstubAllGlobals()`,
  `vi.restoreAllMocks()`. `console.error` warto podmienić szpiegiem i asertować
  jego brak — cicha gałąź `catch` w kodzie produkcyjnym loguje, więc brak logu
  jest sygnałem, że przebieg poszedł zamierzoną ścieżką.
- **Fake jest minimalny.** Modeluje wyłącznie powierzchnię, której dotyka kod
  produkcyjny. Czego nie modeluje (`getSenders()`, `track.readyState`,
  `peerConnection`, `<audio>`), nie modeluje **celowo** — asercja o tym byłaby
  asercją o fake'u, zieloną nawet gdyby produkcja przeciekała (patrz §6.7).
- **Kliknięcia**: `fireEvent` z `@testing-library/react`, nie
  `@testing-library/user-event` — ten drugi wymaga opcji `advanceTimers` przy
  `vi.useFakeTimers()` i łatwo zakleszcza testy odliczania.
- **Sieć**: `vi.stubGlobal('fetch', ...)` plus rozwiązywalny `deferred()`, kiedy
  test bada wyścig — potrzebna jest kontrola nad *momentem* odpowiedzi. MSW
  wchodzi od §3 Phase 2, gdzie liczy się *treść* odpowiedzi route'ów.
- **Timery**: `vi.useFakeTimers()` per test, `vi.useRealTimers()` w `afterEach`;
  przesuwanie czasu przez `await act(async () => vi.advanceTimersByTimeAsync(...))`.
- **Asercje**: na wywołaniach SDK (`countRealtimeCalls('connect' | 'close' | 'requestResponse')`)
  oraz na rolach i tekście, nigdy na strukturze DOM. „Zakończone" znaczy brak
  dalszej aktywności sesji, nie samą zmianę ekranu.
- **Wzorzec referencyjny**: `src/components/voice-conversation.test.tsx`.

### 6.3 Dodanie testu integracyjnego route handlera

- TBD — patrz §3 Phase 2 (wzorzec dla ryzyk #2, #6, #7: kontrakt żądanie → odpowiedź plus efekt uboczny, z wymuszoną porażką i wymuszonym timeoutem).

### 6.4 Dodanie testu kontraktu odpowiedzi modelu

- TBD — patrz §3 Phase 2 (wzorzec dla ryzyka #5: fixture transkryptu, oracle z wymagania PRD; pusta lista błędów jako poprawny wynik; niezgodność ze schematem pada głośno).

### 6.5 Dodanie testu polityki dostępu

- TBD — patrz §3 Phase 3 (wzorzec dla ryzyka #3: dwa konta na lokalnym stacku, sprawdzenie listy, szczegółu i usuwania).

### 6.6 Dodanie testu e2e

- TBD — patrz §3 Phase 4 (wzorzec dla ryzyka #4: ścieżka krytyczna oraz nieudany start kończący się stanem terminalnym).

### 6.7 Notatki per faza rolloutu

**Phase 1 — bootstrap runnera + cykl życia sesji (2026-07-29):**

- **Granica jsdom.** Fizyczne zwolnienie mikrofonu jest w tej warstwie
  niedowodliwe: nasz kod nie trzyma referencji do `MediaStream` (własne
  `getUserMedia` to probe uprawnień zatrzymywany linijkę dalej), a bez
  `window.RTCPeerConnection` SDK po cichu wybiera transport WebSocket, którego
  `close()` w ogóle nie dotyka ścieżek mediów. Zostaje **ręcznym smoke'em
  w przeglądarce** i jest wymieniony w §7 razem z matrycą audio.
- **Pułapka `types` w `tsconfig.json`.** Jawny klucz `types` wyłącza automatyczne
  ładowanie `@types`, więc **musi** zawierać `"node"` — `src/` ma 6 użyć
  `process.env` i bez tego `next build` pada na preview Vercela. Każdy przyszły
  pakiet typów globalnych trzeba dopisać w tym miejscu. Dlatego `npm run build`
  jest bramką automatyczną w każdej fazie, nie tylko w pierwszej.
- **Ryzyko #1 NIE jest zamknięte w całości.** Niepokryte zostały dwie ścieżki
  wyjścia leżące poza drzewem `SessionStart`: link logo w headerze (soft-nav na
  tę samą trasę nie zatrzymuje sesji — **prawdopodobnie realny defekt, świadomie
  w produkcji**) i zamknięcie karty (zero handlerów `beforeunload` / `pagehide`
  w `src/`). Obie są testowalne tylko e2e → §3 Phase 4.
- **Kolejność, którą warto powtórzyć w kolejnych fazach TDD.** Najpierw testy
  ścieżek, które są dziś poprawne (tu: limit czasu i unmount) — ich zielony kolor
  waliduje fake i harness. Dopiero potem czerwony test defektu, którego kolor już
  nie ma alternatywnego wyjaśnienia („defekt czy błąd w świeżym fake'u?").

## 7. What We Deliberately Don't Test

Wyłączenia ustalone w trakcie rolloutu. Przyszli kontrybutorzy powinni je
respektować, dopóki nie zmieni się założenie, na którym stoją.

- **Jakość językowa i pedagogiczna odpowiedzi modelu** — nie oceniamy testem, czy tutor zadał dobre pytanie ani czy poprawka gramatyczna jest merytorycznie najlepsza. Testy sprawdzają kształt i kontrakt, nie merytorykę. Do rewizji, jeśli pojawi się zewnętrzny feedback, że raport myli się co do faktów. (Źródło: wywiad Faza 2 Q5.)
- **Matryca przeglądarek dla toru audio (w szczególności Safari iOS)** — pozostaje ręcznym smoke'em na realnym urządzeniu; automat byłby drogi i nie odtworzyłby realnego mikrofonu. Zamiast tego ryzyko #4 testuje ścieżkę błędu startu, którą da się sprawdzić wszędzie. Do rewizji, jeśli pojawi się druga awaria specyficzna dla platformy. (Źródło: ustalenie challengera Faza 3, przeciw roadmap S-03 Unknowns.)
- **Zgodność WCAG-AA** — nie celujemy w certyfikację a11y w v1. Do rewizji przy v2 (pełna obsługa audio-first dla niedowidzących). (Źródło: PRD §Non-Goals.)
- **Warstwa pod nami** — nie testujemy, czy Postgres egzekwuje RLS ani czy routing Next.js działa. Testujemy nasze polityki, nasze route'y i nasze ścieżki serwerowe. (Źródło: §1 zasada koszt × sygnał.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-07-29
- Stack versions last verified: 2026-07-29
- AI-native tool references last verified: 2026-07-29

Odśwież (`/10x-test-plan --refresh`), kiedy:

- pojawi się nowe ryzyko z top-3 z roadmapy lub archiwum,
- data `checked:` rekomendowanego narzędzia będzie starsza niż trzy miesiące,
- zmieni się stack projektu (nowy framework, nowy runner testów),
- §7 przestanie odpowiadać temu, w co zespół faktycznie wierzy.
