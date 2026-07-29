# english-talk

Aplikacja webowa do ćwiczenia **mówionego** angielskiego: prowadzisz z tutorem AI
kilkuminutową rozmowę głosową na zaproponowany temat, a po jej zakończeniu dostajesz
raport z listą popełnionych błędów, oszacowaniem poziomu CEFR i sugestiami do dalszej
praktyki.

Produkcja: **https://english-talk-black.vercel.app** (wejście wymaga zalogowania się
kontem Google — bez logowania zobaczysz wyłącznie ekran logowania).

## Co to jest i dla kogo

Polscy programiści na poziomie A2–B2 zwykle radzą sobie z angielskim w piśmie, ale przy
mówieniu — call z zespołem, rozmowa rekrutacyjna, networking na konferencji — wpadają
w paraliż. Mechanizmem bólu jest strach przed oceną i brak bezpiecznego miejsca do
ćwiczenia; Duolingo pracuje na pojedynczych zdaniach, a generyczne czatboty nie mają
trybu nauki płynnego mówienia. english-talk jest właśnie takim miejscem: rozmawiasz na
głos, wolno Ci się mylić, a feedback dostajesz dopiero po sesji.

Przebieg jednej sesji:

1. Dostajesz do wyboru trzy tematy wylosowane z puli 30 scenariuszy (pół zawodowych,
   pół z życia poza pracą) — możesz też wylosować nowy zestaw.
2. Rozmawiasz głosowo z tutorem, który dostraja tempo i słownictwo do poziomu
   wnioskowanego z Twoich pierwszych wypowiedzi.
3. Kończysz sesję w dowolnym momencie — raport powstaje na materiale, który zdążył się
   nazbierać (przy bardzo krótkich rozmowach aplikacja mówi, że jest go za mało, zamiast
   wymyślać ocenę).
4. Dostajesz raport: pogrupowane błędy z poprawkami i cytatem z transkryptu, poziom CEFR
   z jawnym disclaimerem o niepewności pojedynczego pomiaru oraz sugestie do dalszej nauki.
5. Sesja trafia do archiwum wraz z pełnym transkryptem, do przejrzenia później.

Guardrail prywatności: **aplikacja nie przechowuje surowego audio** — po sesji trwale
zapisywany jest wyłącznie transkrypt i raport (tabela `sessions` z RLS: każdy widzi tylko
swoje wiersze).

Pełne wymagania produktowe, persona i lista Non-Goals: [`context/foundation/prd.md`](context/foundation/prd.md).

## Stack

- **Next.js 16 (App Router)** / React 19 / TypeScript w trybie `strict` / Tailwind CSS v4.
  To Next.js 16 — interception requestów żyje w [`src/proxy.ts`](src/proxy.ts), nie
  w `middleware.ts`, i to on chroni każdy route poza `/login`.
- **Supabase** — Postgres (migracje w [`supabase/migrations/`](supabase/migrations)) +
  Auth z jedynym providerem Google OAuth + RLS włączone od pierwszej tabeli.
- **OpenAI** — Realtime API do rozmowy (`gpt-realtime-2.1`, transkrypcja
  `gpt-4o-mini-transcribe`) i `gpt-5.6-luna` do po-sesyjnej analizy transkryptu
  (Structured Outputs).
- **Vercel** — hosting, region `fra1` ([`vercel.ts`](vercel.ts)); merge do `master`
  deployuje produkcję, każdy PR dostaje preview URL.

Stack wybrano pod solo build sparowany z agentem AI: decydował rozmiar korpusu przykładów
dla integracji głos/LLM i cztery bramki „agent-friendly". Uzasadnienie i odrzucone
alternatywy: [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md).
Dokładne wersje paczek — [`package.json`](package.json).

## Uruchomienie lokalne

### Wymagania wstępne

- **Node.js ≥ 20.9** (wymóg Next.js 16) i **npm**.
- **Docker Desktop uruchomiony** — lokalny stack Supabase startuje w kontenerach;
  bez działającego Dockera `npx supabase start` nie wystartuje.
- **Konto OpenAI z kluczem API** — rozmowa głosowa i raport idą przez OpenAI, więc bez
  klucza aplikacja się uruchomi, ale sesji nie przeprowadzisz. Klucz jest płatny (Realtime
  rozlicza się per minuta rozmowy).
- **Konto Google Cloud** — logowanie idzie przez Google OAuth, a client ID/secret trzeba
  utworzyć samemu (patrz [Google OAuth](#google-oauth-logowanie) niżej).

### Kroki

1. **`git clone <url-repo>`**, wejdź do katalogu projektu i uruchom **`npm install`**.
2. **`cp .env.example .env.local`** — `.env.local` jest gitignorowany i musi istnieć
   **przed** startem stacka Supabase, bo `supabase/config.toml` wciąga z niego zmienne
   Google przez `env()`.
3. **`npx supabase start`** — podnosi lokalny stack (wymaga Dockera). Na wyjściu wypisuje
   adresy i klucze: API `http://127.0.0.1:54321`, Postgres `54322`,
   Studio `http://127.0.0.1:54323`. Jeśli przegapisz to wyjście (albo stack już działa),
   wypisz je ponownie: **`npx supabase status`**.
4. **Uzupełnij `.env.local`** wartościami z kroku 3 (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) oraz własnym `OPENAI_API_KEY` — patrz
   [tabela zmiennych](#zmienne-środowiskowe).
5. **Skonfiguruj Google OAuth** (instrukcja niżej) i wklej client ID oraz secret do
   `.env.local`, a potem **zrestartuj stack**:
   `npx supabase stop && npx supabase start`. Zmienne z `.env.local` są podstawiane do
   `config.toml` dopiero przy starcie — restart samego dev servera nic nie zmieni.
6. **`npx supabase db reset`** — aplikuje migracje od zera (tabela `sessions` z RLS
   i politykami).
7. **`npm run dev`** → otwórz **http://127.0.0.1:3000**.

W całym setupie używaj konsekwentnie **`127.0.0.1`**, nie `localhost`:
`supabase/config.toml` ustawia `site_url = "http://127.0.0.1:3000"`, a mieszanie hostów
prowadzi do rozjazdu ciasteczek sesji.

Dostępne skrypty npm: `dev`, `build`, `start`, `lint`. Projekt nie ma jeszcze frameworka
testowego — skryptu `test` nie znajdziesz.

### Zmienne środowiskowe

Poniżej minimum, bez którego aplikacja nie działa. **Podane są wyłącznie nazwy — żadnych
wartości ani ich fragmentów w repo.**

| Zmienna | Do czego | Skąd wziąć |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | adres API Supabase używany przez klienta serwerowego i `proxy.ts` | wyjście `npx supabase start` (lokalnie `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publiczny klucz API Supabase | wyjście `npx supabase start` (pozycja `PUBLISHABLE_KEY`) |
| `OPENAI_API_KEY` | mint tokenów Realtime + analiza transkryptu (server-only) | dashboard OpenAI |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | provider Google w lokalnym Auth | Google Cloud Console (kroki niżej) |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | provider Google w lokalnym Auth | Google Cloud Console (kroki niżej) |

Pełny, skomentowany rejestr zmiennych (łącznie z tymi, których kod nie używa, i tymi
server-only) żyje w [`.env.example`](.env.example) — tam zaglądaj po szczegóły.

Pułapka na kluczach: lokalny stack wypisuje ich kilka. Weź **`PUBLISHABLE_KEY`**; jeśli
Twoja wersja CLI wypisuje wyłącznie legacy **`ANON_KEY`**, wklej właśnie ją — nazwa
zmiennej jest kontraktem kodu, wartości są wymienne. Nigdy nie używaj tutaj `SECRET_KEY`
ani `SERVICE_ROLE_KEY`: są server-only i nie wolno ich wystawiać pod prefiksem
`NEXT_PUBLIC_`.

### Google OAuth (logowanie)

1. Utwórz (lub wybierz) projekt w [Google Cloud Console](https://console.cloud.google.com/).
2. Skonfiguruj **OAuth consent screen** — typ *External*, tryb *Testing* wystarczy;
   dodaj swój adres jako testowego użytkownika.
3. Wejdź w **Credentials → Create credentials → OAuth client ID** i wybierz typ
   *Web application*.
4. W **Authorized redirect URIs** wpisz dokładnie:
   **`http://127.0.0.1:54321/auth/v1/callback`**.
   To adres lokalnego Auth Supabase, nie aplikacji Next.js — `http://127.0.0.1:3000/auth/callback`
   jest drugim skokiem, po Supabase, i wpisanie go tutaj jest najczęstszym powodem, dla
   którego logowanie cicho nie działa.
5. Skopiuj **Client ID** i **Client secret** do `.env.local` jako
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` i `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
6. Zrestartuj stack: `npx supabase stop && npx supabase start`.

Bez tego kroku aplikacja się uruchomi, ale każdy route poza `/login` przekieruje Cię na
ekran logowania — chroni je [`src/proxy.ts`](src/proxy.ts).

## Dokumentacja projektu

Repo pracuje na dokumentacji trzymanej w `context/`, nie w wiki:

- [`context/foundation/prd.md`](context/foundation/prd.md) — wymagania produktowe: wizja,
  persona, user stories, FR-y, Non-Goals.
- [`context/foundation/roadmap.md`](context/foundation/roadmap.md) — plasterki (`S-01`…`S-10`),
  ich kolejność, zależności i status.
- [`context/foundation/tech-stack.md`](context/foundation/tech-stack.md) — wybór stacka
  i jego uzasadnienie.
- [`context/foundation/infrastructure.md`](context/foundation/infrastructure.md) — wybór
  platformy deploymentu.
- [`context/foundation/lessons.md`](context/foundation/lessons.md) — reguły wyciągnięte
  z poprzednich zmian.
- [`context/deployment/deploy-plan.md`](context/deployment/deploy-plan.md) — runbook
  deploymentu i lokalnego Supabase (dziennik decyzji, nie instrukcja startowa).
- [`context/archive/`](context/archive) — zamknięte zmiany z planami, researchem
  i przebiegiem implementacji.
- [`AGENTS.md`](AGENTS.md) — zasady dla agentów AI pracujących w tym repo.

Konwencja: każda zmiana zaczyna życie jako folder w `context/changes/<change-id>/`
(`change.md`, `research.md`, `plan.md`), a po wdrożeniu ląduje w
`context/archive/<data>-<change-id>/`. Historia decyzji projektu = zawartość
`context/archive/`.
