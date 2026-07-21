<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Minimal OAuth Login (Google via Supabase Auth)

- **Plan**: `context/changes/minimal-oauth-login/plan.md`
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-07-21
- **Verdict**: NEEDS ATTENTION → resolved in triage 2026-07-21 (6 fixed, 3 skipped)
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (13/13 MATCH) |
| Scope Discipline | PASS (zero violations; lessons.md bundling user-approved) |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS (lint/build green on master; manual items confirmed live per-phase) |

## Findings

### F1 — Luźny prefix `/auth` w bramce proxy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/proxy.ts:43
- **Detail**: `!pathname.startsWith('/auth')` bez ukośnika — trasy typu `/authors`, `/auth-settings` ominą bramkę sesji; dodatkowo każda PRZYSZŁA strona pod `src/app/auth/` wyjdzie niezalogowana (dziś żyje tam tylko callback). `requireUser()` w stronach jest drugą warstwą, ale bramka powinna być szczelna.
- **Fix**: Zamień wyjątek na dokładny allow-list: `pathname === '/login' || pathname === '/auth/callback'`.
- **Decision**: SKIPPED

### F2 — Guard `next` przepuszcza `//evil.com` (dziś nieeksploitowalne)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/auth/callback/route.ts:11-13
- **Detail**: `startsWith('/')` akceptuje `next=//evil.com`. Dziś bezpieczne wyłącznie dzięki konkatenacji po pełnym originie (`${origin}${next}` → path, nie authority) — ale komentarz obiecuje "guard przed open redirectem", a jeden refactor na `new URL(next, origin)` zrobiłby z tego żywy open redirect.
- **Fix**: Utwardź guard: odrzucaj też `next.startsWith('//')` i `next.startsWith('/\\')`.
- **Decision**: SKIPPED

### F3 — `signOut()` ignoruje błąd — cicha pętla powrotu na `/`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/auth/actions.ts:43-44
- **Detail**: Gdy `supabase.auth.signOut()` zawiedzie, akcja i tak przekierowuje na `/login`, a proxy widzi wciąż ważną sesję i odbija na `/` — użytkownik klika „Wyloguj się" i ląduje z powrotem na home bez żadnego komunikatu ani śladu w logach.
- **Fix**: Sprawdź `error` i zaloguj go (`console.error`) przed przekierowaniem — awaria staje się diagnozowalna w logach Vercela (logi Hobby żyją 1h — standing constraint #8 wymaga natychmiastowej diagnozy).
- **Decision**: FIXED

### F4 — Nagłówki z `setAll` gubione na odpowiedziach redirect w proxy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/proxy.ts:62-70
- **Detail**: `@supabase/ssr@0.12.3` przekazuje do `setAll` drugi argument `headers` (anty-cache przy `Set-Cookie`); pass-through response je ustawia (proxy.ts:27-29), ale `withSessionCookies` kopiuje na redirecty tylko cookies. Ryzyko na Vercelu niskie, lecz kod w połowie realizuje kontrakt biblioteki, do którego się jawnie zapisał.
- **Fix**: Przechwyć `headers` obok odpowiedzi i kopiuj je w `withSessionCookies` razem z cookies.
- **Decision**: FIXED

### F5 — Błędy `getUser()` niewidoczne (fail-closed, ale bez śladu)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/proxy.ts:37-39; src/lib/supabase/server.ts:36-38
- **Detail**: Destrukturyzacja tylko `user` — awaria Supabase wygląda identycznie jak „wylogowany": wszystko 307-uje na `/login`, zero logów. Fail-closed to właściwa postawa; brakuje tylko obserwowalności.
- **Fix**: `console.error` gdy `error` jest truthy, w obu miejscach.
- **Decision**: FIXED (z filtrem AuthSessionMissingError — brak sesji to stan normalny, nie awaria)

### F6 — Martwy parametr `next` / gubione deep linki

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/proxy.ts:46 (`url.search = ''`); src/app/auth/callback/route.ts:9-13
- **Detail**: Nic w kodzie nie ustawia `?next=` — obsługa w callbacku to martwy kod, a proxy jawnie kasuje pierwotny cel; niezalogowany deep link zawsze ląduje na `/` po zalogowaniu. Przy jednej stronie (`/`) bez znaczenia, przy S-02+ zacznie uwierać.
- **Fix A ⭐ Recommended**: Zostaw jak jest; przewlecz `next` dopiero gdy pojawi się druga chroniona strona (S-02) — z utwardzonym guardem z F2.
  - Strength: Zero pracy teraz; YAGNI — dziś nie ma dokąd deep-linkować.
  - Tradeoff: Trzeba pamiętać przy S-02 (nota w plan-brief przyszłej zmiany).
  - Confidence: HIGH — jedna chroniona strona w aplikacji.
  - Blind spot: None significant.
- **Fix B**: Usuń obsługę `next` z callbacka całkowicie (martwy kod out).
  - Strength: Mniej kodu, mniej powierzchni na F2.
  - Tradeoff: Przy S-02 trzeba będzie odtworzyć wzorzec z referencji Supabase.
  - Confidence: MED — wzorzec i tak jest udokumentowany.
  - Blind spot: None significant.
- **Decision**: SKIPPED

### F7 — `lang="en"` przy w pełni polskim UI

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/layout.tsx:28
- **Detail**: Metadata, login i home są po polsku, a `<html lang="en">` — czytniki ekranu i auto-tłumaczenie przeglądarek dostają zły sygnał. (Pełne a11y poza zakresem v1; to jednoliterowa poprawność semantyczna.)
- **Fix**: `lang="pl"`.
- **Decision**: FIXED

### F8 — Mieszany styl: nowe pliki vs scaffold, brak formattera

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/layout.tsx vs src/proxy.ts i pozostałe nowe pliki
- **Detail**: Nowe pliki auth: pojedyncze cudzysłowy, bez średników (spójnie); scaffold (layout.tsx, page.tsx sprzed zmiany): podwójne + średniki. Brak konfiguracji Prettiera, która by to rozstrzygała — warto wybrać standard zanim baza urośnie.
- **Fix**: Dodaj config formattera (np. Prettier z ustawieniami nowych plików) w osobnej, mechanicznej zmianie.
- **Decision**: FIXED (minimalny `.prettierrc` — singleQuote, no-semi — dodany od razu na życzenie; bez reformatowania scaffoldu)

### F9 — Założenia platformowe do zapamiętania (zbiorczo)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/auth/callback/route.ts:19-28; src/proxy.ts:74; supabase/config.toml:346
- **Detail**: Trzy świadome założenia, bezpieczne dziś, warte komentarza/pamięci: (a) zaufanie do `x-forwarded-host` jest poprawne wyłącznie na Vercelu (self-hosting = spoofowalny redirect), (b) matcher proxy wyłącza każdą ścieżkę kończącą się rozszerzeniem obrazka — przyszły dynamiczny route typu `/report.png` ominie bramkę, (c) `skip_nonce_check = true` dotyczy tylko lokalnego stacka — nie przenosić do hostowanego projektu (np. przez `supabase config push`).
- **Fix**: Jednolinijkowe komentarze przy (a) i (b) w kodzie; (c) już ma komentarz w config.toml.
- **Decision**: FIXED
