# Archiwum sesji z transkrypcją (S-05) — Implementation Plan

## Overview

Pierwsza warstwa persystencji w projekcie. Po udanej analizie `/api/report`
zapisuje sesję (best-effort) do nowej tabeli `sessions` chronionej RLS, a
użytkownik dostaje archiwum swoich rozmów: listę (`/archive`) i widok
pojedynczej sesji (`/archive/[id]`) z reużytym rdzeniem raportu i transkryptem,
oraz możliwość usunięcia sesji. Zamyka FR-014 (transkrypcja po sesji, tu w
trwałym widoku) i FR-015 (archiwum poprzednich sesji) oraz secondary Success
Criteria z PRD.

## Current State Analysis

- **Raport (S-04) jest w pełni bezstanowy.** `voice-conversation.tsx` trzyma
  historię w `historyRef`, na wejściu w `ended` buduje `turnsSnapshot: Turn[]`
  i POST-uje `{ turns }` do `/api/report`; wynik (`Report`) renderuje się inline
  w `SessionReport` i ginie przy „Nowa sesja". Zero DB, zero migracji — Supabase
  jest auth-only (`supabase/migrations/` nie istnieje).
- **Gotowe do reużycia:** kontrakt `ReportSchema` (`src/lib/report/schema.ts`,
  z polem `confidence` zarezerwowanym explicite „for S-05+"); builder
  transkryptu `buildTurns()` (`src/lib/realtime/transcript.ts`); komponent
  `SessionReport` (`src/components/session-report.tsx`) — już renderuje raport i
  transkrypt w `<details>`, ale jest kliencki, ma przyciski retry/„Nowa sesja" i
  maszynę faz (analyzing/report/insufficient/error); serwerowy klient Supabase
  `createClient()` + `requireUser()` (`src/lib/supabase/server.ts`); bramka auth
  w `proxy.ts` (chroni wszystko poza `/login` i `/auth`; `/api/*` → 401 JSON);
  wzorzec Server Action `signOut` (`src/app/auth/actions.ts`).
- **Routing:** jedna strona `/` (`src/app/page.tsx`, server component,
  `requireUser()`), zero podstron. Brak klienta przeglądarkowego Supabase.
- **`Topic`** (`src/lib/topics.ts`): `{ id, title, description }`. Temat jest
  dostępny w `voice-conversation.tsx` jako prop, ale **nie** trafia dziś do
  `/api/report` (payload to samo `{ turns }`).
- **Twarde ograniczenia (deploy-plan, standing constraints):** migracje
  **forward-only** (#6); **RLS od pierwszej tabeli** (runbook #4); datastore
  tylko `eu-central-1` (#4); `db push` na zdalny projekt = **bramka ludzka**
  (`supabase login` + `link --project-ref`, runbook #4); zakaz stanu
  per-user/per-request w module scope (#3, Fluid reuse); wszystko przez PR do
  `master` (#11); sekrety przez `vercel env` (#9).

## Desired End State

Po zakończeniu udanej rozmowy sesja (temat, poziom CEFR, liczba błędów, pełny
raport i transkrypt) jest zapisana w DB pod tożsamością użytkownika. Z headera
dostępny jest link „Archiwum" → `/archive` z listą poprzednich sesji (najnowsze
na górze: data, temat, CEFR, liczba błędów). Kliknięcie wiersza otwiera
`/archive/[id]` z pełnym raportem (ten sam wygląd co ekran końcowy) i
transkryptem. Użytkownik może usunąć sesję (z potwierdzeniem). Użytkownik widzi
wyłącznie własne sesje — próba otwarcia cudzej lub nieistniejącej daje `404`.

Weryfikacja: ukończenie sesji ≥40 słów ucznia tworzy dokładnie jeden wiersz w
`sessions`; sesja „za mało materiału" i sesja z błędem analizy **nie** tworzą
wiersza; drugi zalogowany użytkownik nie widzi wierszy pierwszego; usunięcie
znika z listy i z DB.

### Key Discoveries:

- Zapis serwerowy w `/api/report` po bramce groundingu (`route.ts:118-130`) ma
  już w ręku `user`, `groundedErrors` i `report` — nie potrzeba drugiego
  endpointu ani klienta przeglądarkowego Supabase.
- INSERT user-scoped klientem (`createClient()`) egzekwuje RLS — nie potrzeba
  `SUPABASE_SERVICE_ROLE_KEY`; wiersz wstawiamy z jawnym `user_id: user.id`, a
  polityka `with check (auth.uid() = user_id)` domyka bezpieczeństwo.
- `SessionReport` miesza prezentację raportu z akcjami i fazami — wydzielenie
  czystego rdzenia prezentacji pozwala renderować raport w server-component
  `/archive/[id]` bez „use client" (`<details>` to natywny HTML).
- Usuwanie pasuje w istniejący wzorzec `signOut`: Server Action + `redirect`.

## What We're NOT Doing

- Brak persystencji sesji „za mało materiału" i sesji z błędem analizy — do
  archiwum trafiają wyłącznie pełne raporty.
- Brak paginacji / limitu listy (small data w v1; dodatek forward-only później).
- Brak trackingu progresu / wykresu CEFR w czasie (Non-Goal v2) — dlatego JSONB,
  nie znormalizowane tabele.
- Brak edycji sesji (archiwum jest read-only poza usuwaniem).
- Brak zmian w instrukcjach rozmowy, torze audio ani w logice oceny raportu.
- Brak retry zapisu do DB (best-effort — pojedynczy utracony wiersz jest OK).

## Implementation Approach

Warstwa danych przed UI (lustro dwufazowego kształtu S-04). Faza 1 wprowadza
pierwszą migrację + RLS i wpina best-effort INSERT w istniejącą, już
zabezpieczoną ścieżkę `/api/report` — weryfikowalna bez żadnego nowego UI
(INSERT widoczny w Studio / `db` po sesji). Faza 2 buduje archiwum na server
components czytających przez RLS, reużywa wydzielony rdzeń raportu i dokłada
usuwanie przez Server Action.

## Critical Implementation Details

- **Bramka ludzka na `db push`.** Migracja jest autorowana i weryfikowana
  wyłącznie lokalnie (`supabase db reset`). Push na zdalny projekt wymaga
  `npx supabase login` + `link --project-ref` (krok ludzki z runbooka
  deploy-plan) — implementacja przygotowuje migrację i zatrzymuje się przed
  pushem, sygnalizując bramkę. Preview/prod zobaczą tabelę dopiero po pushu.
- **Kolejność w `/api/report`.** INSERT idzie po bramce groundingu i po
  policzeniu `groundedErrors`, a przed `NextResponse.json` — zapisujemy dokładnie
  ten raport, który dostaje klient (z odfiltrowanymi błędami). Gałąź
  `insufficient_material` (wczesny return) i gałęzie błędów (400/502) nie
  wstawiają wiersza.
- **Best-effort, nie blokujące.** Cały INSERT w `try/catch`; przy błędzie
  `console.error` i kontynuacja do zwrotu raportu. Awaria DB nigdy nie zmienia
  statusu odpowiedzi raportu.
- **Fluid Compute.** `createClient()` i `new OpenAI()` powstają per request —
  utrzymać ten wzorzec (zakaz per-user state w module scope, constraint #3).

## Phase 1: Warstwa danych — migracja, RLS, ścieżka zapisu

### Overview

Pierwsza tabela + RLS + best-effort zapis udanej sesji z poziomu `/api/report`.

### Changes Required:

#### 1. Pierwsza migracja: tabela `sessions` + RLS

**File**: `supabase/migrations/<timestamp>_create_sessions.sql` (utworzona przez
`npx supabase migration new create_sessions`)

**Intent**: Wprowadzić trwałe archiwum sesji jako pojedynczą tabelę z metadanymi
do listy + blobami JSONB na raport i transkrypt, z RLS ograniczającym każdego
użytkownika do własnych wierszy (SELECT/INSERT/DELETE). Pierwszy schemat w
projekcie — RLS od pierwszej tabeli (runbook #4), forward-only (#6).

**Contract**: Tabela `public.sessions`:
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `created_at timestamptz not null default now()`
- `topic_id text not null`, `topic_title text not null`
- `cefr_level text not null` (denormalizacja `report.cefrLevel` pod listę)
- `error_count integer not null` (długość `groundedErrors` pod listę)
- `report jsonb not null` (pełny obiekt `Report`)
- `transcript jsonb not null` (tablica `Turn`)
- Indeks `(user_id, created_at desc)` pod zapytanie listy.
- `alter table ... enable row level security` + trzy polityki `for select` /
  `for insert` / `for delete` `to authenticated` z warunkiem własności.

Migracja jest security-critical i pierwsza w repo — pełny SQL poniżej:

```sql
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  topic_id text not null,
  topic_title text not null,
  cefr_level text not null,
  error_count integer not null,
  report jsonb not null,
  transcript jsonb not null
);

create index sessions_user_created_idx
  on public.sessions (user_id, created_at desc);

alter table public.sessions enable row level security;

create policy "sessions_select_own" on public.sessions
  for select to authenticated using (auth.uid() = user_id);

create policy "sessions_insert_own" on public.sessions
  for insert to authenticated with check (auth.uid() = user_id);

create policy "sessions_delete_own" on public.sessions
  for delete to authenticated using (auth.uid() = user_id);
```

#### 2. Rozszerzenie kontraktu payloadu raportu o temat

**File**: `src/lib/report/schema.ts`

**Intent**: Żeby zarchiwizować temat sesji, klient musi go przesłać razem z
turami. Rozszerzamy payload żądania `/api/report` o `topic` (sam `id` + `title`;
`description` nie jest potrzebny w archiwum). `ReportSchema`, `ReportResponse` i
`Turn` bez zmian.

**Contract**: `TurnsPayloadSchema` zyskuje pole `topic: { id: string (min 1),
title: string (min 1) }`. Eksport typu payloadu odzwierciedla dodane pole.

#### 3. Best-effort INSERT w route raportu

**File**: `src/app/api/report/route.ts`

**Intent**: Po policzeniu `groundedErrors` i przed zwrotem raportu utrwalić
sesję jako jeden wiersz `sessions`, best-effort. Odczytać `topic` z
zwalidowanego payloadu. Nie zapisywać w gałęzi `insufficient_material` ani w
gałęziach błędów.

**Contract**: Używa istniejącego `supabase` (user-scoped `createClient()`,
RLS). `supabase.from('sessions').insert({ user_id: user.id, topic_id,
topic_title, cefr_level: report.cefrLevel, error_count: groundedErrors.length,
report: <raport z groundedErrors>, transcript: turns })`. Całość w `try/catch`;
przy `error` z Supabase lub wyjątku → `console.error(...)` i kontynuacja. Zwrot
raportu (`kind: 'report'`, `Cache-Control: no-store`) bez zmian.

#### 4. Klient przekazuje temat do POST-a raportu

**File**: `src/components/voice-conversation.tsx`

**Intent**: Dołożyć `topic` (już dostępny jako prop) do ciała żądania w
`fetchReport`, żeby serwer miał czym opisać archiwizowaną sesję. Bez zmian w
maszynie stanów ani w cyklu życia żądania.

**Contract**: Ciało POST-a `/api/report` zmienia się z `{ turns }` na
`{ turns, topic: { id: topic.id, title: topic.title } }`. `fetchReport` (obecnie
`useCallback([])`) dostaje `topic` w domknięciu — zaktualizować zależności.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się czysto lokalnie: `npx supabase db reset`
- Lint przechodzi: `npm run lint`
- Build + typecheck przechodzi: `npm run build`

#### Manual Verification:

- Po ukończeniu sesji ≥40 słów ucznia w `sessions` pojawia się dokładnie jeden
  wiersz z poprawnymi `topic_title`, `cefr_level`, `error_count` (Studio /
  `db`); `report` i `transcript` zawierają kompletne dane.
- Sesja „za mało materiału" oraz sesja z wymuszonym błędem analizy **nie**
  tworzą wiersza.
- Wymuszona awaria zapisu (np. tymczasowo zła nazwa tabeli) nie psuje raportu —
  użytkownik dalej widzi raport, błąd jest w logach serwera.
- `report` nadal wraca z `Cache-Control: no-store`; brak surowego audio w
  zapisanym wierszu (tylko tekstowe tury).

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej
zatrzymaj się na potwierdzenie manualne (w tym bramka ludzka `db push` na
zdalny projekt), zanim ruszysz Fazę 2.

---

## Phase 2: UI archiwum — lista, szczegół, usuwanie, nawigacja

### Overview

Widoczne archiwum na server components czytających przez RLS, z reużytym
rdzeniem raportu i usuwaniem przez Server Action.

### Changes Required:

#### 1. Wydzielenie prezentacyjnego rdzenia raportu

**File**: `src/components/session-report.tsx` (+ nowy komponent prezentacji, np.
`src/components/report-view.tsx`)

**Intent**: Rozdzielić czystą prezentację raportu (nagłówek CEFR + uzasadnienie,
błędy pogrupowane po kategoriach, sugestie, disclaimer, transkrypt w `<details>`)
od akcji i faz. Rdzeń ma być renderowalny w server-component bez „use client".
`SessionReport` komponuje rdzeń + przyciski/fazy (bez zmian zachowania ekranu
końcowego S-04).

**Contract**: Nowy `ReportView({ report: Report, transcriptLines: string[] })` —
czysto prezentacyjny, bez propsów akcji, bez stanu. `SessionReport` w gałęzi
`phase === 'report'` renderuje `ReportView` i dokłada przycisk „Nowa sesja";
pozostałe fazy bez zmian. Logika `CATEGORY_ORDER`/`CATEGORY_LABELS`/klasy kart
przenosi się z `SessionReport` do `ReportView`.

#### 2. Lista archiwum `/archive`

**File**: `src/app/archive/page.tsx`

**Intent**: Server component pokazujący sesje zalogowanego użytkownika,
najnowsze na górze. Każdy wiersz linkuje do szczegółu. Pusty stan zachęcający do
pierwszej sesji.

**Contract**: `requireUser()` → `createClient()` →
`supabase.from('sessions').select('id, created_at, topic_title, cefr_level,
error_count').order('created_at', { ascending: false })` (RLS zawęża do
właściciela; bez ręcznego filtra `user_id`). Render listy linków
`/archive/${id}` (data, `topic_title`, `cefr_level`, `error_count`). Pusta lista
→ komunikat + link do `/`. Layout/nagłówek spójny z `page.tsx`.

#### 3. Szczegół sesji `/archive/[id]`

**File**: `src/app/archive/[id]/page.tsx`

**Intent**: Server component renderujący pojedynczą sesję: nagłówek (temat,
data), rdzeń raportu (`ReportView`) i transkrypt, plus akcja usunięcia. Cudzy
lub nieistniejący `id` → `notFound()`.

**Contract**: `params` (Next 16: `params` jest Promise — `await params`).
`requireUser()` → `createClient()` → `select('*').eq('id', id).maybeSingle()`
(RLS zwróci null dla cudzego wiersza). Brak → `notFound()`. Render
`ReportView({ report: row.report as Report, transcriptLines })` gdzie
`transcriptLines` budowane z `row.transcript` (`Turn[]`) tym samym wzorem co na
ekranie końcowym (`Learner:/Tutor:`). Formularz usuwania (patrz niżej).

#### 4. Usuwanie sesji (Server Action)

**File**: `src/app/archive/actions.ts` (+ mały kliencki przycisk potwierdzenia)

**Intent**: Umożliwić usunięcie sesji z potwierdzeniem, wzorem `signOut`.
Usuwa wiersz (RLS pilnuje własności) i wraca na listę.

**Contract**: `'use server'` `deleteSession(id: string)`: `createClient()` →
`supabase.from('sessions').delete().eq('id', id)` (RLS domyka własność);
`console.error` przy błędzie; `redirect('/archive')`. Wywoływana z `<form>` z
zbindowanym `id` (`deleteSession.bind(null, id)`). Potwierdzenie: mały
`'use client'` komponent przycisku submit z `window.confirm` przed wysłaniem
(reszta strony pozostaje server-component).

#### 5. Nawigacja do archiwum

**File**: `src/app/page.tsx`

**Intent**: Dołożyć w headerze link „Archiwum" → `/archive`, żeby archiwum było
osiągalne z ekranu startowego.

**Contract**: `next/link` `Link` do `/archive` w headerze obok „Wyloguj",
stylizowany spójnie z istniejącymi elementami headera.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build + typecheck przechodzi: `npm run build`

#### Manual Verification:

- Ekran końcowy S-04 wygląda i działa jak dotąd po refaktorze (raport, błędy,
  sugestie, transkrypt, „Nowa sesja", retry, „za mało materiału").
- `/archive` pokazuje ukończone sesje najnowsze-najpierw z datą, tematem, CEFR i
  liczbą błędów; pusty stan działa dla konta bez sesji.
- `/archive/[id]` pokazuje pełny raport (identyczny wygląd jak na ekranie
  końcowym) i transkrypt; wygenerowana sesja zgadza się z zapisaną.
- Drugi zalogowany użytkownik nie widzi cudzych sesji na liście, a wejście na
  `/archive/<cudze-id>` daje `404`.
- Usunięcie pyta o potwierdzenie, znika z listy i z DB; anulowanie potwierdzenia
  nie usuwa.
- Link „Archiwum" z ekranu startu prowadzi do listy.

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej
zatrzymaj się na potwierdzenie manualne na preview-deploymencie przed
domknięciem zmiany.

---

## Testing Strategy

Brak skonfigurowanego frameworka testowego (AGENTS.md) — weryfikacja przez lint,
build/typecheck oraz testy manualne na preview-deploymencie. Jeśli w trakcie
pojawi się potrzeba testów jednostkowych (np. dla kształtu payloadu), wpiąć
`test` w `package.json` i umieścić testy obok jednostki — ale nie jest to
wymagane do domknięcia tej zmiany.

### Manual Testing Steps:

1. Ukończ pełną sesję (≥40 słów) → sprawdź wiersz w `sessions` (Studio) i
   wejście `/archive` + `/archive/[id]`.
2. Ukończ sesję <40 słów → brak wiersza, komunikat „za mało materiału".
3. Zaloguj drugie konto → brak cudzych sesji; `/archive/<cudze-id>` → 404.
4. Usuń sesję z potwierdzeniem → znika z listy i DB; anuluj → zostaje.
5. Wymuś awarię zapisu w Fazie 1 → raport wciąż widoczny, błąd w logach.

## Performance Considerations

Wolumen mały (PRD target_scale: small). Indeks `(user_id, created_at desc)`
pokrywa zapytanie listy. JSONB czytany w całości bez JOIN-ów. Brak paginacji
akceptowalny w v1; przy realnym wzroście dodać limit/paginację (forward-only).

## Migration Notes

Pierwsza migracja w projekcie. Forward-only (rollback Vercela cofa kod, nie
dane). Pętla lokalna: `npx supabase migration new create_sessions` → SQL →
`npx supabase db reset`. Na zdalny projekt: `npx supabase login` +
`link --project-ref` + `db push` — **bramka ludzka** (runbook deploy-plan #4),
wykonywana po weryfikacji lokalnej i przed testem na preview. RLS włączone od
pierwszej tabeli. Datastore pozostaje `eu-central-1`.

## References

- Roadmap: `context/foundation/roadmap.md` (S-05)
- Poprzedni plasterek (kontrakt raportu, wzorzec route'a):
  `context/changes/post-session-report/plan.md`,
  `src/app/api/report/route.ts`, `src/lib/report/schema.ts`
- Ograniczenia infrastruktury/migracji: `context/deployment/deploy-plan.md`
  (standing constraints #3, #4, #6, #9, #11; runbook #4)
- Wzorzec Server Action: `src/app/auth/actions.ts` (`signOut`)
- Bramka auth: `src/proxy.ts`; klient serwerowy: `src/lib/supabase/server.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Faza 1: Warstwa danych — migracja, RLS, ścieżka zapisu

#### Automated

- [x] 1.1 Migracja aplikuje się czysto lokalnie: `npx supabase db reset` — 41dc2f4
- [x] 1.2 Lint przechodzi: `npm run lint` — 41dc2f4
- [x] 1.3 Build + typecheck przechodzi: `npm run build` — 41dc2f4

#### Manual

- [x] 1.4 Ukończona sesja ≥40 słów tworzy dokładnie jeden wiersz z poprawnymi metadanymi, pełnym `report` i `transcript` — 41dc2f4
- [x] 1.5 Sesja „za mało materiału" i sesja z błędem analizy nie tworzą wiersza — 41dc2f4
- [x] 1.6 Wymuszona awaria zapisu nie psuje raportu (raport widoczny, błąd w logach) — 41dc2f4
- [x] 1.7 Zapisany wiersz nie zawiera surowego audio; raport wraca z `Cache-Control: no-store` — 41dc2f4

### Faza 2: UI archiwum — lista, szczegół, usuwanie, nawigacja

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Build + typecheck przechodzi: `npm run build`

#### Manual

- [x] 2.3 Ekran końcowy S-04 działa i wygląda jak dotąd po refaktorze `ReportView`
- [x] 2.4 `/archive` pokazuje sesje najnowsze-najpierw (data, temat, CEFR, liczba błędów); pusty stan działa
- [x] 2.5 `/archive/[id]` pokazuje pełny raport i transkrypt zgodne z zapisaną sesją
- [x] 2.6 Drugi użytkownik nie widzi cudzych sesji; `/archive/<cudze-id>` → 404
- [x] 2.7 Usuwanie z potwierdzeniem znika z listy i DB; anulowanie nie usuwa
- [x] 2.8 Link „Archiwum" z ekranu startu prowadzi do listy
