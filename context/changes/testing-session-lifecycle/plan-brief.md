# Bootstrap runnera + cykl życia sesji — Plan Brief

> Pełny plan: `context/changes/testing-session-lifecycle/plan.md`
> Research: `context/changes/testing-session-lifecycle/research.md`

## What & Why

Faza 1 rolloutu testów (`test-plan.md` §3). Stawiamy runner testów od zera
i zamykamy ryzyko #1 — jedyne High × High w mapie ryzyk i jedyny realnie
przeżyty incydent: *„rozmowa się zakończyła, ale głos nadal odpowiadał"*.
Research potwierdził, że to nie hipoteza: przycisk „Zakończ rozmowę" wciśnięty
w oknie `connecting` prowadzi do w pełni działającej sesji WebRTC **po** pokazaniu
ekranu raportu — mikrofon wraca na antenę, tutor mówi, licznik OpenAI bije aż do
odmontowania komponentu.

## Starting Point

Runner nie istnieje w żadnej formie (brak skryptu `test`, brak zależności, brak
plików testowych, brak `.github/`) — i był to powtarzany wybór, nie przeoczenie:
deklaracja „no test framework" wraca w sześciu planach w archiwum. Cykl życia
sesji też nie istnieje jako jednostka: konstrukcja, wiring 9 subskrypcji,
`connect()` i teardown siedzą inline w jednym `useEffect`
(`voice-conversation.tsx:157-307`). Z 9 ścieżek wyjścia znalezionych przez
research **tylko jedna robi pełny teardown** — cleanup efektu. Przycisk i twardy
limit 3:00 robią wyłącznie `close()`, bez ustawienia flagi anulowania, a ta flaga
należy wyłącznie do cleanupu. To jest architektoniczne sedno defektu.

## Desired End State

`npm test` uruchamia Vitest w jsdom, a `npm run build` pozostaje zielony. Trzy
ścieżki wyjścia (przycisk, limit 3:00, unmount) mają testy dowodzące, że po
zakończeniu rozmowy nie następuje żadna aktywność sesji. Defekt jest naprawiony:
świadome zakończenie jest respektowane przez każdą późniejszą gałąź efektu
łączącego, więc użytkownik, który kończy sesję w trakcie łączenia, nie dostaje
mówiącego tutora na ekranie raportu ani mikrofonu na antenie.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres fixa | Test **i** fix w tej fazie | Bez fixa faza kończy się czerwonym buildem, a ryzyko #1 zostaje otwarte; test najpierw daje dowód, że łapie regresję | Plan |
| Seam do SDK | `vi.mock` modułu `@openai/agents-realtime`, zero zmian w produkcji | To granica transportu wymagana przez `test-plan.md:113`; refaktor pliku dotykanego przez 6 slice'ów bez siatki testowej ma ujemny bilans ryzyka | Plan |
| Głębokość fake'a | Minimalny — tylko kontrakt naszego kodu | Fake modelujący `getSenders()`/`track.readyState` dawałby zieloną asercję „mikrofon zwolniony" nawet gdyby produkcja przeciekała | Plan |
| Ścieżki wyjścia | A (przycisk), B (limit 3:00), C (unmount) | Trzy ścieżki z własnym ciałem kodu; D/E/F sprowadzają się do C, H/I są testowalne tylko e2e | Plan |
| Defekty poboczne | Tylko D2 (utrata raportu) razem z D1 | D2 to druga twarz tego samego wyścigu — rozdzielenie znaczy, że test przechodzi, a użytkownik i tak traci raport | Plan |
| Typy testowe | `types: ["node", "vitest/globals"]` w głównym `tsconfig.json` | Jeden tsconfig dla builda, IDE i Vitesta eliminuje klasę błędu „zielone lokalnie, czerwone na Vercelu" | Plan |
| Warstwa sieciowa | Stub `fetch` z deferredem; MSW od fazy 2 | Test defektu musi wstrzymać fetch tokenu **w połowie lotu**, a nie tylko podmienić treść odpowiedzi | Plan |
| Tryb wykonania | Mieszany: `/10x-implement` na fazy 1, 2, 4; `/10x-tdd` na fazę 3 | TDD trafia tam, gdzie jego pauza ma wartość — przy fixie defektu, który musi najpierw być czerwony | Plan |
| Kolejność ścieżek | B i C **przed** A | Zielony kolor testów na poprawnych ścieżkach waliduje fake; bez tego czerwień w fazie 3 jest dwuznaczna (defekt czy zły mock?) | Plan |
| Granica jsdom | Fizyczne zwolnienie mikrofonu zostaje ręcznym smoke'em | Bez `RTCPeerConnection` SDK po cichu bierze transport WebSocket, którego `close()` nie dotyka mediów — test w jsdom ćwiczyłby inny kod niż produkcja | Research |
| Ładowanie env | Niepotrzebne w tej fazie | Drzewo importów `voice-conversation.tsx` nie czyta `process.env` (zweryfikowane) — rozstrzyga otwarte pytanie #6 z researchu | Plan |

## Scope

**W zakresie:**
- Vitest 4.1.10 + jsdom 30 + Testing Library 16 + `vite-tsconfig-paths`, skrypt `test`
- Smoke test warstwy czystej (`buildTurns`) z oracle'em z PRD §Guardrails
- Minimalny fake modułu SDK i uprząż testu komponentu
- Testy ścieżek wyjścia A, B, C + regresja D2
- Fix D1 i D2 w `voice-conversation.tsx`
- Wypełnienie `test-plan.md` §6.1, §6.2, §6.7 i sync statusu; korekta `AGENTS.md`

**Poza zakresem:**
- Refaktor do hooka `useRealtimeSession` i wstrzykiwanie `options.transport`
- Ścieżki D/E/F (redukują się do unmountu), H (link logo — prawdopodobny defekt, zostaje) i I (zamknięcie karty)
- Ścieżki błędowe i defekty D3, D4, D6 — ryzyko #4 / faza 4, albo świadomie nieszkodliwe
- MSW, CI, Playwright, mutation testing (Stryker)
- Asercja fizycznego zwolnienia mikrofonu

## Architecture / Approach

```
Faza 1: konfiguracja + smoke na funkcji czystej   → harness żyje
Faza 2: fake modułu SDK + ścieżki B i C           → ZIELONE = fake jest wiarygodny
Faza 3: ścieżka A w `connecting`                  → CZERWONE = defekt, nie mock
        → fix D1 + D2                             → ZIELONE
Faza 4: cookbook + sync test-planu                → wiedza zostaje w repo
```

Podmieniana jest jedna granica: statyczny import `@openai/agents-realtime`
(`voice-conversation.tsx:4-8` — cała powierzchnia SDK w projekcie). Fake wystawia
`connect`/`close`/`status`/`requestResponse` i emiter 9 zdarzeń, rejestrując
kolejność wywołań. Świadomie **nie** modeluje `getSenders()` ani `peerConnection`.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Bootstrap runnera | Działający `npm test` bez wywrócenia `next build` | Klucz `types` odcina automatyczne `@types` — bez `"node"` padnie typecheck 6 miejsc z `process.env` |
| 2. Fake SDK + ścieżki B i C | Wiarygodny fake i dwa zielone testy teardownu | Fake zbyt głęboki — wtedy faza 3 mierzy mock, nie kod |
| 3. Ścieżka A + fix D1/D2 | Czerwony test, potem naprawione ryzyko #1 | Fix zamyka jedno okno wyścigu i otwiera drugie (zakończenie już po starcie `connect()`) |
| 4. Cookbook + sync | §6.1/§6.2/§6.7 wypełnione, status `complete` | Cookbook opisze idealny, a nie faktyczny wzorzec — i następna faza go zignoruje |

**Prerequisites:** research zakończony (jest); lokalny `npm install`; branch
z PR-em (`lessons.md` — push na master jest blokowany rulesetem); dla ręcznego
smoke'a w fazie 3 działający mikrofon i klucz OpenAI w `.env.local`.

**Estimated effort:** ~2–3 sesje. Faza 1 krótka, faza 2 najdłuższa (projekt
fake'a), faza 3 średnia z obowiązkowym smoke'em w przeglądarce, faza 4 krótka.

## Open Risks & Assumptions

- **Założenie do falsyfikacji w fazie 2**: ścieżki B i C są dziś poprawne, więc
  ich testy przechodzą bez zmiany kodu produkcyjnego. Gdyby wymagały zmiany,
  research pomylił się co do zakresu defektu i plan trzeba przeliczyć.
- **Fix D1 opiera się na `userEndedRef`**, który jest resetowany na starcie efektu
  (`:161`). Poprawność retry (`attempt` w depsach) zależy od tego resetu — dlatego
  retry jest osobnym punktem weryfikacji ręcznej.
- **Ryzyko #1 nie zostaje zamknięte w całości.** Ścieżki H i I pozostają
  niepokryte, a fizycznego zwolnienia mikrofonu ta warstwa nie dowodzi. §6.7
  musi to powiedzieć wprost, inaczej faza 4 odziedziczy fałszywe poczucie
  pokrycia.
- **Mock modułu jest wrażliwy na upgrade SDK.** Zmiana kształtu API
  `@openai/agents-realtime` przejdzie typecheck fake'a, ale rozejdzie się
  z produkcją — stąd notatka w cookbooku §6.2.

## Success Criteria (Summary)

- Użytkownik, który kończy sesję w trakcie łączenia, widzi ekran raportu i nic
  więcej: mikrofon zgaszony, tutor milczy, nic nie płynie do OpenAI.
- Użytkownik, który kończy sesję po starcie łączenia, dostaje swój raport —
  nie kartę „Połączenie przerwane".
- Regresja w teardownie którejkolwiek z trzech pokrytych ścieżek zapala się na
  czerwono lokalnie, zanim trafi do PR-a.
