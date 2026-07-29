# README Project Overview Implementation Plan

## Overview

Zastępujemy nietknięty boilerplate `create-next-app` (37 linii) README-em, z którego
osoba lub agent wchodzący do repo dowiaduje się, czym jest **english-talk** i dla kogo,
na czym stoi, jak uruchomić projekt lokalnie od zera i gdzie leży dokumentacja
projektowa — bez pytania autora o cokolwiek. Realizuje roadmap **S-10**. Zmiana dotyka
wyłącznie `README.md`; zero dotknięć kodu, schematu bazy i runtime'u.

## Current State Analysis

- `README.md` to wygenerowany szablon `create-next-app`: „This is a Next.js project
  bootstrapped with create-next-app", `npm run dev` w czterech menedżerach pakietów,
  sekcja o `next/font`/Geist i linki do dokumentacji Next.js. Nazwa `english-talk` nie
  pada w nim ani razu.
- Aplikacja **nie startuje** bez rzeczy, których README nie wspomina: lokalnego stacka
  Supabase (Docker), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `OPENAI_API_KEY` oraz migracji `supabase/migrations/20260723185448_create_sessions.sql`.
  Logowanie nie zadziała bez własnego OAuth clienta Google
  (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET`), a ponieważ każdy route poza
  `/login` jest chroniony przez `src/proxy.ts`, czytelnik bez OAuth zobaczy wyłącznie
  ekran logowania.
- Realna dokumentacja żyje w `context/foundation/` (`prd.md`, `roadmap.md`,
  `tech-stack.md`, `infrastructure.md`, `lessons.md`) i `context/deployment/deploy-plan.md`.
  Wchodzący do repo nie ma jak się o niej dowiedzieć — nic z roota do niej nie linkuje
  poza `AGENTS.md`, który jest przewodnikiem dla agentów, nie dla człowieka.
- Produkt jest w stanie po S-09: 9 plasterków `done` (OAuth Google, wybór spośród 3
  tematów z puli 30, rozmowa głosowa Realtime z adaptacją poziomu, raport CEFR z listą
  błędów, archiwum sesji z transkryptem, wspólny header z menu avatara). README musi
  opisywać **ten** stan, nie scaffold.
- Aplikacja jest live: `https://english-talk-black.vercel.app` (Vercel, projekt
  `english-talk`, region `fra1` z `vercel.ts`; merge do `master` = deploy produkcyjny).

## Desired End State

`README.md` w języku polskim, o strukturze „minimum + pełny quickstart":

```
# english-talk                     (jednozdaniowy opis + link do produkcji)
## Co to jest i dla kogo           (problem, persona, przebieg sesji)
## Stack                           (technologie + gdzie leży pełne uzasadnienie)
## Uruchomienie lokalne            (wymagania → kroki → tabela zmiennych → Google OAuth)
## Dokumentacja projektu           (linki do context/**)
```

Weryfikacja: czytelnik przechodzi sekcję „Uruchomienie lokalne" od góry do dołu i
kończy z działającą aplikacją na `http://127.0.0.1:3000`, w której potrafi się
zalogować, przeprowadzić sesję i zobaczyć raport. Żadna nazwa zmiennej, komenda ani
link wewnętrzny w README nie jest zmyślony.

### Key Discoveries:

- Roadmap `context/foundation/roadmap.md` §S-10 definiuje outcome i **dwa guardraile**:
  (1) nie kopiować treści PRD ani `tech-stack.md` — linkować, inaczej README rozjedzie
  się przy kolejnym plasterku; (2) **nigdy nie wpisywać wartości sekretów** — wyłącznie
  nazwy zmiennych.
- `.env.example` jest już kompletnym, skomentowanym rejestrem zmiennych (łącznie z
  pułapką „legacy anon key zamiast publishable key" przy lokalnym stacku). README ma go
  streszczać i do niego linkować, nie duplikować komentarzy.
- `context/deployment/deploy-plan.md:85-91` („Lokalny dev") zawiera porty i pętlę
  migracji: API `http://127.0.0.1:54321`, Postgres `54322`, Studio `54323`,
  `npx supabase migration new` → `npx supabase db reset`. To jest źródło prawdy dla
  quickstartu, ale jako dziennik decyzji z 2026-07-15 nie nadaje się dla czytelnika.
- `supabase/config.toml:159-165` ustawia `site_url = "http://127.0.0.1:3000"` i
  allowlistę `127.0.0.1:3000/**` + `localhost:3000/**`. Callback OAuth lokalnego Supabase
  to `http://127.0.0.1:54321/auth/v1/callback` — to jest redirect URI, który czytelnik
  musi wkleić w Google Cloud Console.
- `package.json` ma dokładnie cztery skrypty: `dev`, `build`, `start`, `lint`. Nie ma
  skryptu `test` — README nie może obiecywać testów.
- Wersje do sekcji Stack (z `package.json`): Next.js 16.2.9 (App Router), React 19.2.4,
  Tailwind CSS v4, TypeScript strict, `@supabase/ssr` 0.12.3, `@openai/agents-realtime`
  0.13.5, `openai` ^6.48.0, `zod` ^4.4.3.
- Modele użyte w kodzie: `gpt-realtime-2.1` + transkrypcja `gpt-4o-mini-transcribe`
  (`src/app/api/realtime/token/route.ts:56,59`), raport `gpt-5.6-luna`
  (`src/app/api/report/route.ts:23`).
- To jest Next.js 16: interception żyje w `src/proxy.ts`, nie `middleware.ts` (patrz
  `AGENTS.md`). Jeśli README wspomina o warstwie ochrony route'ów, musi nazwać `proxy.ts`.

## What We're NOT Doing

- **Nie dodajemy zrzutów ekranu** ani żadnych plików binarnych do repo (decyzja z rundy
  pytań: sam link do produkcji — UI zmieniało się w S-08 i S-09, screeny starzeją się
  najszybciej).
- **Nie kopiujemy** Non-Goals z PRD ani tabeli „At a glance" z roadmapy — wariant
  „minimum 4 sekcje", linkujemy.
- **Nie piszemy sekcji troubleshooting** — pułapki (Docker, legacy anon key, pauza
  free-tier) zostają tam, gdzie już są: w `.env.example` i `deploy-plan.md`.
- **Nie tworzymy** `README.en.md` ani wersji dwujęzycznej.
- **Nie dotykamy** kodu, `package.json`, `.env.example`, `supabase/config.toml` ani
  żadnego dokumentu w `context/foundation/`. Wyjątek: jeśli smoke test w Fazie 2 wykaże,
  że `.env.example` kłamie, poprawka tam jest dopuszczalna i musi zostać odnotowana.
- **Nie oznaczamy S-10 jako `done`** w roadmapie — to należy do rytuału zamknięcia
  (`/10x-implement` epilogue / `/10x-archive`), nie do faz implementacji.

## Implementation Approach

Jedno przejście piszące całą treść (README jest spójnym dokumentem — pisanie go po
kawałku produkuje niespójny ton), potem bramka weryfikacyjna. Weryfikacja jest
dwustopniowa i odpowiada na dwa różne ryzyka: audyt automatyczny łapie **zmyślone
fakty** (nieistniejąca nazwa zmiennej, martwy link, komenda spoza `package.json`),
a smoke test łapie **złą kolejność i braki proceduralne** (np. `db reset` przed
`supabase start`).

Ograniczenie audytu, świadomie przyjęte: smoke test biegnie na obecnym środowisku
autora, więc nie wykryje kroku brakującego dlatego, że u autora jest już zrobiony
(Docker Desktop zainstalowany, konto Google Cloud istnieje). Rekompensujemy to
wymogiem, żeby każdy taki krok był w README jawnie wypisany w „Wymaganiach wstępnych",
nawet jeśli smoke test go nie wykona.

## Critical Implementation Details

**Redirect URI dla Google OAuth wskazuje na Supabase, nie na Next.js.** Intuicja
podpowiada `http://127.0.0.1:3000/auth/callback` (bo taki route istnieje w
`src/app/auth/callback/route.ts`), ale w Google Cloud Console trzeba wpisać
`http://127.0.0.1:54321/auth/v1/callback` — czyli lokalny GoTrue. Route Next.js jest
drugim skokiem, po Supabase. Wpisanie złego URI to najczęstszy sposób, w jaki ten
quickstart cicho nie zadziała.

**`127.0.0.1` a nie `localhost`.** `supabase/config.toml` ustawia
`site_url = "http://127.0.0.1:3000"`; oba hosty są na allowliście, ale README powinno
konsekwentnie używać `127.0.0.1`, żeby czytelnik nie trafił na rozjazd cookie/hosta.

---

## Phase 1: Napisanie README + audyt zgodności

### Overview

Zastąpienie całej zawartości `README.md` docelową treścią (polski, cztery sekcje,
pełny quickstart), a następnie audyt każdego weryfikowalnego faktu w dokumencie.

### Changes Required:

#### 1. Nagłówek i wprowadzenie

**File**: `README.md`

**Intent**: Dać czytelnikowi w pierwszych pięciu sekundach odpowiedź „czym to jest",
z linkiem do działającej produkcji jako dowodem, że projekt żyje.

**Contract**: Nagłówek `# english-talk`, jedno zdanie opisu, link
`https://english-talk-black.vercel.app` z adnotacją, że wejście wymaga logowania
Google. Sekcja `## Co to jest i dla kogo`: problem (bariera mówiona u polskich
programistów A2–B2), persona, przebieg sesji w 3–5 zdaniach (wybór jednego z 3
proponowanych tematów → rozmowa głosowa z tutorem → zakończenie w dowolnym momencie →
raport: pogrupowane błędy z poprawkami, ocena CEFR z disclaimerem, sugestie → sesja
trafia do archiwum z transkryptem). Źródło treści: `prd.md` §Vision & Problem Statement
i §Business Logic — **parafraza, nie cytat blokowy**, zakończona linkiem do PRD.
Guardrail prywatności warto wymienić jednym zdaniem (surowe audio nie jest
przechowywane), bo jest wyróżnikiem produktu.

#### 2. Sekcja Stack

**File**: `README.md`

**Intent**: Powiedzieć, na czym to stoi, bez powielania uzasadnienia ze
`tech-stack.md`.

**Contract**: Zwięzła lista (nie tabela z wersjami patch — te starzeją się przy każdym
`npm update`): Next.js 16 App Router / React 19 / TypeScript strict / Tailwind CSS v4;
Supabase (Postgres + Auth Google OAuth + RLS); OpenAI Realtime API (`gpt-realtime-2.1`,
transkrypcja `gpt-4o-mini-transcribe`) do rozmowy i `gpt-5.6-luna` do analizy
po-sesyjnej; hosting Vercel, region `fra1`. Zakończone jednym zdaniem „dlaczego taki
stack" + link do `context/foundation/tech-stack.md`. Wersje major podajemy w tekście,
dokładne — odsyłamy do `package.json`.

#### 3. Sekcja Uruchomienie lokalne — wymagania i kroki

**File**: `README.md`

**Intent**: Doprowadzić czytelnika od `git clone` do działającej aplikacji na
`http://127.0.0.1:3000` bez kontaktu z autorem.

**Contract**: Podsekcja „Wymagania wstępne" (Node 20+, npm, Docker Desktop uruchomiony —
wymagany przez `supabase start`, konto OpenAI z kluczem API, konto Google Cloud dla
OAuth clienta) — wypisane jawnie, nawet jeśli smoke test ich nie wykona. Następnie
ponumerowane kroki w kolejności wykonywalnej:

1. `git clone` + `npm install`
2. `cp .env.example .env.local`
3. `npx supabase start` (Docker musi działać; wypisuje URL API i klucze — API
   `http://127.0.0.1:54321`, Studio `http://127.0.0.1:54323`)
4. uzupełnienie `.env.local` wartościami z kroku 3 + `OPENAI_API_KEY`
5. konfiguracja Google OAuth (odsyłacz do podsekcji poniżej) + **restart**
   `npx supabase stop && npx supabase start` — zmienne z `.env.local` są wstrzykiwane do
   `supabase/config.toml` przez `env()` dopiero przy starcie stacka
6. `npx supabase db reset` — zastosowanie migracji (tabela `sessions` z RLS)
7. `npm run dev` → `http://127.0.0.1:3000`

Konsekwentnie `127.0.0.1`, nie `localhost`. Krótka lista skryptów npm (`dev`, `build`,
`start`, `lint`) — bez `test`, bo taki skrypt nie istnieje.

#### 4. Sekcja Uruchomienie lokalne — tabela zmiennych i Google OAuth

**File**: `README.md`

**Intent**: Wymienić dokładnie te zmienne, bez których aplikacja nie działa, i
przeprowadzić czytelnika przez jedyny krok wymagający zewnętrznego serwisu.

**Contract**: Tabela z kolumnami `Zmienna | Do czego | Skąd wziąć` obejmująca:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`,
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
**Wyłącznie nazwy — zero wartości, zero fragmentów kluczy** (guardrail S-10). Jedno
zdanie o tym, że pełny rejestr zmiennych z komentarzami żyje w `.env.example`, i
przypis o pułapce „lokalny stack wypisuje legacy `anon key` — wklej go jako
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`".

Podsekcja „Google OAuth (logowanie)" — 5–6 ponumerowanych kroków: utworzenie projektu w
Google Cloud Console → OAuth consent screen (typ External, tryb Testing wystarczy) →
Credentials → OAuth client ID typu *Web application* → **Authorized redirect URI:
`http://127.0.0.1:54321/auth/v1/callback`** → skopiowanie Client ID i Client secret do
`.env.local` → restart stacka Supabase. Zakończone zdaniem, że bez tego kroku aplikacja
się uruchomi, ale każdy route poza `/login` przekieruje na ekran logowania (bo chroni je
`src/proxy.ts`).

#### 5. Sekcja Dokumentacja projektu

**File**: `README.md`

**Intent**: Zamknąć lukę „cała realna dokumentacja jest niewidoczna z roota".

**Contract**: Lista linków relatywnych z jednolinijkowym opisem każdego:
`context/foundation/prd.md` (wymagania produktowe), `context/foundation/roadmap.md`
(plasterki i ich status), `context/foundation/tech-stack.md` (wybór i uzasadnienie
stacka), `context/foundation/infrastructure.md` (wybór platformy),
`context/deployment/deploy-plan.md` (runbook deploymentu i lokalnego Supabase),
`context/archive/` (zamknięte zmiany z planami i researchem), `AGENTS.md` (zasady dla
agentów AI pracujących w repo). Jedno zdanie o konwencji `context/changes/` →
`context/archive/`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Boilerplate zniknął — brak trafień: `grep -niE 'bootstrapped with|create-next-app|next/font|Geist' README.md`
- Zero wartości sekretów — brak trafień na prefiksy kluczy: `grep -nE 'sk-|eyJ|GOCSPX-' README.md`
- Każda nazwa zmiennej z README istnieje w `.env.example` lub w kodzie (weryfikacja
  `grep` per zmienna z tabeli)
- Każda komenda `npm run <x>` w README istnieje w `package.json`
- Każdy link relatywny w README wskazuje istniejący plik lub katalog
- Nazwa `english-talk` i URL produkcji występują w README

#### Manual Verification:

- README czyta się jako spójny dokument po polsku, bez wtrętów z boilerplate'u
- Sekcje „Co to jest" i „Stack" parafrazują PRD i `tech-stack.md`, nie kopiują ich
  akapitami
- Podana lista wymagań wstępnych jest kompletna względem tego, co realnie musi mieć
  czytelnik (Docker, konto OpenAI, konto Google Cloud)

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej zatrzymaj
się i poproś człowieka o potwierdzenie weryfikacji manualnej przed przejściem do Fazy 2.

---

## Phase 2: Smoke test quickstartu i korekty

### Overview

Przejście kroków z sekcji „Uruchomienie lokalne" na obecnym środowisku i naprawa tego,
co się rozjedzie: zła kolejność, brakujący krok, niepełny opis.

### Changes Required:

#### 1. Korekty po smoke teście

**File**: `README.md`

**Intent**: Doprowadzić spisaną procedurę do zgodności z tym, co faktycznie trzeba
wykonać, w kolejności, w której trzeba to wykonać.

**Contract**: Poprawki punktowe w numerowanej liście kroków i w podsekcji Google OAuth.
Szczególna uwaga na trzy miejsca, w których kolejność jest nieoczywista: (a) `db reset`
wymaga wcześniejszego `supabase start`; (b) `.env.local` musi istnieć **przed**
`supabase start`, jeśli stack ma podstawić zmienne Google do `config.toml`; (c) po
zmianie zmiennych OAuth konieczny jest restart stacka, nie tylko dev servera. Jeśli
smoke test wykaże, że `.env.example` jest niezgodny z rzeczywistością, poprawka tam jest
dopuszczalna — z odnotowaniem w opisie commita.

### Success Criteria:

#### Automated Verification:

- Cykl Supabase przechodzi czysto: `npx supabase stop && npx supabase start`
- Migracje aplikują się od zera: `npx supabase db reset`
- Dev server startuje: `npm run dev` odpowiada 200/307 na `http://127.0.0.1:3000`
- Lint nadal przechodzi: `npm run lint`

#### Manual Verification:

- Kroki z README wykonane po kolei doprowadzają do działającej aplikacji — bez sięgania
  po wiedzę spoza README
- Logowanie Google działa (dowód, że opisany redirect URI
  `http://127.0.0.1:54321/auth/v1/callback` jest poprawny)
- Pełny przebieg produktowy działa po świeżym `db reset`: wybór tematu → rozmowa →
  raport → wpis w archiwum
- Żaden krok nie wymagał wiedzy, której nie ma w README (a jeśli wymagał — został
  dopisany)

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej zatrzymaj
się i poproś człowieka o potwierdzenie weryfikacji manualnej.

---

## Testing Strategy

Projekt nie ma frameworka testowego (brak skryptu `test` w `package.json`) i ta zmiana
go nie wprowadza. Weryfikacja jest dwuwarstwowa:

### Audyt zgodności (Faza 1)

- Każda nazwa zmiennej środowiskowej z README ma odpowiednik w `.env.example` lub w kodzie
- Każda komenda `npm run <x>` istnieje w `package.json`; każda komenda `npx supabase <x>`
  jest realną komendą Supabase CLI
- Każdy link relatywny wskazuje istniejący plik lub katalog
- Zero wartości sekretów w pliku

### Smoke test (Faza 2)

Pełny cykl na obecnym środowisku: `supabase stop` → `supabase start` → `db reset` →
`npm run dev` → logowanie → sesja → raport → archiwum.

### Manual Testing Steps:

1. Przeczytaj README od góry jako osoba, która pierwszy raz widzi to repo — zanotuj
   każde miejsce, w którym musiałbyś zapytać autora
2. Wykonaj kroki z „Uruchomienie lokalne" po kolei, nie pomijając żadnego, nawet jeśli
   wiesz, że masz coś już zrobione
3. Zaloguj się przez Google — potwierdza poprawność redirect URI
4. Przeprowadź sesję (min. 2 minuty) i sprawdź, że raport i wpis w archiwum się pojawiają
5. Sprawdź, że każdy link w sekcji „Dokumentacja projektu" otwiera właściwy plik

## Performance Considerations

Brak — zmiana dotyczy wyłącznie pliku markdown, bez wpływu na bundle, runtime i build.

## Migration Notes

Brak migracji danych. Poprzednia treść `README.md` (boilerplate `create-next-app`) jest
zastępowana w całości i pozostaje dostępna w historii Git. Rollback = `git revert`
jednego commita.

## References

- Roadmap slice: `context/foundation/roadmap.md` §S-10 (outcome, Current state,
  Unknowns, Risk)
- Źródło treści produktowej: `context/foundation/prd.md` §Vision & Problem Statement,
  §User & Persona, §Business Logic
- Źródło treści o stacku: `context/foundation/tech-stack.md`
- Runbook lokalnego dev: `context/deployment/deploy-plan.md:85-91`
- Rejestr zmiennych: `.env.example`
- Konfiguracja lokalnego auth: `supabase/config.toml:159-165`, `:341`
- Ochrona route'ów: `src/proxy.ts`
- Zasady dla agentów: `AGENTS.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Napisanie README + audyt zgodności

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 73098c2
- [x] 1.2 Build przechodzi: `npm run build` — 73098c2
- [x] 1.3 Boilerplate zniknął (grep: `bootstrapped with|create-next-app|next/font|Geist`) — 73098c2
- [x] 1.4 Zero wartości sekretów (grep: `sk-|eyJ|GOCSPX-`) — 73098c2
- [x] 1.5 Każda nazwa zmiennej z README istnieje w `.env.example` lub w kodzie — 73098c2
- [x] 1.6 Każda komenda `npm run <x>` z README istnieje w `package.json` — 73098c2
- [x] 1.7 Każdy link relatywny w README wskazuje istniejący plik lub katalog — 73098c2
- [x] 1.8 Nazwa `english-talk` i URL produkcji występują w README — 73098c2

#### Manual

- [x] 1.9 README czyta się jako spójny dokument po polsku, bez wtrętów z boilerplate'u — 73098c2
- [x] 1.10 Sekcje „Co to jest" i „Stack" parafrazują PRD i `tech-stack.md`, nie kopiują ich — 73098c2
- [x] 1.11 Lista wymagań wstępnych jest kompletna (Docker, konto OpenAI, konto Google Cloud) — 73098c2

### Phase 2: Smoke test quickstartu i korekty

#### Automated

- [x] 2.1 Cykl Supabase przechodzi czysto: `npx supabase stop && npx supabase start` — 3a664d5
- [x] 2.2 Migracje aplikują się od zera: `npx supabase db reset` — 3a664d5
- [x] 2.3 Dev server startuje i odpowiada na `http://127.0.0.1:3000` — 3a664d5
- [x] 2.4 Lint nadal przechodzi: `npm run lint` — 3a664d5

#### Manual

- [x] 2.5 Kroki z README doprowadzają do działającej aplikacji bez wiedzy spoza README — 3a664d5
- [x] 2.6 Logowanie Google działa (poprawny redirect URI) — 3a664d5
- [x] 2.7 Pełny przebieg działa po świeżym `db reset`: temat → rozmowa → raport → archiwum — 3a664d5
- [x] 2.8 Żaden krok nie wymagał wiedzy spoza README (lub został dopisany) — 3a664d5
