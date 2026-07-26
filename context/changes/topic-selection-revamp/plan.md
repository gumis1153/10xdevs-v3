# Topic Selection Revamp Implementation Plan

## Overview

Rozszerzamy pulę tematów sesji z 10 do 30 (15 „praca" / 15 „poza pracą") i zamieniamy
ekran startu z pojedynczej propozycji na wybór spośród **3 zbalansowanych tematów**
(zawsze ≥1 z każdej kategorii), z możliwością wylosowania nowego zestawu. Realizuje
roadmap **S-09** i rewiduje decyzję z S-02. Tor głosowy, API i baza danych pozostają
nietknięte.

## Current State Analysis

- `src/lib/topics.ts` — typ `Topic = {id, title, description}`, `TOPICS: readonly Topic[]`
  (10 tematów, wszystkie zawodowe poza `ordering-coffee`), oraz `drawTopic(excludeId?)`
  losujące **jeden** temat z wykluczeniem podanego id.
- `src/app/page.tsx:79` — server component woła `drawTopic()` i przekazuje `initialTopic`
  do `<SessionStart>`.
- `src/components/session-start.tsx` — faza `'proposal'` pokazuje jeden temat + przyciski
  „Rozpocznij rozmowę" (`startConversation`, `:30-35`) i „Inny temat" (re-roll pojedynczego,
  `:88`). Klik „Rozpocznij" jest zarazem gestem użytkownika wymaganym przez
  getUserMedia/AudioContext (Safari). `startNewSession` (`:44-48`) wraca z ekranu końcowego
  do propozycji ze świeżym losowaniem (z wykluczeniem właśnie omówionego tematu).
- `src/components/voice-conversation.tsx` — dostaje pojedynczy `topic: Topic`, buduje z niego
  prompt (`buildInstructions`, title+description) i po sesji POST-uje do `/api/report`
  tylko `{id, title}`.
- Persystencja: `sessions` trzyma **zdenormalizowane** `topic_id` + `topic_title` (snapshot).
  Zmiana/rozszerzenie listy tematów jest bezpieczna dla archiwum — **bez migracji DB**.
- Brak test-runnera i testów w repo (`package.json`: tylko `dev`/`build`/`start`/`lint`).

## Desired End State

Na starcie sesji użytkownik widzi 3 karty tematów (tytuł + pełny opis), zawsze z co najmniej
jednym tematem z każdej kategorii. Klik dowolnej karty od razu rozpoczyna rozmowę na tym
temacie (jeden gest = wybór + wymagany gest przeglądarki). Przycisk „Inne tematy" losuje nowy
zestaw 3 (bez limitu). Po zakończeniu sesji „Nowa sesja" wraca do świeżego zestawu 3. Pula
liczy 30 tematów w podziale 15/15. Weryfikacja: `npm run build` i `npm run lint` przechodzą;
ekran startu pokazuje 3 karty; klik startuje rozmowę z działającym mikrofonem; re-roll zmienia
zestaw; wybrany temat trafia do rozmowy i raportu jak dotąd.

### Key Discoveries:

- Temat jest zdenormalizowany w DB (`supabase/migrations/20260723185448_create_sessions.sql:10-11`)
  — zmiana puli tematów nie wymaga migracji ani nie psuje archiwum.
- Klik startujący rozmowę pełni podwójną rolę: wybór tematu + gest użytkownika dla
  getUserMedia/AudioContext (`session-start.tsx:18-23`, komentarz). Musi zostać zachowany —
  klik karty ma inicjować to samo przejście `proposal → conversation` co dziś „Rozpocznij".
- `VoiceConversation` przyjmuje pojedynczy `Topic` (`voice-conversation.tsx:78-83`) — jego
  interfejs nie zmienia się; zmienia się tylko sposób, w jaki `SessionStart` wybiera ten jeden
  temat.
- Losowanie jest dziś czysto klienckie/serwerowe przez `Math.random()`; brak persystencji
  propozycji/odrzuceń — re-roll zostaje operacją bezstanową.

## What We're NOT Doing

- Brak zmian w torze głosowym (`voice-conversation.tsx`, `instructions.ts`, `/api/realtime/token`).
- Brak zmian w API raportu (`/api/report`) i w schemacie/DB (`sessions`).
- Brak limitu losowań/skipów (PRD Open Q2 — świadomie odłożone na v2).
- Brak free-form input tematu ani wyboru poziomu/trudności przez użytkownika.
- Brak przepisywania 10 istniejących tematów — zostają jak są, tylko dokategoryzowane.
- Brak testów automatycznych (brak test-runnera w projekcie — poza zakresem tej zmiany).

## Implementation Approach

Dwie fazy, rozdzielające zmianę danych od przeprojektowania UI. Faza 1 dostarcza pulę 30 i
bezstanową funkcję doboru zbalansowanego zestawu 3 — weryfikowalną w izolacji przez build/lint.
Faza 2 przeprojektowuje ekran startu na 3 karty i re-roll zestawu, konsumując API z Fazy 1.
Interfejs `VoiceConversation` pozostaje bez zmian, więc ryzyko regresu w torze głosowym jest
zerowe.

## Critical Implementation Details

- **Gest Safari.** Klik karty musi synchronicznie (przed jakimkolwiek `await`) ustawić stan
  „connecting" i przełączyć fazę na `conversation`, dokładnie jak dzisiejszy `startConversation`
  (`session-start.tsx:30-35`). To ten sam gest, który odblokowuje getUserMedia/AudioContext na
  Safari — nie wolno go rozbić na „zaznacz, potem osobny przycisk".
- **Gwarancja podziału w zestawie.** Dobór 3 musi zawsze zawrzeć ≥1 „work" i ≥1 „life" (trzeci
  losowy z dowolnej kategorii), a kolejność kart nie może być stała (inaczej user zauważy wzorzec
  „karta 1 zawsze praca"). Przy 30 tematach 15/15 i wykluczeniu poprzedniego zestawu (max 3) obie
  pod-pule zawsze mają dość elementów.

## Phase 1: Dane i logika doboru

### Overview

Rozszerzenie modelu tematu o kategorię, powiększenie puli do 30 (15/15) i zamiana pojedynczego
losowania na dobór zbalansowanego zestawu 3.

### Changes Required:

#### 1. Model tematu + pula 30

**File**: `src/lib/topics.ts`

**Intent**: Dodać kategorię do typu `Topic` i rozszerzyć `TOPICS` do 30 pozycji w podziale
15 „work" / 15 „life", zachowując 10 istniejących tematów (dokategoryzowanych) i dodając 20
nowych. Lista poniżej jest treścią do zatwierdzenia w ramach przeglądu planu.

**Contract**: `type Topic = { id: string; title: string; description: string; category: 'work' | 'life' }`.
`TOPICS: readonly Topic[]` o długości 30, dokładnie 15 `category: 'work'` i 15 `category: 'life'`,
unikalne `id` (kebab-case). Finalna lista (tytuł + jednozdaniowy, promptowy opis po angielsku):

**Work (15)** — 9 istniejących + 6 nowych:

| id | title | description | status |
| --- | --- | --- | --- |
| `daily-standup` | Daily standup | Tell your team what you did yesterday, what you're working on today, and what's blocking you. | istniejący |
| `job-interview` | Job interview | You're interviewing for a developer role. Talk about your experience, your strengths, and why you want this job. | istniejący |
| `code-review` | Code review discussion | Discuss a pull request with a colleague: explain your feedback and defend your implementation choices. | istniejący |
| `explaining-a-bug` | Explaining a bug | Walk a colleague through a bug you found: what happens, how to reproduce it, and what you think causes it. | istniejący |
| `sprint-planning` | Sprint planning | Discuss upcoming tasks with your team: estimate effort, raise concerns, and agree on priorities. | istniejący |
| `explaining-your-project` | Explaining your project | A new teammate just joined. Describe what your project does, how it's built, and where they should start. | istniejący |
| `client-update` | Client progress update | Give a client a status update: what's done, what's delayed, and what happens next. | istniejący |
| `conference-networking` | Conference networking | You meet another developer at a tech conference. Introduce yourself and chat about what you both work on. | istniejący |
| `asking-for-help` | Asking for help | You're stuck on a task. Ask a colleague for help: describe the problem and what you've already tried. | istniejący |
| `sprint-retro` | Sprint retrospective | Share what went well this sprint, what didn't, and one thing the team should improve next time. | nowy |
| `pair-programming` | Pair programming | Pair with a colleague on a tricky function: think out loud, suggest ideas, and react to theirs. | nowy |
| `tech-decision-debate` | Tech decision debate | Argue for one library or approach over another with a teammate who disagrees, and respond to their points. | nowy |
| `incident-postmortem` | Incident postmortem | Walk the team through a production outage: the timeline, the impact, the root cause, and the follow-ups. | nowy |
| `salary-negotiation` | Salary negotiation | Negotiate your salary or rate with a manager or recruiter: make your case and handle pushback. | nowy |
| `giving-feedback` | Giving feedback | Give a teammate honest, constructive feedback about something that isn't working, and keep it supportive. | nowy |

**Life (15)** — 1 istniejący + 14 nowych:

| id | title | description | status |
| --- | --- | --- | --- |
| `ordering-coffee` | Ordering coffee | You're at a coffee shop abroad. Order your drink, ask a few questions, and handle small talk with the barista. | istniejący |
| `restaurant-order` | Ordering at a restaurant | You're dining out abroad. Order food, ask about the menu, and sort out an issue with your meal. | nowy |
| `hotel-checkin` | Checking into a hotel | Check into a hotel: confirm your booking, ask about the facilities, and fix a problem with your room. | nowy |
| `asking-directions` | Asking for directions | You're lost in a new city. Ask a local for directions and confirm you understood them. | nowy |
| `neighbor-small-talk` | Meeting a neighbor | Make small talk with a new neighbor: introduce yourself and chat about the area. | nowy |
| `doctor-visit` | At the doctor | Describe your symptoms to a doctor and answer their questions about how you feel. | nowy |
| `renting-apartment` | Renting an apartment | Talk to a landlord about renting a flat: ask about the price, the contract, and the neighborhood. | nowy |
| `weekend-plans` | Weekend plans | Tell a friend about your weekend plans and ask what they're up to. | nowy |
| `hobby-chat` | Talking about a hobby | Talk to someone about a hobby you love: how you got into it and why you enjoy it. | nowy |
| `booking-a-trip` | Booking a trip | Book a trip with a travel agent: talk through dates, options, and what you're looking for. | nowy |
| `movie-discussion` | Talking about a film | Discuss a film or series you recently watched with a friend: what you liked and what you didn't. | nowy |
| `returning-a-purchase` | Returning a purchase | Return a faulty product to a shop: explain the problem and ask for a refund or a replacement. | nowy |
| `gym-signup` | Signing up at a gym | Sign up at a gym: ask about membership, classes, and opening hours. | nowy |
| `catching-up-friend` | Catching up with a friend | Catch up with an old friend you haven't seen in a while: share your news and ask about theirs. | nowy |
| `cooking-recipe` | Sharing a recipe | Explain how to cook a dish you like to a friend who wants to try it: the ingredients and the steps. | nowy |

> Uwaga: 14 nowych „life" + `ordering-coffee` = 15 „life"; razem z 15 „work" daje pulę 30.

#### 2. Zbalansowany dobór zestawu 3

**File**: `src/lib/topics.ts`

**Intent**: Zastąpić `drawTopic` funkcją zwracającą zbalansowany zestaw 3 tematów, z opcjonalnym
wykluczeniem poprzedniego zestawu (do re-rolla i „nowej sesji"). Gwarantuje ≥1 „work" i ≥1 „life"
w każdym zestawie i losową kolejność kart.

**Contract**: `drawTopicSet(exclude?: readonly Topic[]): Topic[]` → tablica **3** różnych tematów,
zawierająca co najmniej jeden `category: 'work'` i co najmniej jeden `category: 'life'`, z żadnym
`id` należącym do `exclude`, w losowej kolejności. Algorytm: z puli po odjęciu `exclude` wybierz
1 losowy „work" i 1 losowy „life", dobierz 3. z pozostałych (dowolna kategoria), następnie
przetasuj wynik. Usunięcie `drawTopic` jest OK — jedyni konsumenci (`page.tsx`, `session-start.tsx`)
migrują w tej i następnej fazie.

### Success Criteria:

#### Automated Verification:

- Linting przechodzi: `npm run lint`
- Build + typecheck przechodzi: `npm run build`

#### Manual Verification:

- Lista 30 tematów zaakceptowana; podział dokładnie 15 „work" / 15 „life"; opisy sensowne i w spójnym tonie.
- `drawTopicSet()` wywołane wielokrotnie zawsze zwraca 3 różne tematy z ≥1 „work" i ≥1 „life"; `drawTopicSet(prev)` nigdy nie powtarza tematu z `prev`.

**Implementation Note**: Po ukończeniu tej fazy i przejściu weryfikacji automatycznej — pauza na ręczne potwierdzenie (akceptacja listy tematów i zachowania doboru) przed Fazą 2.

---

## Phase 2: Ekran wyboru (3 karty + re-roll zestawu)

### Overview

Przeprojektowanie ekranu startu: 3 karty tematów zamiast jednej, klik karty = wybór + start,
przycisk losujący nowy zestaw 3, oraz świeży zestaw po „Nowej sesji".

### Changes Required:

#### 1. Początkowy zestaw 3 z serwera

**File**: `src/app/page.tsx`

**Intent**: Wylosować początkowy zestaw 3 tematów po stronie serwera i przekazać go do
`SessionStart` zamiast pojedynczego `initialTopic`.

**Contract**: `<SessionStart initialTopics={drawTopicSet()} />`; import `drawTopicSet` zamiast
`drawTopic`. Reszta `page.tsx` (header, avatar, layout `main`/orb) bez zmian.

#### 2. Ekran wyboru i re-roll

**File**: `src/components/session-start.tsx`

**Intent**: Zmienić fazę `'proposal'` z pojedynczej propozycji na listę 3 kart. Klik dowolnej
karty wybiera jej temat i natychmiast startuje rozmowę (zachowując synchroniczny gest
getUserMedia/Safari). Zamienić „Inny temat" na „Inne tematy" losujące nowy zestaw 3 (z
wykluczeniem obecnego, bez limitu). Po „Nowej sesji" z ekranu końcowego pokazać świeży zestaw 3.

**Contract**: Prop `initialTopics: Topic[]` (zamiast `initialTopic: Topic`). Stan: `topics` (zestaw
3) zamiast pojedynczego `topic`; wybrany temat przekazywany do `VoiceConversation` jako
`topic={selected}` (interfejs `VoiceConversation` bez zmian). Handler kliknięcia karty łączy
dzisiejsze `setTopic(card)` + `startConversation()` w jeden synchroniczny gest (ustawia
`connecting`, przełącza fazę na `conversation` przed jakimkolwiek `await`). „Inne tematy":
`setTopics((prev) => drawTopicSet(prev))`. `startNewSession`: `setTopics(drawTopicSet())` (świeży
zestaw) + powrót do fazy `proposal`. Każda z 3 kart pokazuje `title` + pełny `description`. Orb i
klasy pozycjonowania pozostają jak dziś (jeden trwały element orba przez obie fazy).

### Success Criteria:

#### Automated Verification:

- Linting przechodzi: `npm run lint`
- Build + typecheck przechodzi: `npm run build`

#### Manual Verification:

- Ekran startu pokazuje 3 karty, każda z tytułem i pełnym opisem; w zestawie widoczne oba konteksty (praca i poza pracą).
- Klik karty rozpoczyna rozmowę na tym temacie z działającym mikrofonem (gest Safari zachowany — sprawdzone też w Safari).
- „Inne tematy" losuje nowy zestaw 3, różny od poprzedniego (żaden temat się nie powtarza).
- „Nowa sesja" z ekranu końcowego pokazuje świeży zestaw 3.
- Animacja orba niezaburzona przy przejściu proposal ↔ conversation; układ poprawny na mobile web (brak zależności od hover).
- Wybrany temat trafia do promptu rozmowy i do zapisu w archiwum jak dotychczas (brak regresu).

**Implementation Note**: Po ukończeniu tej fazy i przejściu weryfikacji automatycznej — pauza na ręczne potwierdzenie (przejście pełnego flow: wybór → rozmowa → raport → nowa sesja) przed zamknięciem zmiany.

---

## Testing Strategy

### Unit Tests:

- Brak test-runnera w projekcie — testy jednostkowe poza zakresem tej zmiany.

### Integration Tests:

- Brak — patrz wyżej.

### Manual Testing Steps:

1. Wejdź na stronę główną (zalogowany) → zobacz 3 karty tematów z oboma kontekstami.
2. Kliknij „Inne tematy" kilka razy → za każdym razem inny zestaw 3, bez powtórzeń względem poprzedniego.
3. Kliknij kartę → rozmowa startuje, mikrofon działa (sprawdź w Safari i Chrome).
4. Zakończ sesję → na ekranie końcowym kliknij „Nowa sesja" → świeży zestaw 3.
5. Dokończ sesję z raportem → w archiwum tytuł tematu zapisany poprawnie.
6. Sprawdź na mobile web, że karty są czytelne i klikalne (bez hover).

## Performance Considerations

Brak — czysto klienckie losowanie z małej tablicy (30 elementów) i statyczny render 3 kart.

## Migration Notes

Brak migracji DB. `topic_id`/`topic_title` w `sessions` to snapshoty — nowe id (`sprint-retro`
itd.) po prostu pojawią się w przyszłych wierszach; istniejące wiersze archiwum pozostają ważne.

## References

- Roadmap slice: `context/foundation/roadmap.md` — S-09 (`:188-200`)
- PRD: FR-003, FR-004, Open Q2, Open Q3 (`context/foundation/prd.md`)
- Poprzednia implementacja: `context/archive/2026-07-21-session-topic-proposal/`
- Pliki: `src/lib/topics.ts`, `src/app/page.tsx:79`, `src/components/session-start.tsx`, `src/components/voice-conversation.tsx:78-83`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dane i logika doboru

#### Automated

- [x] 1.1 Linting przechodzi: `npm run lint` — 5b96c9e
- [x] 1.2 Build + typecheck przechodzi: `npm run build` — 5b96c9e

#### Manual

- [x] 1.3 Lista 30 tematów zaakceptowana; podział dokładnie 15 „work" / 15 „life"; opisy sensowne i spójne — 5b96c9e
- [x] 1.4 `drawTopicSet()` zawsze zwraca 3 różne tematy z ≥1 „work" i ≥1 „life"; `drawTopicSet(prev)` nie powtarza tematów z `prev` — 5b96c9e

### Phase 2: Ekran wyboru (3 karty + re-roll zestawu)

#### Automated

- [x] 2.1 Linting przechodzi: `npm run lint`
- [x] 2.2 Build + typecheck przechodzi: `npm run build`

#### Manual

- [x] 2.3 Ekran startu pokazuje 3 karty (tytuł + pełny opis), oba konteksty widoczne
- [x] 2.4 Klik karty rozpoczyna rozmowę z działającym mikrofonem (gest Safari zachowany)
- [x] 2.5 „Inne tematy" losuje nowy zestaw 3, różny od poprzedniego
- [x] 2.6 „Nowa sesja" pokazuje świeży zestaw 3
- [x] 2.7 Orb niezaburzony; układ poprawny na mobile web (bez hover)
- [x] 2.8 Wybrany temat trafia do rozmowy i archiwum bez regresu
