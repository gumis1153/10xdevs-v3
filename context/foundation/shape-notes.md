---
project: "english-talk"
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-07-04
  after_hours_only: true
created: 2026-05-25
updated: 2026-05-25
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 15
  gray_areas_resolved:
    - topic: "główne bariery mówienia"
      decision: "strach przed oceną + brak feedbacku + brak praktyki dłuższych konwersacji + brak personalizacji (wszystkie 4 naraz)"
    - topic: "dlaczego dotąd nikt tego nie zbudował dobrze"
      decision: "dostawcy nauki języków celują w masowy rynek; nisza programista B1 jest dla nich za wąska"
    - topic: "auth strategy"
      decision: "konto użytkownika (potrzebne do persistencji historii błędów między sesjami); konkretna metoda — email+hasło vs OAuth — do rozstrzygnięcia downstream"
    - topic: "role"
      decision: "płaski model — jedna rola użytkownika; brak admina/kuratora w MVP"
    - topic: "źródło tematu sesji"
      decision: "AI losuje/proponuje temat z predefiniowanej listy 10-20 tematów (np. daily standup, job interview, code review, ordering coffee)"
    - topic: "modalność rozmowy"
      decision: "głos w obie strony — user mówi mikrofonem, AI odpowiada głosem (STT + LLM + TTS)"
    - topic: "zawartość podsumowania sesji"
      decision: "lista konkretnych błędów + ocena poziomu CEFR + sugestie do dalszej nauki (BEZ transkrypcji w MVP, BEZ adaptacji między sesjami)"
    - topic: "scope v1"
      decision: "scope-down: v1 obejmuje JEDNĄ sesję end-to-end; persistencja historii błędów między sesjami i adaptacyjny dobór tematu są wycięte z v1 — przeniesione do v2"
    - topic: "timeline_budget.mvp_weeks"
      decision: "3 tygodnie after-hours po scope-down"
  quality_check_status: accepted
---

# Shape Notes

> Seed idea (verbatim, PL): _Aplikacja do nauki konwersacji w języku angielskim. Ma pomagć uzytkownikom przełamać barierę językową mówienia w obcym języku (angielskim). Uzytkownik ma mozliwość mówienia a AI po przeanalizowaniu co powiedział user odpowiada(mówi) i kontynuuje rozmowe i notuje błedy. Kazda sesja trwa pare minut i jest na inny temat. Po sesji Ai podsumowuje poziom angielskiego wskazuje błędy i planuje następną lekcję skupiając się na szlifowaniu błędów._

## Vision & Problem Statement

Polscy programiści na poziomie A2–B1–B2 mają silną barierę mówioną w angielskim: ich kompetencja pisemna jest wystarczająca do codziennej pracy, ale w momencie kiedy trzeba odezwać się głośno — call z zespołem, rozmowa rekrutacyjna, rozmowa z klientem, konferencja, networking — wpadają w paraliż. Główny mechanizm bólu to strach przed oceną i przed popełnieniem błędu, wzmacniany przez brak bezpiecznego środowiska do ćwiczenia. Obecne narzędzia nie zamykają tej luki: Duolingo pracuje na pojedynczych zdaniach, a generyczne LLM-y (ChatGPT, Gemini) nie mają dedykowanego trybu nauki płynnego mówienia ani pamięci o powtarzających się błędach użytkownika.

Insight stojący za tym produktem: duzi dostawcy nauki języków (Duolingo, Babbel, itd.) optymalizują pod masowy rynek konsumencki, a nisza "programista z konkretnym poziomem i konkretnym kontekstem zawodowym" jest dla nich za wąska, żeby zainwestować w nią produktowo. Sam stack technologiczny (realtime speech-to-text + LLM z pamięcią błędów) jest dziś dostępny w cenie, która pozwala zbudować dedykowane narzędzie pod taką niszę.

## User & Persona

**Primary persona:** Polski programista, poziom A2–B2 angielskiego (pisemnie radzi sobie OK), pracujący lub aspirujący do pracy w kontekście, gdzie angielski mówiony jest realnym wymaganiem (zespół międzynarodowy, klient zagraniczny, rekrutacja w zagranicznej firmie). Moment, w którym sięga po ten produkt: ma świadomość, że musi rozmawiać po angielsku, ale unika sytuacji mówionych z powodu strachu przed oceną. Szuka bezpiecznego środowiska, w którym może popełniać błędy bez wstydu i dostawać konkretny feedback, jakie błędy popełnia i jak je poprawić.

## Access Control

Każdy użytkownik korzysta z aplikacji poprzez własne konto. Konto jest wymagane, ponieważ produkt opiera się na **persistencji historii błędów między sesjami** — bez tożsamości użytkownika mechanizm "AI uczy się Twoich błędów i planuje następną lekcję pod nie" nie ma jak działać.

Model ról jest płaski: jedna rola — _użytkownik_. Brak roli admina, brak kuratora, brak nauczyciela. Każdy zalogowany użytkownik widzi to samo.

Konkretna metoda uwierzytelnienia (email + hasło, OAuth Google/GitHub, magic link) NIE jest decyzją PRD-poziomu — to wybór downstream przy selekcji stacku. PRD zobowiązuje się tylko do faktu, że konto istnieje.

<!-- Phases 3–6 below will be filled in as we go. Structure follows the 10 greenfield PRD sections from references/prd-schema.md. -->

## Success Criteria

### Primary

- Użytkownik kończy 2–3 minutową konwersację głosową po angielsku z AI (głos w obie strony) bez przerywania sesji i widzi po jej zakończeniu podsumowanie zawierające: (1) listę konkretnych błędów popełnionych w sesji, (2) ocenę poziomu angielskiego CEFR (A2/B1/B2), (3) sugestie do dalszej nauki.

### Secondary

- Użytkownik może na początku sesji wybrać swój deklarowany poziom (A2/B1/B2), aby AI dostosowało tempo i słownictwo.
- Po sesji dostępna jest transkrypcja całej rozmowy do późniejszego przeglądu.
- Użytkownik ma dostęp do archiwalnej listy swoich poprzednich sesji (bez adaptacji — czyste archiwum).

### Guardrails

- Surowe nagranie głosu użytkownika nie jest przechowywane trwale po przetworzeniu sesji. Transkrypcja może zostać; audio — nie.
- AI nie wskazuje jako błędu czegoś, co użytkownik powiedział poprawnie. Halucynowane „poprawki" niszczą zaufanie do całego mechanizmu feedbacku.

### Scope-down decision (zarejestrowane)

v1 obejmuje jedną sesję end-to-end. Persistencja błędów między sesjami i adaptacyjny dobór tematu pod historię błędów są **wyciętymi z v1** i przeniesionymi do v2 — patrz `## Non-Goals` oraz `## Forward: technical-roadmap`.

## User Stories

### US-01: Użytkownik przeprowadza pełną sesję konwersacyjną od początku do podsumowania

- **Given** zalogowany użytkownik z działającym mikrofonem w przeglądarce
- **When** użytkownik klika "rozpocznij nową sesję", akceptuje (lub odrzuca i ponownie losuje) proponowany temat, opcjonalnie wybiera deklarowany poziom (A2/B1/B2) i rozpoczyna rozmowę
- **Then** użytkownik prowadzi 2–3 minutową konwersację głosową z AI (mówi mikrofonem, słyszy odpowiedzi AI głosowo), kończy sesję przyciskiem, i widzi ekran podsumowania zawierający: konkretne błędy z transkrypcji z poprawkami, ocenę poziomu CEFR + krótki komentarz, oraz sugestie do dalszej nauki

#### Acceptance Criteria

- Konwersacja trwa minimum 2 minuty zanim podsumowanie ma sens (krótsze sesje pokazują komunikat „za mało materiału do analizy" zamiast wymyślonej oceny).
- Lista błędów jest pusta, jeśli AI nie zidentyfikuje żadnych błędów — nie wymyśla błędów dla efektu.
- Użytkownik może zakończyć sesję w dowolnym momencie; podsumowanie wykonuje się na materiale, który zdążył się nazbierać.
- Po zamknięciu ekranu podsumowania surowe audio z sesji jest usunięte; pozostaje (opcjonalnie, nice-to-have) transkrypcja.

## Functional Requirements

### Auth & Profile

- FR-001: Użytkownik może założyć konto. Priority: must-have
  > Socrates: Rozważony counter-argument: "może wymusić OAuth-only (Google/GitHub), pominąć email+hasło — mniej kodu (brak password recovery, email verification)". Rezolucja: zachowano FR-005 product-level, ale zarejestrowano preferencję OAuth-only w `## Open Questions` jako sygnał dla downstream stack selection.
- FR-002: Użytkownik może zalogować się do istniejącego konta. Priority: must-have
  > Socrates: Rozważony counter-argument: "może magic link zamiast hasła". Rezolucja: stoi jak napisane; konkretna metoda do rozstrzygnięcia downstream.

### Wybór sesji

- FR-003: Użytkownik widzi propozycję tematu sesji wylosowaną z predefiniowanej listy tematów. Priority: must-have
  > Socrates: Rozważone counter-argumenty: "user sam wybiera z listy" lub "free-form input". Rezolucja: stoi jak napisane — propozycja AI redukuje decision fatigue u użytkownika, który już ma paraliż przed mówieniem; mniej decyzji = wyższa szansa rozpoczęcia sesji.
- FR-004: Użytkownik może odrzucić proponowany temat i poprosić o inny. Priority: must-have
  > Socrates: Rozważony counter-argument: "może w ogóle nie powinien móc — akceptacja AI to esencja produktu; jeśli user ciągle skipuje, unika trudnych tematów". Rezolucja: FR stoi jak napisane, ale ten counter-argument jest realny — przeniesiony do Open Questions jako kandydat do dyscypliny w v2 (np. limit skipów na sesję).
- FR-005: AI wnioskuje poziom angielskiego użytkownika z pierwszej wymiany zdań i dostosowuje do niego tempo oraz słownictwo. Priority: nice-to-have
  > Socrates: Rozważony counter-argument: "pytanie o poziom upfront primuje użytkownika — czuje się oceniany od startu, wybiera A2 jak jest B1 żeby uciec od presji". Rezolucja: **FR zmodyfikowane** — z "user wybiera poziom" na "AI wnioskuje poziom". Lepiej spasowane z personą (paraliz przed oceną).

### Konwersacja (core)

- FR-006: Użytkownik może mówić do aplikacji przez mikrofon; aplikacja transkrybuje jego wypowiedź w czasie zbliżonym do rzeczywistego. Priority: must-have
  > Socrates: Rozważony counter-argument: "może v1 tekstem — tańsze do zbudowania". Rezolucja: stoi jak napisane; bez głosu produkt nie rozwiązuje zgłoszonego problemu (bariera mówienia).
- FR-007: AI odpowiada na wypowiedź użytkownika głosowo, prowadząc konwersację na wybrany temat w języku angielskim. Priority: must-have
  > Socrates: Rozważony counter-argument: "może tylko tekstem — tańsze (brak TTS)". Rezolucja: stoi jak napisane; głos w obie strony = listening practice + tempo rozmowy. To jest produkt.
- FR-008: Użytkownik widzi w UI stan rozmowy: kiedy AI mówi, kiedy słucha użytkownika, kiedy przetwarza. Priority: must-have
  > Socrates: Rozważony counter-argument: "można pominąć — naturalne turn-taking jak w telefonie, bez UI state". Rezolucja: stoi jak napisane; w przeglądarce user się gubi "czy AI słucha mnie czy się zacina" bez sygnału wizualnego.
- FR-009: Użytkownik może zakończyć sesję w dowolnym momencie. Priority: must-have
  > Socrates: Rozważony counter-argument: "może minimum 3 minuty — inaczej brak danych do analizy". Rezolucja: stoi jak napisane; user decyduje, app dostosowuje raport (krótka sesja → komunikat "za mało materiału").

### Podsumowanie po sesji

- FR-010: Po zakończeniu sesji aplikacja analizuje całość przebiegu rozmowy i wykrywa konkretne błędy językowe użytkownika (gramatyczne, leksykalne, składniowe). Priority: must-have
  > Socrates: Rozważone counter-argumenty: "może NA ŻYWO zamiast post-hoc" / "LLM może hallucynować błędy". Rezolucja: stoi jak napisane; post-hoc nie przerywa flow rozmowy (krytyczne dla user z paraliz). Halucynacja błędów jest pokryta przez Guardrail.
- FR-011: Aplikacja prezentuje użytkownikowi pogrupowaną listę wykrytych błędów (gramatyka / słownictwo / wymowa) wraz z poprawkami i krótkim wyjaśnieniem. Priority: must-have
  > Socrates: Rozważone counter-argumenty: "ogranicz do TOP-5" / "kategoryzuj zanim pokażesz". Rezolucja: **FR zmodyfikowane** — dodano wymaganie kategoryzacji (gramatyka / słownictwo / wymowa). Mocniejsza struktura listy = mniej overwhelm.
- FR-012: Aplikacja przypisuje całej sesji ocenę poziomu CEFR (A1/A2/B1/B2/C1) wraz z krótkim uzasadnieniem oraz disclaimerem o niepewności estymacji z pojedynczej sesji. Priority: must-have
  > Socrates: Rozważony counter-argument: "CEFR per pojedyncza sesja jest szumny; user dostanie A2 jednego dnia, B1 nast." Rezolucja: stoi jak napisane, ale z dodatkiem disclaimera o niepewności estymacji — wciąż lepsze niż brak oceny.
- FR-013: Aplikacja prezentuje konkretne sugestie do dalszej nauki w oparciu o błędy z tej sesji. Priority: must-have
  > Socrates: Rozważony counter-argument: "bez persistencji błędów między sesjami sugestie będą generyczne". Rezolucja: stoi jak napisane; w v1 sugestie bazują tylko na bieżącej sesji (znana ograniczona wartość); rozszerzenie pod historię błędów jest częścią v2 i zarejestrowane w `## Forward: technical-roadmap`.
- FR-014: Użytkownik widzi pełną transkrypcję rozmowy po sesji. Priority: nice-to-have
  > Socrates: Rozważone counter-argumenty: "może must-have, nie nice-to-have — kontekst do błędów" / "privacy concern". Rezolucja: stoi jak napisane, nice-to-have; lista błędów z poprawkami zawiera już cytaty wypowiedzi, więc transkrypcja jest dodatkowym komfortem.
- FR-015: Użytkownik ma dostęp do archiwum swoich poprzednich sesji (czyste archiwum, bez adaptacji). Priority: nice-to-have
  > Socrates: Rozważony counter-argument: "bez adaptacji archiwum to dead weight". Rezolucja: stoi jak napisane, nice-to-have; archiwum działa jako motywator (widoczny progres) nawet bez adaptacji.

## Business Logic

Aplikacja prowadzi z użytkownikiem krótką rozmowę głosową po angielsku w bezpiecznym środowisku, w którym sam akt mówienia — powtarzany sesja po sesji — buduje płynność i rozwiązuje barierę językową; analiza błędów po każdej sesji ukierunkowuje praktykę, ale to praktyka mówienia jest rdzeniem.

Wejścia, które reguła konsumuje (jako wejścia user-facing): (1) wypowiedzi głosowe użytkownika w trakcie sesji oraz (2) temat sesji (proponowany przez aplikację, akceptowalny przez użytkownika). Wyjścia, które użytkownik dostaje: (1) odpowiedź głosowa aplikacji w trakcie rozmowy, dopasowana do bieżącego poziomu wypowiedzi użytkownika, oraz (2) post-sesyjny raport, na który składa się pogrupowana lista wykrytych błędów wraz z poprawkami, oszacowanie poziomu CEFR z disclaimerem o niepewności oraz konkretne sugestie do dalszej praktyki.

Użytkownik napotyka tę regułę w głównym flow produktu (US-01): wchodzi w sesję, mówi swobodnie na zadany temat, słyszy odpowiedzi aplikacji, a po zakończeniu dostaje raport. Wartość kumuluje się nie przez pojedynczą sesję, ale przez powtarzaną praktykę — wielokrotne wchodzenie w to samo środowisko buduje rutynę mówienia, której obecnym narzędziom (Duolingo, ChatGPT generyczny) brakuje.

## Non-Functional Requirements

- Użytkownik widzi ciągły sygnał wizualny "coś się dzieje" w każdej fazie operacji trwającej dłużej niż ~500 ms (start sesji, oczekiwanie na odpowiedź AI, analiza po-sesyjna). Brak takiego sygnału prowadzi do zachowania "user myśli, że aplikacja się zawiesiła, klika reload".
- Aplikacja jest sprawna na dwóch ostatnich major wersjach Chrome, Safari, Firefox i Edge na desktopie oraz Safari iOS i Chrome Android. "Sprawna" obejmuje obsługę mikrofonu i odtwarzanie głosu aplikacji bez specjalnej konfiguracji od użytkownika.
- Surowe nagranie głosu użytkownika nie pozostaje w pamięci aplikacji po zakończeniu przetwarzania bieżącej wypowiedzi w sesji (poziom NFR / privacy — wzmocnienie Guardraila).

## Non-Goals

- **Brak personalizacji między sesjami** — historia błędów nie wpływa na dobór tematu kolejnej sesji. Wycięte ze scope-down v1; należy do v2.
- **Brak adaptacyjnego trackowania postępu długoterminowego** — ocena CEFR nie buduje wykresu w czasie; każda sesja to osobny pomiar. Należy do v2 razem z persistencją błędów.
- **Brak gamifikacji** — bez streaków, punktów, leaderboardów, badgeów. Anti-pattern dla persony, która unika presji oceny.
- **Brak funkcji społecznościowych** — brak dzielenia się sesjami, friend list, zespołów. Produkt jest single-user.
- **Brak innych języków docelowych nauki** — tylko angielski jako target. Polski jest językiem UI dla v1; rozszerzenie na inne pary językowe to v2+.
- **Brak offline mode** — aplikacja wymaga internetu. Techniczna konsekwencja użycia chmurowego LLM-a, STT i TTS.
- **Brak natywnej aplikacji mobilnej** — tylko web w v1 (mobile web jest OK). Natywne mobile = osobny projekt.
- **Brak pełnej zgodności WCAG-AA** — nie celujemy w certyfikację a11y w v1. Produkt działa dla użytkownika wzrokowego; pełna obsługa audio-first dla niedowidzących należy do v2+.

## Open Questions

1. **Metoda uwierzytelnienia (email+hasło vs OAuth Google/GitHub vs magic link)** — preferencja zgłoszona dla OAuth-only podczas Socrates round (FR-001), ale decyzja właściwa należy do downstream tech-stack selection. Owner: tech-stack-selector. By: przed implementacją.
2. **Czy ograniczyć liczbę skipów tematu na sesję (FR-004)?** — counter-argument Socratesa wskazał, że niekontrolowane skipowanie pozwala user unikać trudnych tematów. Otwarte na v2 (np. limit 3/sesja). Owner: product. By: po pierwszych zewnętrznych testach v1.
3. **Lista predefiniowanych tematów (FR-003) — ile i jakie?** — w v1 potrzebna konkretna lista. Pomysły z dyskusji: "daily standup", "job interview", "code review discussion", "ordering coffee", "explaining a bug to a colleague". Owner: user. By: przed implementacją.
4. **Sugestie dalszej nauki w v1 będą bazować tylko na bieżącej sesji** (FR-013) — przyjęte jako znana ograniczona wartość; v2 doda kontekst historii błędów. Owner: product. By: po pierwszej sesji feedbackowej z użytkownikiem.
5. **CEFR estymacja z pojedynczej sesji jest szumna** (FR-012) — przyjęte z disclaimerem o niepewności; v2 z historią sesji zbuduje stabilniejszą estymatę. Owner: product. By: v2.

## Forward: tech-stack

Notatki dla downstream `/10x-tech-stack-selector` — NIE są częścią PRD-schematu:

- Stack technologiczny musi obsługiwać realtime voice in/out: STT + LLM + TTS. Kandydaci wymienieni przez użytkownika lub naturalnie pasujący do problemu: OpenAI realtime voice API, Google Speech-to-Text + Gemini + Google TTS, Whisper + GPT/Claude + ElevenLabs.
- Preferencja użytkownika z Socratesa FR-001: OAuth-only (Google/GitHub) zamiast email+hasło, żeby zmniejszyć ilość kodu w v1.
- NFR cross-browser: trzeba sprawdzić obsługę Web Audio API / MediaRecorder API / WebRTC w Safari iOS — historycznie najsłabsza platforma dla głosu w web.
- Persistencja: dla v1 musi być prosta (auth + sesje + transkrypcja). Bez heavyweight schematu — schemat błędów ma sens dopiero w v2 razem z persistencją historii.

## Quality cross-check

Status: **accepted** (2026-05-25).

- Access Control: present (konto wymagane, płaski model ról).
- Business Logic: present (jednozdaniowa reguła: rozmowa głosowa jako rdzeń, analiza błędów jako narzędzie).
- Project artifacts: present (`shape-notes.md` z pełnym frontmatter checkpointem).
- Timeline-cost ack: present (mvp_weeks: 3 po scope-down — w ramach progu ≤ 3 tygodnie after-hours; nie wymaga osobnego acknowledgment).
- Non-Goals: present (8 wpisów, mix funkcjonalnych i jakościowych).

Brak gapów do raportowania w `## Open Questions` z tytułu cross-checku.

## Forward: technical-roadmap

Notatki dla downstream planowania — NIE są częścią PRD-schematu:

**v2 (po walidacji v1):**

- Persistencja błędów między sesjami (FR-013, FR-015 stają się must-have, bazują na historii).
- Adaptacyjny dobór tematu sesji w oparciu o profil błędów użytkownika.
- Wykres postępu CEFR w czasie + stabilniejsza estymata na bazie wielu sesji.

**v3+ (potencjalne kierunki):**

- Rozszerzenie na inne pary językowe (FR niejęzykowe pozostają, treść contentu rośnie).
- Natywna aplikacja mobilna (lepsza obsługa mikrofonu, push notifications "czas na sesję").
- Limit skipów tematu (Open Question #2).
- Gamifikacja, jeśli user-research pokaże, że pomaga retencji (na ten moment hipoteza: zaszkodzi personie).
