---
project: "english-talk"
version: 1
status: draft
created: 2026-07-18
updated: 2026-07-22
prd_version: 1
main_goal: speed
top_blocker: decisions
---

# Roadmap: english-talk

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Polscy programiści na poziomie A2–B2 mają barierę mówioną w angielskim — piszą sprawnie, ale w sytuacjach głosowych (call, rekrutacja, klient) wpadają w paraliż napędzany strachem przed oceną. Produkt daje im bezpieczne środowisko: krótką rozmowę głosową z aplikacją na zadany temat, a po niej raport z konkretnymi błędami, oceną CEFR i sugestiami do dalszej nauki. Nisza „programista z konkretnym poziomem i kontekstem zawodowym" jest dla dużych dostawców za wąska, żeby w nią zainwestować — i to jest szansa tego produktu.

## North star

**S-03: Użytkownik może odbyć 2–3 minutową rozmowę głosową po angielsku na zaakceptowany temat** — bo to najbardziej ryzykowne założenie produktu (założenie, którego obalenie unieważnia resztę planu): „głos w obie strony to jest produkt" (PRD, FR-007), a zarazem jedyna część, której wykonalności w przeglądarce nie da się udowodnić na papierze.

> „Gwiazda przewodnia" oznacza tutaj: najmniejszy przepływ od końca do końca, którego udane dostarczenie udowadnia główną hipotezę produktu — umieszczony tak wcześnie, jak pozwalają jego zależności, bo wszystko inne ma sens tylko wtedy, gdy to działa.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                                | Prerequisites                    | PRD refs                        | Status   |
| ---- | ------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- | ------------------------------- | -------- |
| F-01 | pr-preview-pipeline       | (foundation) merge do `master` = automatyczny deploy; PR = preview URL              | —                                | tech-stack: ci_default_flow     | done     |
| S-01 | minimal-oauth-login       | użytkownik może założyć konto i zalogować się (OAuth Google)                        | —                                | FR-001, FR-002, US-01           | done     |
| S-02 | session-topic-proposal    | użytkownik może rozpocząć sesję: widzi wylosowany temat, może odrzucić i wylosować inny | —                            | FR-003, FR-004, US-01           | done     |
| S-03 | first-voice-conversation  | użytkownik może odbyć 2–3 min rozmowę głosową po angielsku i zakończyć ją w dowolnym momencie | S-02, bezpieczniki OpenAI (krok ludzki) | FR-006, FR-007, FR-008, FR-009, US-01 | proposed |
| S-04 | post-session-report       | użytkownik widzi po sesji raport: pogrupowane błędy, ocena CEFR z disclaimerem, sugestie | S-03                         | FR-010, FR-011, FR-012, FR-013, US-01 | proposed |
| S-05 | session-archive-transcript | użytkownik widzi archiwum swoich sesji z transkrypcją i raportem                    | S-01, S-04                       | FR-014, FR-015                  | proposed |
| S-06 | adaptive-level-tuning     | aplikacja wnioskuje poziom z pierwszej wymiany zdań i dostosowuje tempo oraz słownictwo | S-03                         | FR-005                          | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme            | Chain                                                | Note                                                                                      |
| ------ | ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A      | Ścieżka głosowa  | `S-02` → `S-03` → `S-04` → `S-05` (odgałęzienie: `S-06` po `S-03`) | Ścieżka must-have — najkrótszy ciąg plasterków pokrywający wszystkie wymagania konieczne (FR must-have) — do gwiazdy przewodniej i raportu; `S-05`/`S-06` to nice-to-have na końcu. |
| B      | Konto            | `S-01`                                               | Równoległa do Streamu A; dołącza do niego przy `S-05` (archiwum wymaga tożsamości).        |
| C      | Delivery         | `F-01`                                               | Niezależny enabler weryfikacji (preview per PR); czeka na bramkę ludzką.                   |

## Baseline

What's already in place in the codebase as of `2026-07-18` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Next.js 16 scaffold obecny (`src/app/layout.tsx`, `src/app/page.tsx`), ale to goły create-next-app bez produktowego UI.
- **Backend / API:** absent — brak route handlers, server actions i `proxy.ts`.
- **Data:** partial — Supabase sprovisionowany (Vercel Marketplace, `eu-central-1`, 16 env vars) + lokalny stack (`supabase/config.toml`), ale zero migracji, zero schematu, brak klienta Supabase w dependencies.
- **Auth:** partial — Supabase Auth wybrany (decyzja 2026-07-15 w deploy-plan), klucze provisionowane, ale zero kodu auth w runtime; OAuth client ID/secret — krok ludzki, odłożony.
- **Deploy / infra:** partial — hosting obecny: produkcja live na Vercel (`fra1`, `vercel.ts`, https://english-talk-black.vercel.app); ale Git integration odłączona i brak CI (`.github/workflows` nie istnieje).
- **Observability:** absent — zero logowania i error trackingu (logi runtime na planie Hobby żyją 1h).

## Foundations

### F-01: Podpięcie delivery pipeline (Git → auto-deploy + preview)

- **Outcome:** (foundation) merge do `master` buduje produkcję automatycznie, a każdy PR dostaje preview URL — ścieżka weryfikacji dla wszystkich plasterków.
- **Change ID:** pr-preview-pipeline
- **PRD refs:** — (źródło: `tech-stack.md` hint `ci_default_flow: auto-deploy-on-merge`; runbook w `context/deployment/deploy-plan.md`, krok 1)
- **Unlocks:** ścieżka weryfikacji (preview per PR) dla S-01–S-06; punkt egzekwowania MERGE-GATE dla S-03 (standing constraint #1 z deploy-plan)
- **Prerequisites:** —
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - Zgoda człowieka na `vercel git connect` + branch protection na `master` (bramka ludzka z rejestru w deploy-plan) — Owner: user. Block: yes.
- **Risk:** bez tego deploye pozostają ręczne przez CLI (dopuszczalne, ale każdy prod-deploy to osobna bramka ludzka); podpięcie Gita przenosi bramkę na merge i odblokowuje weryfikację preview per PR.
- **Status:** done

## Slices

### S-01: Minimalne logowanie OAuth

- **Outcome:** użytkownik może założyć konto i zalogować się (OAuth Google); aplikacja jest za bramką logowania. (Decyzja 2026-07-20 przy planowaniu: wyłącznie Google — GitHub odrzucony, nie odłożony.)
- **Change ID:** minimal-oauth-login
- **PRD refs:** FR-001, FR-002, US-01 (Given: zalogowany użytkownik), sekcja Access Control
- **Prerequisites:** — (konfiguracja OAuth client ID/secret w Supabase Dashboard to krok ludzki wykonywany W RAMACH tego plasterka, nie przed nim)
- **Parallel with:** S-02, S-03, S-04, S-06, F-01
- **Blockers:** —
- **Unknowns:**
  - ~~Potwierdzenie metody uwierzytelnienia~~ ROZSTRZYGNIĘTE 2026-07-20 (planowanie S-01): OAuth-only, wyłącznie Google via Supabase Auth; GitHub odrzucony jako decyzja produktowa (przywrócenie = nowa decyzja).
- **Risk:** najmniejszy plasterek z krokiem ludzkim w środku (client ID/secret); zrobiony wcześnie, bo domyka Open Q1 i odblokowuje archiwum (S-05), a biegnie równolegle do całej ścieżki głosowej.
- **Status:** done

### S-02: Start sesji — propozycja tematu z możliwością ponownego losowania

- **Outcome:** użytkownik może rozpocząć sesję: widzi wylosowany temat, może odrzucić i wylosować inny.
- **Change ID:** session-topic-proposal
- **PRD refs:** FR-003, FR-004, US-01
- **Prerequisites:** —
- **Parallel with:** S-01, F-01
- **Blockers:** —
- **Unknowns:**
  - ~~Lista predefiniowanych tematów — ile i jakie~~ ROZSTRZYGNIĘTE 2026-07-21 (planowanie S-02): 10 tematów w `src/lib/topics.ts` — 5 kandydatów z PRD Open Q3 + 5 dodatków pokrywających konteksty persony (sprint planning, explaining your project, client update, conference networking, asking for help).
- **Risk:** pierwszy krok ścieżki must-have do gwiazdy przewodniej; celowo odcięty od S-03, żeby decyzja o liście tematów nie blokowała pracy nad torem głosowym.
- **Status:** done

### S-03: Rozmowa głosowa 2–3 min (gwiazda przewodnia)

- **Outcome:** użytkownik może odbyć 2–3 min rozmowę głosową po angielsku na zaakceptowany temat — mówi do mikrofonu, słyszy odpowiedzi głosowo, widzi stan rozmowy (mówi / słucha / przetwarza) i może zakończyć sesję w dowolnym momencie.
- **Change ID:** first-voice-conversation
- **PRD refs:** FR-006, FR-007, FR-008, FR-009, US-01, NFR (sygnał wizualny ≤500 ms), NFR (cross-browser: mikrofon i głos bez konfiguracji), NFR (surowe audio nie pozostaje po przetworzeniu wypowiedzi)
- **Prerequisites:** S-02; bezpieczniki OpenAI skonfigurowane (przedpłacone kredyty, auto-recharge OFF, klucz per-środowisko) i `OPENAI_API_KEY` ustawiony przez `vercel env` — krok ludzki z runbooka deploy-plan
- **Parallel with:** S-01, F-01
- **Blockers:** —
- **Unknowns:**
  - Kompatybilność toru audio (mikrofon/WebRTC) na Safari iOS — historycznie najsłabsza platforma dla głosu w web (NFR cross-browser; sygnał z shape-notes „Forward: tech-stack"). — Owner: user. Block: no.
- **Risk:** największa niewiadoma techniczna produktu, dlatego zaraz po starcie sesji; podlega MERGE-GATE z deploy-plan (rate limit na route mintujący tokeny, TTL ≤600 s, nagłówek safety) — endpoint tokenów bez tych bezpieczników nie wchodzi na `master`.
- **Status:** proposed

### S-04: Raport po sesji

- **Outcome:** użytkownik widzi po zakończeniu sesji raport: pogrupowaną listę błędów (gramatyka / słownictwo / wymowa) z poprawkami i wyjaśnieniami, ocenę CEFR z uzasadnieniem i disclaimerem o niepewności oraz konkretne sugestie do dalszej nauki; sesja krótsza niż 2 minuty dostaje komunikat „za mało materiału do analizy".
- **Change ID:** post-session-report
- **PRD refs:** FR-010, FR-011, FR-012, FR-013, US-01 (kryteria akceptacji), Guardrails (brak wymyślonych błędów; surowe audio usunięte po sesji), NFR (sygnał wizualny podczas analizy)
- **Prerequisites:** S-03
- **Parallel with:** S-01, S-06, F-01
- **Blockers:** —
- **Unknowns:**
  - Jak zmieścić analizę pełnego transkryptu w capie 300 s funkcji (Hobby, standing constraint #2): cap długości wejścia / streaming / route w tle — do rozstrzygnięcia w planie. — Owner: user. Block: no.
- **Risk:** domyka primary Success Criterion; największe ryzyko produktowe to guardrail zaufania (halucynowane „poprawki" niszczą cały mechanizm feedbacku) — pusta lista błędów musi być poprawnym wynikiem.
- **Status:** proposed

### S-05: Archiwum sesji z transkrypcją

- **Outcome:** użytkownik widzi listę swoich poprzednich sesji (czyste archiwum, bez adaptacji) i może otworzyć pełną transkrypcję rozmowy wraz z raportem.
- **Change ID:** session-archive-transcript
- **PRD refs:** FR-014, FR-015, Success Criteria (secondary)
- **Prerequisites:** S-01 (tożsamość użytkownika), S-04 (jest co archiwizować: transkrypcja + raport)
- **Parallel with:** S-06, F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** pierwszy plasterek, który cokolwiek trwale zapisuje — wprowadza pierwszy schemat i pierwszą migrację (RLS od pierwszej tabeli, migracje forward-only per deploy-plan); nice-to-have poza ścieżką must-have — przy presji czasu naturalny kandydat do parkowania.
- **Status:** proposed

### S-06: Adaptacja poziomu w trakcie rozmowy

- **Outcome:** aplikacja wnioskuje poziom angielskiego użytkownika z pierwszej wymiany zdań i dostosowuje do niego tempo oraz słownictwo rozmowy.
- **Change ID:** adaptive-level-tuning
- **PRD refs:** FR-005, Success Criteria (secondary)
- **Prerequisites:** S-03
- **Parallel with:** S-01, S-04, S-05, F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** nice-to-have poza ścieżką must-have (kandydat do parkowania przy presji czasu); celowo bez persistencji poziomu — wnioskowanie żyje tylko w obrębie sesji, zgodnie z Non-Goals v1.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                        |
| ---------- | -------------------------- | ------------------------------------------------------------ | --------------------- | -------------------------------------------- |
| F-01       | pr-preview-pipeline        | Podpięcie Git → auto-deploy + preview per PR                 | no                    | Czeka na bramkę ludzką (`vercel git connect`) |
| S-01       | minimal-oauth-login        | Konto i logowanie OAuth (Google) via Supabase Auth           | yes                   | Run `/10x-plan minimal-oauth-login`          |
| S-02       | session-topic-proposal     | Start sesji: propozycja tematu + ponowne losowanie           | yes                   | Run `/10x-plan session-topic-proposal`       |
| S-03       | first-voice-conversation   | Rozmowa głosowa 2–3 min (STT + odpowiedź głosowa + stan UI)  | no                    | Czeka na S-02 + bezpieczniki OpenAI          |
| S-04       | post-session-report        | Raport po sesji: błędy, CEFR, sugestie                       | no                    | Czeka na S-03                                |
| S-05       | session-archive-transcript | Archiwum sesji z transkrypcją (pierwszy schemat DB)          | no                    | Czeka na S-01 i S-04                         |
| S-06       | adaptive-level-tuning      | Adaptacja tempa i słownictwa do poziomu użytkownika          | no                    | Czeka na S-03                                |

## Open Roadmap Questions

1. **Metoda uwierzytelnienia (email+hasło vs OAuth Google/GitHub vs magic link)** — ROZSTRZYGNIĘTE 2026-07-20 przy planowaniu S-01: OAuth-only, wyłącznie Google (GitHub odrzucony — decyzja produktowa, nie odroczenie). Zapis w `context/changes/minimal-oauth-login/plan-brief.md`.
2. **Czy ograniczyć liczbę skipów tematu na sesję (FR-004)?** — otwarte na v2 (np. limit 3/sesja). Owner: product. By: po pierwszych zewnętrznych testach v1. Block: —.
3. **Lista predefiniowanych tematów (FR-003) — ile i jakie?** — ROZSTRZYGNIĘTE 2026-07-21 przy planowaniu S-02: 10 tematów (5 kandydatów z dyskusji + sprint planning, explaining your project, client progress update, conference networking, asking for help). Finalna lista w `src/lib/topics.ts`; zapis decyzji w `context/changes/session-topic-proposal/plan-brief.md`.
4. **Sugestie dalszej nauki w v1 bazują tylko na bieżącej sesji (FR-013)** — przyjęte jako znana ograniczona wartość; v2 doda kontekst historii błędów. Owner: product. Block: —.
5. **CEFR estymacja z pojedynczej sesji jest szumna (FR-012)** — przyjęte z disclaimerem o niepewności; v2 zbuduje stabilniejszą estymatę na historii. Owner: product. Block: —.
6. **Hard deadline z PRD (2026-07-04) minął — czy obowiązuje nowy termin?** — cel sekwencjonowania to `speed`, ale bez zaktualizowanego terminu nie wiadomo, względem czego ciąć zakres (S-05/S-06 to pierwsi kandydaci do parkowania). Owner: user. Block: roadmap-wide (nieblokująco — kolejność pozostaje ta sama, zmienia się tylko punkt odcięcia).

## Parked

- **Personalizacja między sesjami (historia błędów → dobór tematu)** — Why parked: PRD §Non-Goals; wycięte ze scope-down v1, należy do v2.
- **Adaptacyjne trackowanie postępu długoterminowego (wykres CEFR w czasie)** — Why parked: PRD §Non-Goals; v2 razem z persistencją błędów.
- **Gamifikacja (streaki, punkty, leaderboardy, badge)** — Why parked: PRD §Non-Goals; anty-wzorzec dla persony unikającej presji oceny.
- **Funkcje społecznościowe (dzielenie sesji, znajomi, zespoły)** — Why parked: PRD §Non-Goals; produkt jest single-user.
- **Inne języki docelowe nauki** — Why parked: PRD §Non-Goals; tylko angielski w v1, polski jako język UI.
- **Offline mode** — Why parked: PRD §Non-Goals; techniczna konsekwencja modelu głos + analiza w chmurze.
- **Natywna aplikacja mobilna** — Why parked: PRD §Non-Goals; tylko web w v1 (mobile web OK).
- **Pełna zgodność WCAG-AA** — Why parked: PRD §Non-Goals; certyfikacja a11y poza zakresem v1.
- **Observability ponad logi Vercela (error tracking, metryki)** — Why parked: żaden NFR tego nie wymaga, a cel `speed` trzyma warstwę lekką; do rewizji, gdy pojawią się realni użytkownicy (uwaga operacyjna: logi runtime Hobby żyją 1h).

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)

- **F-01: (foundation) merge do `master` buduje produkcję automatycznie, a każdy PR dostaje preview URL — ścieżka weryfikacji dla wszystkich plasterków.** — Archived 2026-07-20 → `context/archive/2026-07-18-pr-preview-pipeline/`. Lesson: —.
- **S-01: użytkownik może założyć konto i zalogować się (OAuth Google); aplikacja jest za bramką logowania.** — Archived 2026-07-21 → `context/archive/2026-07-20-minimal-oauth-login/`. Lesson: —.
- **S-02: użytkownik może rozpocząć sesję: widzi wylosowany temat, może odrzucić i wylosować inny.** — Archived 2026-07-22 → `context/archive/2026-07-21-session-topic-proposal/`. Lesson: —.
