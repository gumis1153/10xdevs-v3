---
date: 2026-07-29T19:46:00+02:00
researcher: piotr.jakubowski
git_commit: 54b78e553ddd651c74d3cb66ca064aeeaf56f17e
branch: feat/readme-project-overview
repository: gumis1153/10xdevs-v3
topic: "Cykl życia sesji Realtime — ścieżki wyjścia, teardown i powierzchnia bootstrapu runnera testów (test-plan §3 Phase 1, ryzyko #1)"
tags: [research, codebase, realtime, session-lifecycle, teardown, vitest, testing]
status: complete
last_updated: 2026-07-29
last_updated_by: piotr.jakubowski
---

# Research: cykl życia sesji Realtime (test-plan §3 Phase 1)

**Data**: 2026-07-29 19:46 +02:00
**Badacz**: piotr.jakubowski
**Commit**: `54b78e553ddd651c74d3cb66ca064aeeaf56f17e`
**Branch**: `feat/readme-project-overview`
**Repozytorium**: `gumis1153/10xdevs-v3`

## Research Question

Ugruntowanie ryzyka #1 z `context/foundation/test-plan.md:44`:

> „Użytkownik kończy sesję, ale rozmowa żyje dalej: model mówi, strumień
> mikrofonu nie jest zwolniony, licznik OpenAI bije."

Konkretnie — cztery pytania, które `test-plan.md:61` zleca researchowi:
ile jest realnych ścieżek wyjścia, czy teardown jest synchroniczny, kto trzyma
referencję do strumienia mediów, gdzie mieszka maszyna stanów rozmowy. Plus
inwentaryzacja powierzchni bootstrapu runnera (faza nazywa się „Bootstrap
runnera + cykl życia sesji").

## Summary

**Ryzyko #1 nie jest hipotetyczne — jest w kodzie i ma dokładny adres.**
Przycisk „Zakończ rozmowę" jest celowo aktywny w stanie `connecting`
(`voice-conversation.tsx:381-382`). Wciśnięty w tym oknie wywołuje
`session.close()` na transporcie, który jeszcze nie istnieje — w SDK jest to
**kompletny no-op, który nie zostawia żadnej flagi „zamknięte"**. Efekt łączący
leci dalej bez żadnego guardu, `connect()` nie ma warunku „byłem zamykany",
więc **po zakończeniu rozmowy powstaje w pełni działająca sesja WebRTC**:
mikrofon wraca na antenę, `requestResponse()` każe tutorowi mówić, a audio
leci przez odłączony `<audio autoplay>` tworzony wewnątrz SDK, do którego nasz
kod nie ma referencji. UI pokazuje ekran raportu — wszystkie późniejsze
`setActiveState` są zjadane przez guard stanu terminalnego
(`voice-conversation.tsx:147-149`). Nic tego nie zamyka aż do unmountu, który
zależy od dobrowolnego kliknięcia „Nowa sesja".

To jest jeden do jednego opis incydentu z wywiadu Q2. Zgodnie z `test-plan.md:28`
(„jeśli plan i research nie zgadzają się, prawdą podstawową jest research")
— research potwierdza ryzyko i zawęża je do **jednej ścieżki wyjścia w jednym
oknie czasowym**, a nie do „teardownu w ogóle".

Pozostałe ustalenia, które przestawiają założenia planu:

1. **Ścieżek wyjścia jest 9, nie 4.** Plan zakładał „przycisk, unmount, błąd,
   zamknięcie karty". Doszły: twardy limit 3:00, dwa przyciski z kart błędu,
   „Nowa sesja" z ekranu raportu, wylogowanie z headera. **Zamknięcie karty
   nie istnieje jako ścieżka w kodzie** — zero handlerów `beforeunload` /
   `pagehide` / `visibilitychange` w całym `src/`.
2. **Tylko jedna ścieżka robi pełny teardown** — cleanup efektu
   (`voice-conversation.tsx:301-306`). Przycisk i timer robią wyłącznie
   `close()`, bez flagi `cancelled` i bez czyszczenia fallback-timera.
3. **`close()` jest w 100% synchroniczne i zwraca `void`** — nie ma czego
   awaitować. Ale synchroniczność sygnatury nie znaczy synchroniczności
   skutku: archiwum ma udokumentowany race, w którym ostatnie
   `history_updated` nie zdąża przed `buildTurns` (`post-session-report/reviews/impl-review.md:44`).
4. **Nasz kod nie trzyma żadnej referencji do `MediaStream`.** Nasze
   `getUserMedia` (`:248-253`) to probe uprawnień, zatrzymywany linijkę
   dalej. Prawdziwy strumień żyje w SDK i jest zwalniany wyłącznie przez
   `getSenders().forEach(s => s.track?.stop())` w `close()` transportu —
   czyli **tylko wtedy, gdy ścieżka zdążyła zostać dołączona jako sender**.
5. **Pułapka jsdom, która przewraca naiwny plan testu**: bez
   `window.RTCPeerConnection` SDK po cichu wybiera transport WebSocket
   (`realtimeSession.mjs:107-116`), a jego `close()` **nie dotyka żadnych
   ścieżek mediów i nigdy nie woła `getUserMedia`**. Test w jsdom na
   niezamockowanym SDK sprawdzałby inny kod niż produkcja i **nigdy nie
   wykryłby wycieku mikrofonu**. Jedyny sensowny seam to podmiana modułu
   `@openai/agents-realtime` na granicy transportu.
6. **Runner: zero infrastruktury.** Brak skryptu `test`, brak
   `vitest`/`jsdom`/`@testing-library`/`msw` w `package.json`, w
   `package-lock.json` (także tranzytywnie) i na dysku. Brak `.github/`.
   Za to `tsconfig.json` `include` łapie `**/*.ts`, a `next.config.ts` **nie**
   ma `typescript.ignoreBuildErrors` — więc pliki testowe bez typów runnera
   wywrócą `next build` na Vercelu.

## Detailed Findings

### A. Ścieżki wyjścia — pełna lista (9)

Referencyjny teardown = `RealtimeSession.close()` → `realtimeSession.mjs:846-851`
→ `openaiRealtimeWebRtc.mjs:400-419` (clear timer → `dataChannel.close()` →
`getSenders().forEach(s => s.track?.stop())` → `peerConnection.close()` →
stan `disconnected` → emit `connection_change`).

| # | Ścieżka | Wyzwalacz | Co realnie robi | Czego NIE robi |
|---|---|---|---|---|
| A | Przycisk „Zakończ rozmowę" | `:464-470` → `endConversation` `:383-388` | `userEndedRef=true`, `sessionRef.current?.close()`, reset countdownu, `setState('ended')` | nie ustawia `cancelled`, nie czyści `openingFallbackId`, nie unmountuje → **cleanup efektu nigdy nie leci** |
| B | Twardy limit 3:00 | interval `:314-330`, `next === 0` | to samo co A | to samo co A; ryzyko mniejsze, bo interval arma się dopiero po `connect()` |
| C | Unmount komponentu | cleanup efektu `:301-306` | `cancelled=true`, `clearOpeningFallback()`, `sessionRef=null`, `session.close()` przez domknięcie | nie przerywa lotu `/api/report` (brak `AbortController` w całym `src/`) |
| D | „Spróbuj ponownie" (karta błędu) | `retryConversation` `:390-395` | `attempt+1` → zmiana depsów → pełny cleanup C → świeża sesja | — |
| E | „Wróć do tematu" (karta błędu) | `:420` → `session-start.tsx:42-45` | `phase='proposal'` → unmount → cleanup C | dostępne **wyłącznie** w `state === 'error'` |
| F | „Nowa sesja" (ekran raportu) | `session-report.tsx:68/89/97/115` → `session-start.tsx:49-53` | unmount → cleanup C | **to jest jedyne, co sprząta wyciek ze ścieżki A — i jest dobrowolne** |
| G | Wylogowanie z headera | `account-menu.tsx:99-106` → `auth/actions.ts:41-49` → `redirect('/login')` | pełna nawigacja → unmount → cleanup C | teardown dopiero po round-tripie serwerowym |
| H | Link „logo" w headerze | `app-header.tsx:22-27`, renderowany przez `(app)/layout.tsx:32` | **nic** — soft-nav na tę samą trasę, React rekoncyliuje ten sam `SessionStart`, `phase` przeżywa | jedyny zawsze widoczny link nawigacyjny **nie zatrzymuje sesji** |
| I | Zamknięcie / przeładowanie karty | **BRAK HANDLERA** | przeglądarka zrywa `RTCPeerConnection` (mikrofon wraca) | aplikacja nie wysyła hangupu: `transport.callId` nigdy nie czytane, brak endpointu terminacji (`src/app/api/` ma tylko `realtime/token` i `report`) |

Ścieżki błędowe (nie kończą sesji same z siebie):

| Wyzwalacz | Handler | Teardown |
|---|---|---|
| `getUserMedia` reject (`NotAllowedError`) | `catch :288-298` | zbędny — probe już zatrzymany `:253` |
| `/api/realtime/token` non-2xx | `catch :288-298` → `setState('error')` | **`session.close()` NIE jest wołane**; obiekt zostaje w `sessionRef` do unmountu |
| `connect()` reject | `catch :288-298` | SDK zamknął się sam (`openaiRealtimeWebRtc.mjs:293/358/368`) |
| `session.on('error')` | `:205-207` — **tylko `console.error`** | **brak teardownu, brak zmiany stanu, brak sygnału dla użytkownika** |
| `connection_change → 'disconnected'` | `:229-244` | **nasz handler nie woła `close()`** — maluje kartę błędu i ufa, że SDK zamknął |

### B. Potwierdzony defekt: wyścig „koniec w trakcie łączenia" (D1)

Sekwencja, krok po kroku:

1. Użytkownik klika kartę tematu → `phase='conversation'` → mount →
   efekt `:157-307` startuje IIFE `:246-299`.
2. IIFE czeka na `await navigator.mediaDevices.getUserMedia` (`:250`), potem na
   `await fetch('/api/realtime/token')` (`:258`). Okno realne — dwa round-tripy,
   z czego jeden to prompt uprawnień.
3. Użytkownik klika „Zakończ rozmowę" (przycisk jest aktywny — komentarz
   `:381-382`: *„dostępne w każdym stanie, także w trakcie łączenia"*).
4. `sessionRef.current.close()` trafia w transport w stanie początkowym
   `{status:'disconnected', peerConnection: undefined, dataChannel: undefined}`
   (`openaiRealtimeWebRtc.mjs:20-25`). Oba `if`-y w `close()` są pominięte,
   a `if (this.#state.status !== 'disconnected')` jest fałszywe →
   **no-op bez żadnego śladu**.
5. `setState('ended')` → UI przechodzi na ekran raportu.
6. IIFE wraca z fetcha. `cancelled` jest `false` (ustawia je **tylko** cleanup
   efektu), więc żaden z trzech guardów (`:256`, `:263`, `:266`) nie wchodzi.
7. `await session.connect(...)` (`:265`). `connect()` w SDK
   (`openaiRealtimeWebRtc.mjs:76-88`) ma tylko warunek
   `if (status === 'connected') return` — **nie ma warunku „byłem zamykany"**.
8. `openaiRealtimeWebRtc.mjs:248-252`: `getUserMedia` + `addTrack` →
   **mikrofon wraca na ekranie raportu**.
9. `voice-conversation.tsx:282`: `session.transport.requestResponse?.()` →
   **tutor zaczyna mówić**, przez `document.createElement('audio')` z
   `autoplay = true` (`openaiRealtimeWebRtc.mjs:242-245`) — element bez
   naszej referencji, bo nie przekazujemy `options.audioElement`.
10. Nic tego nie widać: `setActiveState('processing')` (`:272`) jest zjadane
    przez guard terminalny (`:147-149`); `isActive` jest `false`, więc interval
    countdownu (`:313-330`) się nie arma i **auto-close po 3:00 nie zadziała**;
    `userEndedRef=true` wycisza też kartę błędu z `connection_change` (`:230`).
11. Licznik OpenAI bije do unmountu — czyli do kliknięcia „Nowa sesja",
    wylogowania albo zamknięcia karty.

**Wariant poboczny (utrata raportu).** Jeśli klik padnie *po* starcie
`connect()` (peerConnection już istnieje), `close()` faktycznie zamyka,
`connect()` rzuca, `catch :288` sprawdza tylko `cancelled` (nie stan
terminalny) i wykonuje `setState('error')` (`:297`) — **surowy setter, nie
`setActiveState`** — który **nadpisuje ekran `ended` kartą „Połączenie
przerwane". Raport przepada.**

Defekty poboczne wykryte przy okazji (fakty, nie zalecenia):

- **D2**: `catch :288` używa `setState`, nie `setActiveState` → może nadpisać
  stan terminalny (wariant wyżej).
- **D3**: `session.on('error')` (`:205-207`) tylko loguje — błąd sesji nie ma
  żadnej reprezentacji w UI ani w teardownie.
- **D4**: `openingFallbackId` (`:283-287`) nie jest czyszczony przez
  `endConversation` — żywy timer na ekranie terminalnym przez ~5 s
  (neutralizuje się sam przez odczyt `stateRef` w `:285`).
- **D5**: brak `AbortController` w `src/` — lot `/api/report` przeżywa unmount
  (obsłużone przez `unmountedRef :347/:354`, ale nie przerwane).
- **D6**: 9 subskrypcji (`session.on` ×8 + `transport.on`) nigdy nie jest
  zdejmowanych — brak `.off()` w `src/`.

### C. Własność mikrofonu

Dwa niezależne pozyskania strumienia:

1. **Nasze — wyłącznie probe uprawnień** (`voice-conversation.tsx:248-253`):
   ```ts
   const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
   stream.getTracks().forEach((track) => track.stop())
   ```
   Zatrzymywany natychmiast, referencja porzucona. Bez wycieku.

2. **SDK — prawdziwy strumień** (`openaiRealtimeWebRtc.mjs:248-252`):
   ```js
   const stream = this.options.mediaStream ?? (await navigator.mediaDevices.getUserMedia({ audio: true }))
   peerConnection.addTrack(stream.getAudioTracks()[0])
   ```
   `options.mediaStream` **nie jest przez nas podawane** (`:180-191` przekazuje
   tylko `model` i `config`), więc strumień należy do SDK.

**W całym `src/` nie ma ani jednej referencji do `MediaStream`, a jedyny
`track.stop()` to probe w `:253`.** Zwolnienie mikrofonu zależy wyłącznie od
`openaiRealtimeWebRtc.mjs:409-412` — a to działa tylko, gdy ścieżka jest już
podpięta jako sender. `close()` w oknie między `getUserMedia` a `addTrack`
(albo przed `connect()`, jak w D1) nie zatrzymuje niczego.

Co jest obserwowalne z testu: `session.transport` jest publiczne
(`realtimeSession.mjs:131-134`), transport eksponuje `status` i
`connectionState → {status, peerConnection, dataChannel, callId}`. Czyli
`transport.status === 'disconnected'` i
`transport.connectionState.peerConnection.getSenders()[0].track.readyState === 'ended'`
to legalne asercje. Element `<audio>` **nie jest obserwowalny**.

### D. Synchroniczność i okna wyścigu

`close()` jest zadeklarowane jako `close(): void` na wszystkich trzech
poziomach (`realtimeSession.d.ts:233`, `openaiRealtimeWebRtc.d.ts:111`,
`openaiRealtimeBase.d.ts:72`). **Nie ma czego awaitować i nie ma
`disconnect()`/`hangup()` zwracającego promise.** Wszystkie cztery nasze
wywołania (`:268`, `:305`, `:322`, `:385`) są gołymi instrukcjami — poprawnie.

`connect()` jest async i czeka na ack `session.updated` z **timeoutem 5000 ms**
(`openaiRealtimeWebRtc.mjs:192-198`), więc okno łączenia jest długie.

| # | Okno wyścigu | Skutek |
|---|---|---|
| R1 | `close()` przed `connect()` | **D1** — stan terminalny w UI, żywy transport w tle, brak rekoncyliacji |
| R2 | blok po-connectowy `:272-287` strzeżony tylko przez `cancelled`, nie przez `userEndedRef` | `updateSecondsLeft(180)` i `requestResponse()` na zakończonej sesji |
| R3 | `catch :288` nie sprawdza stanu terminalnego | `setState('error')` nadpisuje `ended` |
| R4 | `openingFallbackId` przeżywa `endConversation` | żywy timer na ekranie terminalnym |
| R5 | `sessionRef=null` (`:304`) przed `session.close()` (`:305`) | nieszkodliwe — domknięcie zamyka ten sam obiekt |
| R6 | lot `/api/report` po unmoncie | obsłużone `unmountedRef`, nie przerwane |

Historyczny, niezależnie udokumentowany race:
`context/archive/2026-07-23-post-session-report/reviews/impl-review.md:44` —
`buildTurns(historyRef.current)` leci zaraz po `close()` + `setState('ended')`,
więc ostatnia wypowiedź uczącego się może nie zdążyć. **To jest dowód
z archiwum, że wywołanie `close()` nie jest dowodem zamknięcia** — dokładnie
sceptycyzm, który `test-plan.md:61` każe utrzymać.

### E. Idempotencja

**W naszym kodzie nie ma żadnej flagi teardownu** — brak `closedRef`,
brak `teardownDoneRef`. `userEndedRef` (`:112`) klasyfikuje (czyste
zakończenie vs zerwanie), nie strzeże; czytane tylko w `:230`.

Podwójne zamknięcie jest mimo to bezpieczne, bo SDK jest idempotentne:
`realtimeSession.mjs:846-851` czyści puste mapy, a
`openaiRealtimeWebRtc.mjs:400-419` opakowuje emisję w
`if (this.#state.status !== 'disconnected')` — **drugie `close()` nie emituje
nic**. Realne sekwencje podwójnego teardownu: A → później F, B → F, retry D
na sesji już zamkniętej przez SDK.

### F. Maszyna stanów

`ConversationState` to **prawdziwa unia dyskryminowana**
(`voice-conversation.tsx:15-22`): `connecting | listening | user-speaking |
processing | speaking | ended | error`, trzymana w jednym `useState` (`:97`).

Ale unia to **nie całość stanu**. W tym samym komponencie żyje 6 slotów
`useState` i 7 refów; obok stoi druga unia `ReportOutcome`
(`session-report.tsx:5-9`: `analyzing | report | insufficient | error`) w
osobnym `useState` (`:119-121`). Kombinacje typu
`(state='connecting', reportOutcome={phase:'report'})` są reprezentowalne.
Rodzic (`session-start.tsx:28-32`) duplikuje stan przez lustrzany
`conversationState` (żeby `Orb` nie remountował się — decyzja z
`first-voice-conversation/plan.md:144-145`).

**Nie zamodelowane jako osobne stany**: „proszę o mikrofon" i „mintuję token"
— oba siedzą wewnątrz `connecting` (`:250`, `:258`). To jest bezpośrednio
istotne dla D1: UI nie odróżnia tych dwóch podfaz, a przycisk kończący jest
w obu aktywny.

Guard terminalny — `voice-conversation.tsx:147-149`:
```ts
const setActiveState = useCallback((next: ConversationState) => {
  setState((prev) => (prev === 'ended' || prev === 'error' ? prev : next))
}, [])
```
`ended` i `error` pochłaniają spóźnione zdarzenia sesji. **`ended` jest
terminalne — nie ma z niego wyjścia poza unmountem.** `error` jest
pół-terminalne (retry / powrót do tematu).

Stany, które mogą zawisnąć (bez wyjścia przy porażce):
- **`connecting`** — brak timeoutu na `getUserMedia`, na fetchu tokenu i na
  `connect()`. Jedyne wyjście to przycisk kończący (który w tym oknie odpala D1).
- **`processing` w środku rozmowy** — fallback 5 s jest armowany **dokładnie
  raz**, po connect (`:283`). Jeśli późniejsza tura utknie, nic nie wraca do
  `listening`; ratuje tylko countdown.
- **`analyzing`** w `reportOutcome` — `fetch('/api/report')` bez timeoutu
  (`:334`), spinner bez afordancji retry.

### G. Granica SDK i seamy testowe

**Cała powierzchnia SDK w naszym kodzie to jeden import:**
```ts
// src/components/voice-conversation.tsx:4-8
import { RealtimeAgent, RealtimeSession, type RealtimeItem } from '@openai/agents-realtime'
```
plus `import type { RealtimeItem }` w `transcript.ts:1`. `grep -rn
"agents-realtime" src/` daje tylko te dwa pliki. Dwie wartości runtime, jeden
typ (wymazywany).

Subskrybowane zdarzenia — to jest kontrakt, który fake musi umieć odtworzyć:
- sesyjne (8): `agent_start`, `agent_end`, `audio_start`, `audio_stopped`,
  `audio_interrupted`, `history_updated`, `error`, `transport_event`
- transportowe (1): `connection_change` (`connecting|connected|disconnected`)
- surowe stringi protokołu wewnątrz `transport_event` (`:210-226`):
  `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`,
  `response.output_audio_transcript.delta`

**Żadnej własnej abstrakcji nie ma.** Brak `useRealtimeSession`, brak
`createSession()`, brak modułu transportowego. Konstrukcja, wiring, connect
i teardown siedzą inline w jednym ciele `useEffect` (`:157-307`) w komponencie
`'use client'`.

| Seam | Osiągalny dziś bez mockowania modułów wewnętrznych? |
|---|---|
| Konstrukcja sesji | **Nie.** `new RealtimeSession(...)` (`:180`) z importu statycznego. Jedyne wejście: podmiana modułu `'@openai/agents-realtime'`. |
| Connect | **Nie.** Wołane na obiekcie lokalnym dla domknięcia (`:265`). |
| Teardown | Częściowo — `transport.status` / `.connectionState` są publiczne, więc asercje są możliwe, ale tylko przy realnym obiekcie sesji. |
| Pozyskanie mikrofonu | **Probe: tak** (`navigator.mediaDevices` stubowalne globalnie). **Realny strumień: nie** — w SDK. |
| Mint tokenu | **Tak** — zwykły `fetch('/api/realtime/token')` (`:258`), MSW wystarczy. |
| POST raportu | **Tak** — `fetch('/api/report')` (`:334`), MSW wystarczy. |

**Wejście wstrzyknięcia, którego SDK dostarcza, a my nie używamy**:
`RealtimeSessionOptions.transport?: 'webrtc' | 'websocket' | RealtimeTransportLayer`
(`dist/realtimeSession.d.ts`), z pełnym interfejsem w `dist/transportLayer.d.ts`.
Nasz `new RealtimeSession(...)` (`:180-191`) go pomija. To jest najczystszy
możliwy seam — ale **dziś nie istnieje ścieżka, którą test mógłby go podać**.

Klient robi dokładnie **dwa** fetche (`grep -rn "fetch(" src/`):
`POST /api/realtime/token` (`:258`) i `POST /api/report` (`:334-342`). SDK
dokłada własny `fetch` na `https://api.openai.com/v1/realtime/calls`
(`openaiRealtimeWebRtc.mjs:268`) — przechwytywalny, ale `RTCPeerConnection`
i ścieżki mediów już nie.

Już czyste (testowalne bez żadnego setupu): `buildTurns(history)`
(`transcript.ts:10`, import typu wymazywany, funkcja totalna),
`buildInstructions(topic)` (`instructions.ts:30`), schematy zod
(`report/schema.ts:17,38`), `Orb` (`orb.tsx:15-24`), `SessionReport`
(`session-report.tsx:30`). **Nieeksportowane, choć czyste**:
`formatCountdown` (`:60-64`), `STATE_LABELS` (`:26-34`), `ACTIVE_STATES`
(`:53-58`), `toOrbState` (`session-start.tsx:16-18`).

### H. Pułapka jsdom — najważniejsze ograniczenie projektowe testu

`realtimeSession.mjs:107-116` wybiera transport przez `hasWebRTCSupport()`
(`utils.mjs:86-91`: `typeof window['RTCPeerConnection'] !== 'undefined'`).
W jsdom `RTCPeerConnection` nie istnieje → SDK **po cichu** konstruuje
`OpenAIRealtimeWebSocket`. Jego `close()` (`openaiRealtimeWebsocket.mjs:306-313`)
**nie dotyka żadnych ścieżek mediów i nigdy nie woła `getUserMedia`**.

Konsekwencja twarda: **test w jsdom na niezamockowanym SDK ćwiczy inny
transport niż produkcja i strukturalnie nie jest w stanie zaobserwować
zwolnienia mikrofonu.** Warstwa unit/component może udowodnić *sekwencję i
kontrakt naszego kodu* (że każda ścieżka woła `close()`, że po zakończeniu nie
leci `requestResponse()`, że `cancelled` jest ustawiane) — ale nie *fizyczne*
zwolnienie urządzenia. To zostaje dla ręcznego smoke'a albo dla fazy 4.

To także uzasadnia politykę z `test-plan.md:113` („mock na granicy
transportu"): granicą, którą warto podmienić, jest moduł
`@openai/agents-realtime` z fake'em odtwarzającym `status`/`connectionState`
i emitującym powyższe zdarzenia — nie wnętrze naszego komponentu.

### I. Powierzchnia bootstrapu runnera (stan na dziś)

**Nie ma nic.** `find` po całym repo (bez `node_modules`, `.next`, `context`)
za `*.test.*`, `*.spec.*`, `__tests__`, `__mocks__`, `vitest.config.*`,
`jest.config.*`, `playwright.config.*`, `test/`, `tests/`, `e2e/` →
**zero trafień**. `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`,
`vite`, `jsdom`, `happy-dom`, `@testing-library/*`, `msw` — nieobecne w
`package.json`, w `package-lock.json` (także tranzytywnie) i na dysku.

Fakty, które ograniczą kształt konfiguracji:

| Obszar | Stan | Znaczenie |
|---|---|---|
| `package.json` | brak skryptu `test`; **brak `"type": "module"`** | `.mjs`/`.mts` = ESM, `.ts`/`.js` = CJS |
| `tsconfig.json` | `moduleResolution: "bundler"`, `paths: {"@/*": ["./src/*"]}` **bez `baseUrl`**, `strict: true`, `jsx: "react-jsx"` | alias wymaga `vite-tsconfig-paths` (AGENTS.md wymusza `@/*`) |
| `tsconfig.json` `include` | `**/*.ts`, `**/*.tsx`, `**/*.mts` — **`**/*.mjs`/`**/*.js` NIE są łapane** | `vitest.config.mts` będzie typowany; `vitest.config.mjs` nie |
| `tsconfig.json` `types` | **klucz nie istnieje** | TS ciągnie wszystko z `@types`; `vitest/globals` i `@testing-library/jest-dom` trzeba dodać jawnie |
| `next.config.ts` | pusty; **brak `typescript.ignoreBuildErrors`**, brak `eslint.ignoreDuringBuilds` | **pliki testowe bez typów runnera wywrócą `next build` na preview Vercela** |
| `eslint.config.mjs` | `ignores`: tylko `.next/**`, `out/**`, `build/**`, `next-env.d.ts`; brak bloku `files:` | testy będą lintowane tą samą konfiguracją co kod aplikacji |
| `.gitignore` | `/coverage` **już ignorowane** (`# testing`); brak `test-results/`, `playwright-report/` | — |
| CI | **`.github/` nie istnieje** | bramka „unit+integration w CI" (test-plan §5) nie ma dziś gdzie usiąść — zgodnie z planem to faza 5 |
| Hooki | `.claude/settings.local.json` ma `PostToolUse`/`Stop` (impeccable, design) | **żaden hook nie odpala testów/typechecku** |
| Env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` czytane po stronie klienta; brak `dotenv`/`@next/env` | **Vitest nie dostanie `.env.local` za darmo** |
| `vercel.ts` | tylko `regions: ['fra1']`; brak nadpisania `buildCommand` | — |

`supabase/`: `config.toml` (lokalny stack na 54321/54322/54323), jedna
migracja `20260723185448_create_sessions.sql`, `[db.seed] enabled = true`
**ale brak `seed.sql`** — istotne dla fazy 3, nie dla tej.

## Code References

Permalinki: prefiks
`https://github.com/gumis1153/10xdevs-v3/blob/54b78e553ddd651c74d3cb66ca064aeeaf56f17e/`
(commit jest wypchnięty na `origin/feat/readme-project-overview`).

Kod aplikacji:

- `src/components/voice-conversation.tsx:4-8` — jedyny import SDK (jedyny seam podmiany)
- `src/components/voice-conversation.tsx:15-22` — unia `ConversationState`
- `src/components/voice-conversation.tsx:147-149` — guard stanu terminalnego `setActiveState`
- `src/components/voice-conversation.tsx:157-307` — efekt łączący (konstrukcja + wiring + IIFE + cleanup)
- `src/components/voice-conversation.tsx:180-191` — `new RealtimeSession` (bez `options.transport`, bez `options.mediaStream`)
- `src/components/voice-conversation.tsx:194-244` — 9 subskrypcji zdarzeń (nigdy nie zdejmowanych)
- `src/components/voice-conversation.tsx:205-207` — `session.on('error')` tylko loguje (D3)
- `src/components/voice-conversation.tsx:248-253` — probe `getUserMedia` + jedyny `track.stop()` w repo
- `src/components/voice-conversation.tsx:258` — `POST /api/realtime/token`
- `src/components/voice-conversation.tsx:265` — `session.connect()`
- `src/components/voice-conversation.tsx:282` — `requestResponse()` (odpala tutora — element D1 kroku 9)
- `src/components/voice-conversation.tsx:288-298` — `catch` z surowym `setState('error')` (D2)
- `src/components/voice-conversation.tsx:301-306` — **jedyny pełny teardown**
- `src/components/voice-conversation.tsx:313-330` — interval countdownu + ścieżka wyjścia B
- `src/components/voice-conversation.tsx:334-342` — `POST /api/report`
- `src/components/voice-conversation.tsx:364-374` — wejście w raport (latch `reportRequestedRef`, `buildTurns`)
- `src/components/voice-conversation.tsx:381-388` — `endConversation` + komentarz „dostępne w każdym stanie" (**epicentrum D1**)
- `src/components/session-start.tsx:28-32` — stan rodzica (`phase`, lustrzany `conversationState`)
- `src/components/session-start.tsx:42-53` — `exitConversation` / `startNewSession` (jedyne wyzwalacze unmountu)
- `src/components/app-header.tsx:22-27` — link logo widoczny w trakcie rozmowy (ścieżka H, bez teardownu)
- `src/lib/realtime/transcript.ts:10` — `buildTurns`, funkcja czysta i totalna
- `src/lib/realtime/instructions.ts:30` — `buildInstructions`, funkcja czysta

SDK (`node_modules/@openai/agents-realtime/dist/`, v0.13.5):

- `realtimeSession.mjs:107-116` — wybór transportu przez `hasWebRTCSupport()` (**pułapka jsdom**)
- `realtimeSession.mjs:846-851` — `RealtimeSession.close()`
- `openaiRealtimeWebRtc.mjs:20-25` — stan początkowy transportu (dlaczego `close()` jest no-opem)
- `openaiRealtimeWebRtc.mjs:76-88` — `connect()` bez guardu „byłem zamykany"
- `openaiRealtimeWebRtc.mjs:242-252` — `<audio autoplay>` + `getUserMedia` + `addTrack`
- `openaiRealtimeWebRtc.mjs:400-419` — pełny teardown, w tym `getSenders().forEach(s => s.track?.stop())`
- `openaiRealtimeWebsocket.mjs:306-313` — `close()` **bez** dotykania mediów
- `dist/transportLayer.d.ts` — interfejs `RealtimeTransportLayer` (nieużywany seam wstrzyknięcia)

Konfiguracja:

- `package.json:5-10` — skrypty (brak `test`)
- `tsconfig.json` — `paths`, `include`, brak `types`
- `next.config.ts` — pusty, bez `ignoreBuildErrors`
- `eslint.config.mjs:10-16` — `globalIgnores` (nic testowego)

## Architecture Insights

1. **Cykl życia jest rozproszony między dwa różne uchwyty do tej samej sesji.**
   `sessionRef` (`:104`) i zmienna `session` lokalna dla domknięcia efektu
   (`:180`) to nie to samo wejście: przycisk i timer sięgają przez ref,
   cleanup przez domknięcie. Cleanup zeruje ref *przed* zamknięciem (`:304-305`)
   — nieszkodliwie, ale ta dwoistość jest źródłem asymetrii „przycisk robi
   mniej niż unmount".

2. **`cancelled` jest jedyną flagą anulowania i należy wyłącznie do cleanupu
   efektu.** Nic, co nie unmountuje komponentu, nie potrafi jej ustawić —
   dlatego przycisk i timer są strukturalnie słabsze od unmountu. To jest
   sedno D1, wyrażone architektonicznie.

3. **Stan terminalny UI i stan transportu nie mają rekoncyliacji.** Guard
   `setActiveState` gwarantuje, że *UI* zostanie w `ended`, ale nie ma nic, co
   gwarantuje, że *transport* podąży. Guard, który miał chronić przed
   spóźnionymi zdarzeniami, w D1 działa jako maskowanie awarii.

4. **Warstwa czysta jest już zdrowa, warstwa cyklu życia nie istnieje jako
   jednostka.** Transformacje danych (`buildTurns`, `buildInstructions`,
   schematy) są testowalne od ręki. Cała logika cyklu życia to domknięcia
   Reacta wokół żywego `RealtimeSession` — nie ma czego zaimportować i wywołać.

5. **Churn bez siatki.** `voice-conversation.tsx` był dotykany przez 6 slice'ów
   (S-03 ×3, S-04, S-05, S-06, S-07 ×2, S-09), za każdym razem przez feature
   dokładający gałąź do tej samej maszyny stanów lub tego samego efektu — i za
   każdym razem z jawną deklaracją „no test framework". Ostatnia zmiana (S-07,
   `36d5487`) dołożyła **trzeci timer** (fallback otwarcia) obok countdownu
   i interwału, powiększając powierzchnię cleanupu tuż przed incydentem.

## Historical Context (from prior changes)

- **Incydentu nie ma nigdzie zapisanego.** Fraza „rozmowa się zakończyła, ale
  głos nadal odpowiadał" występuje w repo **dokładnie raz** —
  `context/foundation/test-plan.md:44`, jako cytat z wywiadu. Brak repro, brak
  wskazania ścieżki, brak commita `fix` dotyczącego teardownu. Oracle testu
  musi pochodzić z kontraktu (FR-009), nie z opisu awarii.
- `context/archive/2026-07-22-first-voice-conversation/plan.md:139-143` —
  jedyna zapisana decyzja o cyklu życia: *„session listeners wired in
  `useEffect` with cleanup calling `session.close()`; guard against
  double-connect (dev double effects)"*. Guard dotyczył StrictMode, nie
  zakończenia przez użytkownika — co dokładnie wyjaśnia lukę D1.
- `context/archive/2026-07-22-first-voice-conversation/plan.md:339-340` —
  *„'Zakończ rozmowę' button always visible → `session.close()` (FR-009)"*.
  „Always visible" jest zapisaną intencją; jej konsekwencja w stanie
  `connecting` nie została nigdzie przeanalizowana.
- `context/archive/2026-07-22-first-voice-conversation/plan-brief.md:34` —
  założenie, którego nikt nie zweryfikował: *„Official SDK covers VAD,
  barge-in, transcription, **teardown for free**"*.
- `context/archive/2026-07-22-first-voice-conversation/plan.md:137-138` —
  decyzja o własnym `getUserMedia` jako pre-checku UX. `grep` po
  `getTracks|track.stop|MediaStream` w całym `context/` → **zero trafień**:
  **nigdzie nie zapisano, kto zatrzymuje ten strumień**.
- `context/archive/2026-07-23-post-session-report/research.md:56` — jedyny
  wcześniejszy zapis ścieżek wyjścia: *„Wejścia w `ended`: `:247` (timer→0)
  i `:261` (`endConversation`)"* — **dwie ścieżki**, podczas gdy test-plan
  zakładał cztery, a research znajduje dziewięć.
- `context/archive/2026-07-23-post-session-report/reviews/impl-review.md:44` —
  udokumentowany race `close()` → `buildTurns` (ostatnia tura może nie zdążyć).
- `context/archive/2026-07-26-conversation-flow-tuning/reviews/impl-review.md:49`
  — review twierdzi, że ścieżki są czyste: *„No leak, no double-arming"*.
  **Research to falsyfikuje** dla ścieżki A w oknie `connecting`; twierdzenie
  review dotyczyło fallback-timera i StrictMode, nie zakończenia mid-connect.
- `context/archive/2026-07-22-first-voice-conversation/plan.md:70-73` — **TTL
  tokenu nie kończy sesji**: *„one `ek_` token can start multiple sessions
  until it expires, and a started session keeps running past the TTL"*. TTL nie
  może służyć jako oracle zamknięcia.
- `context/archive/2026-07-26-topic-selection-revamp/plan-brief.md:63` —
  *„Klik karty musi pozostać synchronicznym gestem (przed `await`), inaczej
  Safari zablokuje mikrofon."* Ograniczenie wiążące dla każdego testu, który
  dotyka ścieżki startu.
- **Prior art na testach**: brak frameworka był powtarzaną decyzją, nie
  przeoczeniem — `AGENTS.md:41`, `session-topic-proposal/plan.md:182`,
  `minimal-oauth-login/plan.md:42`, `first-voice-conversation/plan.md:39,461-467`,
  `post-session-report/plan.md:243`, `conversation-flow-tuning/plan-brief.md:35`.
  Jedyny protokół teardownu, jaki kiedykolwiek istniał, jest ręczny:
  `first-voice-conversation/plan.md:372-373` (*„the browser mic indicator turns
  off"*, *„Dev StrictMode: no duplicate audio"*).
- **Uwaga terminologiczna**: dwa różne „300 s". Okno sesji to
  `SESSION_SECONDS` = 180 s (5:00 → 2:00 → 3:00, commit `280951f`); cap 300 s
  to limit funkcji Vercel Hobby (ryzyko #6, faza 2). Nie mylić przy pisaniu
  testu.
- `mvp-check.md:52-63` — kryterium 3 wymaga *„at least one test suite that
  addresses a concrete risk"* zmapowanego na `test-plan.md`; ta faza jest tym,
  co je odblokowuje.

## Related Research

- `context/foundation/test-plan.md` §2 (ryzyko #1 + Risk Response Guidance),
  §3 Phase 1, §4 (stack), §6.1–6.2 (puste wpisy cookbooka do wypełnienia)
- `context/archive/2026-07-22-first-voice-conversation/research.md` — pierwsze
  rozpoznanie SDK Realtime; `:162` nazywa `disconnected` „hookiem teardownu FR-009"
- `context/archive/2026-07-22-first-voice-conversation/docs-openai-agents-realtime.md:140-142`
  — notatki o `session.close()` i evencie `disconnected`
- `context/archive/2026-07-23-post-session-report/research.md:48-56` —
  `historyRef` jako ref (nie state), wejścia w stan `ended`
- `context/archive/2026-07-26-conversation-flow-tuning/plan.md:57,74,90` —
  dead-end w `processing`, `close()` w guardzie anulowania, sprzątanie fallbacku

## Open Questions

1. **Czy naprawa D1 należy do tej fazy?** `test-plan.md` §3 Phase 1 mówi
   „udowodnić, że każda ścieżka wyjścia zwalnia połączenie" — czyli test.
   Research znalazł defekt, który ten test *na pewno wywróci na czerwono*.
   Decyzja „test najpierw, fix w tej samej fazie" vs „fix osobno" należy do
   `/10x-plan`. Argument za jedną fazą: bez fixa faza kończy się czerwonym
   buildem; argument przeciw: mieszanie bootstrapu runnera z naprawą produkcji
   w jednym change'u.
2. **Jak głęboki ma być fake transportu?** Minimalny (`status`,
   `connectionState`, `close`, `connect`, emiter 9 zdarzeń) wystarczy do
   asercji sekwencji. Pełniejszy (śledzenie sender-tracków) pozwoliłby
   asertować „mikrofon zwolniony" *w modelu*, ale to asercja o fake'u, nie
   o przeglądarce. Granica do ustalenia w planie.
3. **Czy `voice-conversation.tsx` wymaga wydzielenia seamu** (hook
   `useRealtimeSession` albo przekazanie `options.transport`), czy wystarczy
   `vi.mock('@openai/agents-realtime')`? Mock modułu działa dziś bez zmian
   w produkcji; wydzielenie jest czystsze, ale to refaktor kodu produkcyjnego
   w fazie, która miała bootstrapować runner.
4. **Ścieżka H (link logo w headerze)** — czy „nawigacja na tę samą trasę nie
   zatrzymuje sesji" to defekt, czy akceptowane zachowanie? Nie ma o tym
   decyzji w archiwum. Testowalne tylko e2e (header żyje w layoucie, poza
   drzewem `SessionStart`) — kandydat do fazy 4, nie do tej.
5. **Ścieżka I (zamknięcie karty)** — brak `pagehide`/`beforeunload` i brak
   endpointu terminacji po stronie serwera. Czy zerwanie WebRTC przez
   przeglądarkę wystarcza do zatrzymania naliczania po stronie OpenAI? To
   pytanie o zachowanie dostawcy, nie o nasz kod — nierozstrzygalne testem
   jednostkowym.
6. **Ładowanie env w Vitest** — brak `dotenv`/`@next/env`; jeśli któryś
   testowany moduł czyta `NEXT_PUBLIC_*` w czasie importu, trzeba to rozwiązać
   w konfiguracji. Do sprawdzenia przy pisaniu pierwszego testu.
