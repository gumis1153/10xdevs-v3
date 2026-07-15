# Plan: Integracja i deployment z Vercel (english-talk)

## Kontekst

Lekcja M1L5 10xDevs: pierwsze wdrożenie na podstawie `context/foundation/infrastructure.md` (rekomendacja: Vercel, region fra1). Repo to **czysty scaffold Next.js 16.2.9** (App Router, Turbopack, React 19, TS strict) — zero kodu aplikacji, zero API routes, brak `.vercel/` (projekt niepodlinkowany), brak `vercel.ts`/`vercel.json`, brak env varów, brak zależności OpenAI/Upstash/`@vercel/*`. `.gitignore` poprawnie ignoruje `.env*` i `.vercel`. CLI Vercel zainstalowane w wersji 50.43.0 (aktualna ~56.2.0).

**Decyzje użytkownika (2026-07-15):**
- **Provider AI — OpenAI direct, OpenRouter ODRZUCONY**: zweryfikowano (docs OpenRouter, 2026-07-15), że OpenRouter obsługuje wyłącznie audio turn-based przez chat completions — **nie ma wsparcia dla Realtime API** (brak sesji WebRTC/WebSocket i ephemeral tokenów `client_secrets`), na których stoi cała architektura głosowa z `infrastructure.md`. Decyzja: całość (Realtime voice + analiza transkryptu) zostaje na OpenAI. Zapis trafia do foundation (patrz Faza 3), żeby temat nie wracał. Ewentualna rewizja tylko dla route'u analizy, gdyby kontrola kosztów stała się paląca (OpenRouter ma przedpłacone kredyty i limity per-klucz — twardy cap, którego OpenAI nie oferuje).
- **DB**: NIE provisionować teraz. Zapisać twardy constraint: przyszła baza wyłącznie Frankfurt/`eu-central-1` (kolokacja z fra1). Rekomendacja na później: Supabase (bundluje OAuth zgodny z PRD) vs Neon — decyzja przy pierwszym feature z DB.
  - **ROZSTRZYGNIĘTE (2026-07-15, później tego samego dnia): SUPABASE.** Nowy projekt przez Vercel Marketplace w `eu-central-1`. Istniejący projekt użytkownika na supabase.com (region `eu-west-1`) **odrzucony dla tego repo** — łamie constraint kolokacji z fra1; zostaje nietknięty. Lokalny `.env` z `SUPABASE_PASS` należy do tamtego projektu — **TODO ludzkie**: przenieść/usunąć poza sesją (może być jedyną kopią hasła, agent nie kasuje). Zakres sesji rozszerzony decyzją użytkownika: dokumentacja + cloud provisioning + lokalny stack (sekcja B przechodzi z „przygotowanie" do „wykonanie").
- **Rate limiting**: NIE provisionować. Zapisać merge-gate: endpoint mintujący tokeny Realtime nie może trafić na master bez rate limitu (WAF na Hobby: 1 darmowa reguła per-IP; Upstash per-sesja przy feature).
- **Zakres tej sesji**: STOP po zweryfikowanym preview deployu. `vercel --prod` / podpięcie Git integration = osobna ludzka zgoda (podpięcie auto-deploy-on-merge samo w sobie otwiera ścieżkę produkcyjną, więc też czeka).

**Kluczowe fakty z researchu (2026-07-15, zweryfikowane w docs/GitHub):**
- `vercel.ts` (GA 2025-12): nazwany eksport `config` typu `VercelConfig` z `@vercel/config/v1` (NIE ma `defineConfig`); tylko JEDEN plik konfiguracyjny; wykonuje się w build time (działa też z Git integration); pakiet `@vercel/config` musi być w `package.json`.
- Hobby może pinować **dokładnie jeden dowolny region** (`regions: ['fra1']` OK; dwa regiony = fail deployu przed buildem). `functionFailoverRegions` = Enterprise-only, nie używać.
- Limity Hobby: funkcje max **300s** (Fluid Compute default-on), 1M invocations/mies., 4 CPU-h Active CPU, logi runtime retencjonowane **1 godzinę**, 100 deployów/dzień.
- **Deployment Protection jest domyślnie WŁĄCZONE** dla nowych projektów — preview URL zwróci 401 dla anonimowego curl; dostęp przez zalogowaną przeglądarkę lub `vercel curl`. Produkcja pozostaje publiczna.
- CLI 50→56 breaking changes: `vercel logs` wymaga `--follow` do streamowania (54.0); nieinteraktywny `vercel link` wymaga `--scope`/`VERCEL_ORG_ID` (55.0). `deploy/env/pull/promote/rollback` bez zmian.
- Hobby Git integration łączy się **tylko z osobistymi repo GitHub** (nie org) — `gumis1153/10xdevs-v3` jest osobiste, OK.
- OpenAI: budżety projektowe od początku 2026 są **tylko alertami, nie blokują ruchu**; jedyny twardy bezpiecznik = przedpłacone kredyty z wyłączonym auto-recharge. Mintowanie tokenów Realtime: `POST /v1/realtime/client_secrets`, TTL konfigurowalny 10–7200s (default 600s), model `gpt-realtime-2.1`.
- Next.js 16.2 na Vercel: goły scaffold niskiego ryzyka; NIE włączać `cacheComponents` przy pierwszym deployu (znane bugi Turbopack: vercel/next.js#94456, #87283).

---

## Wymagania wstępne

### A. Konfiguracja Vercel CLI ✅

- [x] **Node.js ≥ 20** dostępny w PATH (repo używa `@types/node` ^20; Vercel builduje na Node 24 LTS).
- [x] **Instalacja/upgrade**: `npm i -g vercel@latest` → `vercel --version` ≥ 56. Przy problemach z uprawnieniami `npm -g`: każdą komendę odpalać przez `npx vercel@latest ...` (bez instalacji globalnej).
- [x] **Logowanie (krok ludzki, interaktywny)**: `vercel login` — otwiera przeglądarkę (OAuth GitHub/email). W tej sesji: wpisz `! vercel login` w prompt, żeby wynik trafił do rozmowy. Weryfikacja: `vercel whoami` zwraca oczekiwane konto.
- [x] **Scope/team**: `vercel teams ls` — upewnić się, że aktywny jest osobisty scope (Hobby nie podepnie repo z organizacji GitHub). Uwaga CLI ≥ 55: nieinteraktywne `vercel link` NIE dziedziczy globalnie wybranego teamu — w skryptach/CI zawsze `--scope <slug>` lub env `VERCEL_ORG_ID`.
- [x] **Token do CI (na później, nie teraz)**: token z dashboardu (Account → Tokens) trzymać w env `VERCEL_TOKEN`, nigdy w fladze `--token` w skryptach ani w repo.
- [x] **Nawyki dla tego CLI**: `vercel logs` streamuje tylko z `--follow` (zmiana w 54.0); `vercel curl` do odpytywania chronionych preview; `vercel dev` NIE używamy (lokalna pętla = `next dev`).

**Kryterium**: `vercel --version` ≥ 56 i `vercel whoami` pokazuje właściwe konto w osobistym scope.

### B. Konfiguracja Supabase (ZATWIERDZONE 2026-07-15 — Supabase wybrany, nowy projekt Marketplace `eu-central-1`; wykonane 2026-07-15) ✅

> **Uwaga (2026-07-15)**: istniejący projekt Supabase użytkownika jest w `eu-west-1` i NIE jest używany (constraint Frankfurt-only). Provisioning = świeży projekt przez Marketplace. Lokalny `.env` z `SUPABASE_PASS` dotyczy tamtego projektu — TODO ludzkie, nie ruszać w sesji.

Ścieżka rekomendowana: **Vercel Marketplace** (jedna integracja = Postgres + Auth + Storage, billing przez Vercel, env vary auto-synchronizowane). Kroki do wykonania, gdy zapadnie decyzja o provisioningu:

- [x] **Bramka ludzka — warunki Marketplace**: akceptacja terms/billingu integracji Supabase w dashboardzie Vercela (darmowy tier: 2 bazy; billing i faktury idą przez Vercel, nie supabase.com).
- [x] **Utworzenie projektu**: `vercel integration add supabase` (lub Dashboard → Marketplace → Supabase → Install) — projekt MUSI powstać przez Vercel (ograniczenie marketplace'u). Przy tworzeniu wybrać region **`eu-central-1` (Frankfurt)** — wybór jest nieodwracalny i musi kolokować z funkcjami w `fra1`. To jest checklist-gate: zły region = provisioning od nowa.
- [x] **Env vary**: integracja auto-synchronizuje ~12 zmiennych do wszystkich scope'ów projektu, m.in. `POSTGRES_URL` (pooled), `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, klucz anon/publishable, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. Weryfikacja: `vercel env ls`. Lokalnie: `vercel env pull .env.local` (plik gitignorowany przez `.env*`). **`SUPABASE_SERVICE_ROLE_KEY` i `JWT_SECRET` są server-only — nigdy w kodzie klienta ani w `NEXT_PUBLIC_*`.**
- [ ] **Dostęp do dashboardu Supabase**: SSO z dashboardu Vercela (Storage → Open in Supabase). Ograniczenia ścieżki marketplace: brak custom domains Supabase, projekt zarządzalny tylko póki żyje integracja.
- [ ] **Auth OAuth (Google/GitHub — preferencja z PRD)**: konfiguracja w Supabase Dashboard → Authentication → Providers. Wymaga wcześniej utworzonych OAuth client ID/secret w Google Cloud Console i GitHub Developer Settings (**tylko człowiek** — konta zewnętrzne), z redirect URL `https://<project-ref>.supabase.co/auth/v1/callback`. W aplikacji dodatkowo Site URL / redirect allowlist na domeny `*.vercel.app` + produkcyjną.
- [x] **Supabase CLI (do migracji, przy pierwszym feature z DB)**: `npm i -D supabase` → `npx supabase login` (krok ludzki, token z dashboardu) → `npx supabase link --project-ref <ref>` → migracje w `supabase/migrations/`, wdrażane `npx supabase db push`. Migracje forward-only (rollback Vercela cofa kod, nie dane).

**B.1. Lokalny stack Supabase (dev bez dotykania zdalnej bazy):**

- [x] **Docker Desktop (krok ludzki, jednorazowy)**: zainstalować i uruchomić Docker Desktop na macOS — twardy wymóg `supabase start`; bez działającego demona Dockera lokalny stack nie wstanie (najczęstszy fałszywy alarm: „supabase nie działa" = Docker nie wystartował).
- [x] **Inicjalizacja projektu lokalnego**: `npx supabase init` — tworzy katalog `supabase/` w repo (`config.toml`, `migrations/`, opcjonalnie `seed.sql`); katalog jest commitowany (to kod, nie sekrety).
- [x] **Start lokalnego stacka**: `npx supabase start` — pierwsze uruchomienie ściąga obrazy Dockera (kilka minut). Wynik: lokalne API `http://127.0.0.1:54321`, Postgres `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323` + wypisane lokalne klucze `anon`/`service_role` (inne niż zdalne — to wartości wyłącznie lokalne, bezpieczne). `npx supabase stop` kończy pracę (`--no-backup` czyści stan).
- [ ] **Pętla migracji lokalnie**: `npx supabase migration new <nazwa>` → edycja SQL → `npx supabase db reset` (odtwarza lokalną bazę od zera z `migrations/` + `seed.sql`). Dopiero przetestowana migracja idzie na zdalny projekt przez `npx supabase db push` (po `supabase link`).
- [x] **Rozdział env lokalne vs zdalne**: w dev `.env.local` wskazuje lokalny stack (`SUPABASE_URL=http://127.0.0.1:54321` + lokalny anon key z outputu `supabase start`); wartości zdalne żyją w Vercelu. **Edge case**: `vercel env pull .env.local` NADPISUJE plik — po każdym pullu przywrócić lokalne wartości Supabase, albo pullować do osobnego pliku (`vercel env pull .env.vercel`, gitignorowany przez `.env*`) i scalać ręcznie.
- [ ] **OAuth lokalnie**: lokalny Auth działa, ale providerzy Google/GitHub wymagają wpisów w `supabase/config.toml` i lokalnych redirect URL (`http://127.0.0.1:54321/auth/v1/callback`) — osobne client ID/secret dla dev (krok ludzki, przy feature auth).

- [x] **Free-tier gotcha**: projekt darmowy pauzuje po ~tygodniu nieaktywności — wznowienie ręczne z dashboardu; zapisać w runbooku, żeby „nie działa baza" nie uruchamiało fałszywego debugowania. Lokalny stack (B.1) minimalizuje ruch na zdalnej bazie, więc pauzy będą częste — to oczekiwane.

**Kryterium**: sekcja jest kompletną instrukcją odpalenia Supabase w <30 min, z oznaczonymi bramkami ludzkimi; do czasu decyzji o provisioningu żaden krok nie jest wykonywany.

**Uwaga dot. `.env`**: w repo nie ma jeszcze żadnego pliku env i tak ma zostać do czasu provisioningu — sekrety lądują wyłącznie w `.env.local` generowanym przez `vercel env pull` (`.gitignore` pokrywa `.env*`). Ręcznie utworzony `.env` z wartościami wpisanymi na sztywno to anty-wzorzec dla tego projektu.

---

## Fazy wykonania (tracking checkboxami)

### Faza 1 — Preflight ✅

- [x] Upgrade CLI: `npm i -g vercel@latest` (fallback przy problemach z uprawnieniami: `npx vercel@latest` dla każdej komendy); weryfikacja `vercel --version` ≥ 56
- [x] `vercel whoami` — jeśli niezalogowany, poprosić użytkownika o `! vercel login` (interaktywna autoryzacja w przeglądarce = krok ludzki)
- [x] Stan gita: zmodyfikowany `.claude/.10x-cli-manifest.json` — zostawić poza commitami deployowymi (nie commitować cudzych zmian); potwierdzić branch `master`
- [x] `npm run lint` — exit 0
- [x] `npm run build` — exit 0, w outputcie potwierdzony Turbopack

**Kryterium ukończenia**: wszystkie 5 punktów zielone. Lokalna pętla dev to `next dev` — NIE dodajemy `vercel dev` (rejestr ryzyk infrastructure.md).

### Faza 2 — Link projektu + konfiguracja regionu ✅

- [x] `vercel link` z roota repo — **utworzyć NOWY projekt o nazwie `english-talk`** (nie domyślne `bootstrap-scaffold` — nazwa staje się domeną `*.vercel.app`); zweryfikować `cat .vercel/project.json` i że `.vercel/` jest gitignorowane
- [x] `npm i -D @vercel/config` (musi być zacommitowane — plik wykonuje się na builderach Vercela)
- [x] Utworzyć `vercel.ts` w roocie (dokładna treść niżej); upewnić się, że NIE istnieje `vercel.json`
- [x] Commit: `vercel.ts` + `package.json` + `package-lock.json` (styl: imperatywny, sentence-style, per konwencja repo)
- [x] Dashboard (read-only sprawdzenie, bez zmian): Fluid Compute włączone (default dla nowych projektów), Deployment Protection — zanotować stan do artefaktu

**`vercel.ts`** (składnia zweryfikowana z docs 2026-07-15):

```typescript
import type { VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // Frankfurt: użytkownicy PL/EU + przyszły Postgres w eu-central-1.
  // Hobby dopuszcza dokładnie jeden region; nadpisuje default iad1.
  regions: ['fra1'],
};
```

Świadomie NIE ustawiamy: `buildCommand`/`framework` (zero-config Next.js jest poprawny), `functionFailoverRegions` (Enterprise-only), `memory` (przy Fluid Compute tylko dashboard), per-route `maxDuration` (dopiero gdy powstanie route analizy).

**Kryterium ukończenia**: `.vercel/project.json` istnieje i nie jest trackowany; `npm run build` nadal przechodzi z `vercel.ts` w drzewie; commit widoczny w `git log`.

**Sekwencja krytyczna**: pin regionu MUSI być zacommitowany przed jakimkolwiek deployem — inaczej funkcje lądują w iad1, a zmiana regionu na żywym projekcie to bramka ludzka.

### Faza 3 — Groundwork integracji zewnętrznych (tylko decyzje i zapisy, zero provisioningu) ✅

- [x] **Postgres (ODŁOŻONE)**: zapisać w artefakcie twardy constraint — każdy przyszły datastore wyłącznie `eu-central-1`/Frankfurt; tabela porównawcza Supabase (Postgres + Auth OAuth Google/GitHub w jednej integracji — zgodne z preferencją PRD) vs Neon (scale-to-zero, branch DB per preview) jako wsad pod przyszłą decyzję
- [x] **Rate limiting (MERGE-GATE)**: zapisać regułę — PR z endpointem `POST /api/.../token` (mint `client_secrets`) NIE może się zmergować bez: (a) rate limitu (WAF per-IP — 1 darmowa reguła na Hobby — i/lub `@upstash/ratelimit` per-sesja), (b) krótkiego TTL tokenu (`expires_after.seconds`, sugerowane ≤600s), (c) nagłówka `OpenAI-Safety-Identifier`
- [x] **OpenAI — TODO ludzkie (zapis w artefakcie, nie do wykonania przez agenta)**: budżety OpenAI NIE blokują ruchu — jedyny twardy limit to przedpłacone kredyty z wyłączonym auto-recharge; dedykowany klucz `english-talk-prod` (+ osobny preview) tworzony dopiero przy feature; rotacja kluczy zawsze ręczna
- [x] **Aktualizacja foundation (wyraźne zlecenie użytkownika, 2026-07-15)**: dopisać do `context/foundation/tech-stack.md` notę przy wzmiance o OpenAI Realtime, a do `context/foundation/infrastructure.md` wpis decyzyjny: *OpenRouter oceniony i odrzucony (2026-07-15) — brak wsparcia Realtime API (WebRTC/ephemeral tokens); całość zostaje na OpenAI direct; rewizja dopuszczalna wyłącznie dla route'u analizy transkryptu (OpenRouter = przedpłacone kredyty + limity per-klucz jako twardy cap kosztów)*. Zmiany minimalne, punktowe — bez przepisywania kontraktów
- [x] **Utworzyć `.env.example` w roocie repo** (szablon nazw zmiennych, ZERO wartości — dokładna treść niżej) oraz dodać do `.gitignore` negację `!.env.example` — obecny wzorzec `.env*` ignorowałby również szablon
- [x] **Env vary w Vercelu (ODŁOŻONE)**: żadnych placeholderów w dashboardzie — brakująca zmienna failuje głośno w dev, placeholder failuje cicho na produkcji. `OPENAI_API_KEY` wchodzi do Vercela dopiero po ustawieniu bezpieczników po stronie OpenAI. `.env.example` dokumentuje nazwy; wartości lokalnie wyłącznie przez `vercel env pull .env.local`

**`.env.example`** (commitowany szablon — same nazwy, komentarze wskazują źródło wartości):

```bash
# english-talk — szablon zmiennych środowiskowych
# Wartości NIGDY nie trafiają do repo.
# Lokalnie:   vercel env pull .env.local   (po podlinkowaniu projektu)
# Produkcja:  vercel env add <NAZWA> production

# --- OpenAI (Realtime voice: mint tokenów client_secrets + analiza transkryptu; server-only) ---
OPENAI_API_KEY=

# --- Supabase / Postgres (auto-provisionowane przez Vercel Marketplace po decyzji o DB) ---
# POSTGRES_URL=
# POSTGRES_PRISMA_URL=
# POSTGRES_URL_NON_POOLING=
# SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=   # server-only, nigdy w kodzie klienta
# SUPABASE_JWT_SECRET=         # server-only
```
- [x] **Fluid Compute constraint**: zapisać — żadnego stanu per-user/per-request w module scope (reuse instancji między równoległymi requestami)

**Kryterium ukończenia**: wszystkie decyzje i constrainty mają swoje wpisy w treści przygotowanej do `deploy-plan.md` (Faza 5). Nic nie zostało sprovisionowane, żaden sekret nie istnieje w repo ani w Vercelu.

### Faza 4 — Preview deploy + weryfikacja ✅

- [x] `vercel` (preview) z czystego, zacommitowanego drzewa; przechwycić URL
- [x] `vercel inspect <preview-url>` — framework Next.js, build Turbopack (logi: `vercel inspect --logs <url>`)
- [x] Weryfikacja regionu: ustawienie funkcji projektu = `fra1` (scaffold może być w pełni statyczny — pin dotyczy funkcji; sprawdzić na poziomie projektu, nie odpowiedzi HTTP)
- [x] Smoke test: `curl -sI <preview-url>` — **oczekiwany 401** (Deployment Protection default-on); pełna weryfikacja treści przez `vercel curl <path>` lub zalogowaną przeglądarkę użytkownika
- [x] Jeśli region ≠ fra1 → STOP, poprawić `vercel.ts`, recommit, ponowny preview

**Kryterium ukończenia**: preview w stanie Ready (`vercel ls`), build Turbopack potwierdzony, region projektu fra1, strona renderuje się poprawnie.

> **Wykonanie odbiegło od planu (2026-07-15)**: `vercel deploy --yes` bez `--prod` dostał `target: production` (zachowanie CLI 56 przy pierwszym deployu). Decyzja użytkownika: produkcja zostaje (https://english-talk-black.vercel.app), bez dodatkowego preview. Weryfikacje (Ready, Turbopack, fra1, render) wykonane na tym deploymencie. Szczegóły: `context/deployment/deploy-plan.md`, sekcja „Odchylenia".

### Faza 5 — Artefakt `context/deployment/deploy-plan.md` + STOP ✅

- [x] Utworzyć `context/deployment/` i zapisać `deploy-plan.md` (dozwolone: zakaz edycji dotyczy tylko `context/foundation/*`, zakaz zapisu — `context/archive/`). Zawartość:
  - ten plan z odhaczonymi checkboxami (stan faktyczny wykonania)
  - snapshot platformy: nazwa projektu, preview URL, region fra1, Fluid Compute on, Deployment Protection on, inwentarz env varów (nazwy + scope, NIGDY wartości — na razie pusty)
  - dziennik decyzji: DB odłożone (Frankfurt-only), rate-limit jako merge-gate, prod odłożony
  - **rejestr bramek ludzkich**: `vercel --prod` / `vercel promote` / `vercel rollback`, podpięcie Git integration (= otwarcie auto-deployu produkcji; wymaga też branch protection na `master`), rotacja kluczy, zmiana regionu, zmiany planu/billing (klif licencyjny Hobby przy komercjalizacji → Pro $20/mies.), limity OpenAI (przedpłata)
  - **standing constraints dla przyszłych feature'ów**: merge-gate tokenów, cap 300s dla route analizy transkryptu (cap długości / streaming / background — Pro 800s jako escape hatch), zakaz stanu w module scope, datastore Frankfurt-only, `next dev` nie `vercel dev`, migracje forward-only, nie włączać `cacheComponents` bez weryfikacji bugów Turbopack, logi Hobby żyją 1h (debugować od razu)
  - runbook produkcyjny na następną sesję: `vercel --prod` → smoke test → zapis deployment ID jako known-good rollback target → `vercel git connect` + branch protection na `master` → od tej pory merge do master = deploy produkcyjny (human gate przenosi się na merge)
- [x] Commit artefaktu (tylko on)
- [x] Raport końcowy dla użytkownika: co zrobione, preview URL, dokładna lista kroków czekających na jego zgodę

**Kryterium ukończenia**: `deploy-plan.md` zacommitowany, bez sekretów; użytkownik dostał listę bramek. Sesja NIE wykonuje `vercel --prod` ani `vercel git connect`.

---

## Rejestr edge case'ów (co może pójść nie tak → wsparcie ekstra)

| Edge case | Ryzyko | Mitygacja | Wykonawca |
|---|---|---|---|
| Upgrade CLI failuje (uprawnienia npm -g) | blokada startu | fallback `npx vercel@latest` | agent |
| `vercel link` na złym koncie/teamie | projekt w złym scope | `vercel whoami` przed linkiem; CLI 55+ wymaga `--scope` nieinteraktywnie | agent + potwierdzenie człowieka |
| Region zostaje iad1 | +100–150ms US↔EU na każdej przyszłej funkcji; zmiana na żywym prodzie = bramka | `vercel.ts` commitowany PRZED pierwszym deployem; check na preview | agent |
| Brak `@vercel/config` w deps | każdy build na Vercelu failuje (vercel.ts wykonuje się w build time) | commit zależności w Fazie 2 | agent |
| Preview 401 w curl | fałszywy alarm „deploy nie działa" | to Deployment Protection (default-on) — weryfikacja przez `vercel curl`/przeglądarkę | agent |
| `vercel logs` bez `--follow` (zmiana w 54.0) | agent czeka na stream, którego nie ma | historyczne: `vercel logs <url>`; stream: `--follow`; retencja Hobby = 1h | agent |
| Przyszły endpoint tokenów bez rate limitu | runaway bill OpenAI (scenariusz pre-mortem) | merge-gate w deploy-plan.md; WAF 1 reguła free na Hobby; TTL ≤600s | gate w review |
| Budżet OpenAI „ustawiony" ale nie blokuje | czterocyfrowy rachunek mimo alertów | przedpłacone kredyty + auto-recharge OFF (jedyny hard stop) | **tylko człowiek** |
| Route analizy > 300s (Hobby) | user kończy sesję i dostaje błąd — najgorsze miejsce awarii | constraint: cap transkryptu/streaming/background; Pro=800s | projekt feature |
| Git integration podpięta „przy okazji" | auto-deploy prod bez bramki ludzkiej | odłożone do osobnej zgody + branch protection na `master` | **tylko człowiek** |
| `cacheComponents`/dynamic imports na Turbopack | build fail (vercel/next.js#94456) | nie włączać przy pierwszym deployu | agent |

## Pliki

- **Tworzone**: `vercel.ts` (root), `.env.example` (root, szablon nazw — zero wartości), `context/deployment/deploy-plan.md`
- **Modyfikowane**: `package.json` + `package-lock.json` (devDep `@vercel/config`), `.gitignore` (negacja `!.env.example`), `context/foundation/tech-stack.md` + `context/foundation/infrastructure.md` (punktowy wpis decyzyjny OpenAI-direct / OpenRouter-odrzucony — wyraźne zlecenie użytkownika 2026-07-15, wyjątek od reguły no-edit)
- **Read-only**: `context/foundation/prd.md`, `context/foundation/shape-notes.md`, `next.config.ts` (bez zmian — celowo puste)
- **Nietykane**: `.claude/.10x-cli-manifest.json` (lokalna zmiana użytkownika), `.env` (nie tworzyć), `context/archive/`

## Weryfikacja end-to-end

1. `vercel --version` ≥ 56; `vercel whoami` = konto użytkownika.
2. `npm run lint` i `npm run build` przechodzą lokalnie (Turbopack w outputcie).
3. `vercel ls` pokazuje preview w stanie Ready; `vercel inspect <url>` potwierdza Next.js + region projektu fra1.
4. Strona scaffoldu renderuje się na preview URL (przez `vercel curl` lub przeglądarkę użytkownika — 401 z anonimowego curl jest oczekiwany).
5. `git log` zawiera dwa commity: konfiguracja (`vercel.ts` + deps) i artefakt (`deploy-plan.md`); `git status` nie pokazuje żadnych sekretów ani `.vercel/`.
6. `context/deployment/deploy-plan.md` istnieje, zawiera rejestr bramek ludzkich i standing constraints, zero wartości sekretów.
