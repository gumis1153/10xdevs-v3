# Deploy plan — english-talk (wykonany 2026-07-15)

Artefakt Plan Mode deploy (M1L5). Stan faktyczny wykonania planu
`context/changes/deployment/deployment-plan.md` + rejestr bramek ludzkich
i standing constraints dla przyszłych sesji.

## Snapshot platformy (2026-07-15)

| Pole | Wartość |
|---|---|
| Projekt | `gumis1153s-projects/english-talk` (`prj_b8uitxqUyKOYg4okiggJJmqB7kQI`) |
| Plan | Hobby, scope osobisty `gumis1153s-projects` |
| Deployment | `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w` — **production**, status Ready |
| URL produkcyjny | https://english-talk-black.vercel.app (HTTP 200, publiczny) |
| URL deploymentu | https://english-talk-e1fwu3ag4-gumis1153s-projects.vercel.app (302 → SSO, chroniony) |
| Region funkcji | **fra1** (potwierdzone w buildach: `λ index [fra1]`) |
| Build | Next.js 16.2.9 + Turbopack (potwierdzone w logach builda) |
| Fluid Compute | ON (default) |
| Deployment Protection | ON — `all_except_custom_domains` (anonimowy curl na URL-e deploymentów = 401/302; aliasy produkcyjne publiczne) |
| Node na builderach | 24.x |
| Git integration | **PODŁĄCZONA** (2026-07-20, zmiana `pr-preview-pipeline`): `english-talk` ↔ `github.com/gumis1153/10xdevs-v3`, production branch `master`; merge do `master` = deploy produkcyjny, każdy PR = preview URL |
| Supabase (Marketplace) | zasób **`supabase-cordovan-kettle`**, region **eu-central-1** (potwierdzony w connection stringach), status Available, podpięty do `english-talk`; terms zaakceptowane przez użytkownika 2026-07-15; billing przez Vercel (free tier) |
| Env vary | **16 zmiennych Supabase** auto-provisionowanych przez integrację, wszystkie scope'y (Production/Preview/Development): `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. `OPENAI_API_KEY` nadal nieustawiony (czeka na bezpieczniki OpenAI) |
| Lokalny stack Supabase | devDep `supabase` + `supabase/` w repo (`npx supabase start/stop`); szczegóły w sekcji „Lokalny dev" |
| CLI | vercel 56.2.0, konto `gumis1153` |

## Stan wykonania faz

- ✅ **A. Konfiguracja CLI** — upgrade 50.43.0 → 56.2.0, `vercel login` (krok ludzki), `whoami` = gumis1153, scope osobisty.
- ⏸️ **B. Supabase** — NIE wykonywane (decyzja 2026-07-15: provisioning odłożony). Instrukcja pozostaje w planie źródłowym.
- ✅ **Faza 1 — Preflight** — lint 0 błędów, build z Turbopackiem, branch `master`.
- ✅ **Faza 2 — Link + region** — projekt `english-talk` utworzony, `vercel.ts` (`regions: ['fra1']`) + `@vercel/config` zacommitowane PRZED deployem (commit `02749c3`), `npx @vercel/config validate` ✓, `.vercel/` i `.env.local` gitignorowane.
- ✅ **Faza 3 — Groundwork** — `.env.example` + negacja `!.env.example` w `.gitignore`, wpisy decyzyjne OpenAI-direct w `tech-stack.md` i `infrastructure.md` (commit `a3b0041`).
- ✅ **Faza 4 — Deploy** — wykonany; szczegóły i odchylenie niżej.
- ✅ **Faza 5 — Artefakt** — ten plik.

## Odchylenia od planu (dziennik)

1. **Deploy trafił na produkcję zamiast preview.** `vercel deploy --yes` (bez `--prod`) dostał `target: production` — zachowanie CLI 56 przy pierwszym deployu, nie jawna flaga. Ryzyko zerowe (goły scaffold, zero sekretów). **Decyzja użytkownika (2026-07-15): zostawić produkcję**, bez dodatkowego preview. Bramka „pierwszy prod" = skonsumowana. Wniosek na przyszłość: preview deployować jawnie `vercel deploy --target=preview`.
2. **CLI 56 auto-podpiął repo GitHub przy `vercel link`** — natychmiast odłączono (`vercel git disconnect`), bo podpięcie Gita = osobna bramka ludzka. Wniosek: `vercel link` w CLI ≥56 podpina Git bez pytania.
3. **Istnieje lokalny `.env` z sekretem `SUPABASE_PASS`** — plan zakładał brak plików env, a Supabase nie jest sprovisionowany. Plik jest poprawnie gitignorowany (nie trafi do repo), zgodnie z planem nieruszany. **TODO człowiek**: zweryfikować skąd pochodzi i czy nie jest martwy; jeśli martwy — usunąć ręcznie.
4. **Globalny `core.excludesfile`** (`~/Herd/dev-items/.gitignore`) ignoruje `package-lock.json` we wszystkich repo. Lockfile dodany wymuszeniem (`git add -f`) — raz strackowany, ignore go nie dotyczy. **TODO człowiek (opcjonalnie)**: przejrzeć globalny excludes, czy nie psuje innych projektów node'owych.
5. **Trzy commity zamiast dwóch** — groundwork Fazy 3 (`.env.example`, `.gitignore`, foundation) wszedł osobnym commitem `a3b0041`; plan wymieniał te pliki, ale nie przypisał im commita.
6. **Stare wolumeny Dockera blokowały lokalny stack** — `supabase start` crash-loopował na `database files are incompatible with server`: na maszynie istniały wolumeny `supabase_{db,config,storage}_10xdevs` z **2025-05-06** (wcześniejsze podejście, starszy Postgres major). Obejście bez kasowania danych: `project_id` w `supabase/config.toml` zmienione z `10xdevs` na `english-talk` → CLI utworzył świeże wolumeny, stare zostały nietknięte. **TODO ludzkie (opcjonalnie)**: gdy stare dane na pewno zbędne — `docker volume rm supabase_config_10xdevs supabase_db_10xdevs supabase_storage_10xdevs`.

## Dziennik decyzji

- **AI provider: OpenAI direct; OpenRouter odrzucony (2026-07-15)** — brak wsparcia Realtime API (WebRTC/ephemeral `client_secrets`). Rewizja dopuszczalna wyłącznie dla route'u analizy transkryptu (OpenRouter = przedpłacone kredyty + limity per-klucz jako twardy cap). Zapisane w `context/foundation/infrastructure.md` (Decision Log) i `tech-stack.md`.
- **DB: SUPABASE (decyzja użytkownika 2026-07-15)** — wygrał z Neonem, bo bundluje Auth OAuth Google/GitHub (preferencja PRD) + Storage w jednej integracji Marketplace, z billingiem przez Vercel. **Nowy projekt przez Vercel Marketplace w `eu-central-1`** (twardy constraint kolokacji z fra1 utrzymany). Istniejący projekt użytkownika na supabase.com (`eu-west-1`) **odrzucony dla tego repo** — regionu nie da się zmienić, a złamanie kolokacji kosztowałoby ~20–25 ms na każdym roundtripie funkcja↔DB; projekt zostaje nietknięty poza zakresem repo. Instrukcja wykonania: sekcja B planu źródłowego.
- **Rate limiting odłożony jako MERGE-GATE** (patrz standing constraints).
- **Produkcja live od 2026-07-15** (decyzja użytkownika po odchyleniu nr 1).
- **Git integration podłączona + repo public (2026-07-20, zmiana `pr-preview-pipeline`)** — GitHub Free zwraca 403 dla rulesetów na prywatnym repo; po sweepie treści (zero sekretów w plikach i w historii gita; jawnie zaakceptowano publiczny email autora commitów) repo `10xdevs-v3` upublicznione, ruleset `protect-master` włączony. Decyzja użytkownika (fallback wybrany przy planowaniu, potwierdzony przy wykonaniu).

## Rejestr bramek ludzkich

Wymagają jawnej zgody człowieka; agent może przygotować, nie wykonuje:

| Akcja | Uwagi |
|---|---|
| `vercel promote` / `vercel rollback` | mutacje produkcji; known-good rollback target: `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w` |
| Kolejne deploye produkcyjne | preview jawnie `--target=preview`; prod tylko za zgodą |
| ~~`vercel git connect`~~ SKONSUMOWANA 2026-07-20 | Git podpięty (zmiana `pr-preview-pipeline`); ruleset `protect-master` aktywny (PR wymagany, zakaz force-push/delete). Bramka produkcyjna = merge PR do `master`. UWAGA (historyczna): `vercel link` w CLI ≥56 podpina Git automatycznie — po linkowaniu sprawdzić |
| Rotacja kluczy (OpenAI, przyszłe DB) | zawsze ręczna |
| Zmiana regionu na żywym projekcie | fra1 zacommitowany; zmiana = bramka |
| Zmiany planu/billingu | klif licencyjny Hobby przy komercjalizacji → Pro $20/mies. |
| Limity OpenAI | budżety NIE blokują ruchu; jedyny twardy bezpiecznik = przedpłacone kredyty + auto-recharge OFF; dedykowany klucz `english-talk-prod` (+ osobny preview) dopiero przy feature |
| Warunki Marketplace Supabase | akceptacja terms/billingu w dashboardzie |
| OAuth client ID/secret (Google/GitHub) | konta zewnętrzne, tylko człowiek |
| Weryfikacja/usunięcie lokalnego `.env` z `SUPABASE_PASS` | należy do istniejącego projektu Supabase użytkownika (`eu-west-1`, poza zakresem repo); może być jedyną kopią hasła — przenieść/usunąć wyłącznie ręcznie |

## Standing constraints dla przyszłych feature'ów

1. **MERGE-GATE tokenów Realtime**: PR z endpointem mintującym `client_secrets` (`POST /api/.../token`) NIE wchodzi na `master` bez: (a) rate limitu (WAF per-IP — 1 darmowa reguła na Hobby — i/lub `@upstash/ratelimit` per-sesja), (b) TTL tokenu ≤600s (`expires_after.seconds`), (c) nagłówka `OpenAI-Safety-Identifier`. Punkt egzekwowania: review PR (od 2026-07-20 wszystkie zmiany wchodzą przez PR — patrz constraint #11).
2. **Cap 300s (Hobby, Fluid)** dla route'u analizy transkryptu — cap długości / streaming / background; escape hatch: Pro 800s.
3. **Zakaz stanu per-user/per-request w module scope** — Fluid Compute reuse'uje instancje między równoległymi requestami.
4. **Datastore wyłącznie Frankfurt/`eu-central-1`.**
5. **Lokalna pętla dev = `next dev`**, nie `vercel dev`.
6. **Migracje forward-only** (rollback Vercela cofa kod, nie dane).
7. **Nie włączać `cacheComponents`** bez weryfikacji bugów Turbopacka (vercel/next.js#94456, #87283).
8. **Logi runtime Hobby żyją 1h** — debugować od razu; `vercel logs` streamuje tylko z `--follow`.
9. **Sekrety wyłącznie przez `vercel env`** (`vercel env pull .env.local`); zero placeholderów w dashboardzie; `.env.example` dokumentuje same nazwy. Uwaga: `vercel env pull` NADPISUJE `.env.local`.
10. **Nieinteraktywne `vercel link`/skrypty: zawsze `--scope gumis1153s-projects`** (CLI ≥55 nie dziedziczy teamu).
11. **Wszystkie zmiany przez PR do `master`** (ruleset `protect-master`: PR wymagany, zakaz force-push/delete; bezpośredni push odrzucany). Preview URL-e są za Deployment Protection — weryfikacja przez `vercel curl / --deployment <preview-url>` albo zalogowaną przeglądarkę; anonimowy 401 to poprawne zachowanie, nie awaria.

## Lokalny dev (Supabase, stan 2026-07-15)

- Stack: `npx supabase start` / `npx supabase stop` (wymaga działającego Docker Desktop). API `http://127.0.0.1:54321`, Postgres `54322`, Studio `54323`.
- `.env.local` (gitignorowany) = wartości LOKALNEGO stacka + `VERCEL_OIDC_TOKEN`; zdalne wartości do inspekcji przez `vercel env pull .env.vercel` (osobny plik — pull NADPISUJE cel).
- Pętla migracji: `npx supabase migration new <nazwa>` → SQL → `npx supabase db reset` (lokalnie od zera); na zdalny projekt `npx supabase db push` dopiero po `npx supabase login` + `link` (token = krok ludzki, ODŁOŻONE do pierwszej migracji).
- Free-tier gotcha: zdalny projekt pauzuje po ~tygodniu nieaktywności (wznowienie ręczne z dashboardu; przy lokalnym devie pauzy będą częste — to oczekiwane, nie awaria).
- Dashboard zdalny: SSO z dashboardu Vercela (Storage → Open in Supabase); OAuth Google/GitHub — konfiguracja ODŁOŻONA do feature auth (client ID/secret = tylko człowiek).

## Runbook — następna sesja

Produkcja już live, więc runbook z planu redukuje się do:

1. ~~(bramka) `vercel git connect` + branch protection na `master`~~ **WYKONANE 2026-07-20** (zmiana `pr-preview-pipeline`): merge do `master` = deploy produkcyjny, każdy PR = preview URL; human gate siedzi na merge'u PR.
2. Known-good rollback target: `dpl_Ea4wHR5CFcnF5hQeHZYrQvnVHi3w` (scaffold, fra1).
3. Przy pierwszym feature z AI: bezpieczniki OpenAI (przedpłata, auto-recharge OFF, klucz per-środowisko) → dopiero wtedy `vercel env add OPENAI_API_KEY production`.
4. Przy pierwszym feature z DB: schemat + pierwsza migracja lokalnie (`supabase migration new` → `db reset`), potem `npx supabase login` + `link --project-ref` (krok ludzki) i `db push`; RLS włączone od pierwszej tabeli.
5. Przy feature auth: OAuth Google/GitHub w Supabase Dashboard (client ID/secret — tylko człowiek) + Site URL/redirect allowlist na `*.vercel.app` i domenę produkcyjną; lokalnie wpisy w `supabase/config.toml`.
