---
project: "english-talk"
version: 1
status: draft
created: 2026-05-26
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
---

# english-talk — Product Requirements Document

## Vision & Problem Statement

Polscy programiści na poziomie A2–B1–B2 mają silną barierę mówioną w angielskim: ich kompetencja pisemna jest wystarczająca do codziennej pracy, ale w momencie kiedy trzeba odezwać się głośno — call z zespołem, rozmowa rekrutacyjna, rozmowa z klientem, konferencja, networking — wpadają w paraliż. Główny mechanizm bólu to strach przed oceną i przed popełnieniem błędu, wzmacniany przez brak bezpiecznego środowiska do ćwiczenia. Obecne narzędzia nie zamykają tej luki: Duolingo pracuje na pojedynczych zdaniach, a generyczne narzędzia konwersacyjne nie mają dedykowanego trybu nauki płynnego mówienia ani pamięci o powtarzających się błędach użytkownika.

Insight stojący za tym produktem: duzi dostawcy nauki języków (Duolingo, Babbel, itd.) optymalizują pod masowy rynek konsumencki, a nisza "programista z konkretnym poziomem i konkretnym kontekstem zawodowym" jest dla nich za wąska, żeby zainwestować w nią produktowo. Sam fakt regularnej, swobodnej praktyki mówienia w bezpiecznym środowisku jest dziś osiągalny w cenie, która pozwala zbudować dedykowane narzędzie pod taką niszę.

## User & Persona

**Primary persona:** Polski programista, poziom A2–B2 angielskiego (pisemnie radzi sobie OK), pracujący lub aspirujący do pracy w kontekście, gdzie angielski mówiony jest realnym wymaganiem (zespół międzynarodowy, klient zagraniczny, rekrutacja w zagranicznej firmie). Moment, w którym sięga po ten produkt: ma świadomość, że musi rozmawiać po angielsku, ale unika sytuacji mówionych z powodu strachu przed oceną. Szuka bezpiecznego środowiska, w którym może popełniać błędy bez wstydu i dostawać konkretny feedback, jakie błędy popełnia i jak je poprawić.

## Success Criteria

### Primary

- Użytkownik kończy 2–3 minutową konwersację głosową po angielsku z aplikacją (głos w obie strony) bez przerywania sesji i widzi po jej zakończeniu podsumowanie zawierające: (1) listę konkretnych błędów popełnionych w sesji, (2) ocenę poziomu angielskiego CEFR (A2/B1/B2), (3) sugestie do dalszej nauki.

### Secondary

- Aplikacja wnioskuje poziom użytkownika z pierwszej wymiany zdań i dostosowuje do niego tempo oraz słownictwo.
- Po sesji dostępna jest transkrypcja całej rozmowy do późniejszego przeglądu.
- Użytkownik ma dostęp do archiwalnej listy swoich poprzednich sesji (bez adaptacji — czyste archiwum).

### Guardrails

- Surowe nagranie głosu użytkownika nie jest przechowywane trwale po przetworzeniu sesji. Transkrypcja może zostać; surowe audio — nie.
- Aplikacja nie wskazuje jako błędu czegoś, co użytkownik powiedział poprawnie. Halucynowane „poprawki" niszczą zaufanie do całego mechanizmu feedbacku.

## User Stories

### US-01: Użytkownik przeprowadza pełną sesję konwersacyjną od początku do podsumowania

- **Given** zalogowany użytkownik z działającym mikrofonem w przeglądarce
- **When** użytkownik klika "rozpocznij nową sesję", akceptuje (lub odrzuca i ponownie losuje) proponowany temat i rozpoczyna rozmowę
- **Then** użytkownik prowadzi 2–3 minutową konwersację głosową z aplikacją (mówi mikrofonem, słyszy odpowiedzi głosowo), kończy sesję przyciskiem, i widzi ekran podsumowania zawierający: konkretne błędy z transkrypcji z poprawkami, ocenę poziomu CEFR + krótki komentarz, oraz sugestie do dalszej nauki

#### Acceptance Criteria

- Konwersacja trwa minimum 2 minuty zanim podsumowanie ma sens (krótsze sesje pokazują komunikat „za mało materiału do analizy" zamiast wymyślonej oceny).
- Lista błędów jest pusta, jeśli aplikacja nie zidentyfikuje żadnych błędów — błędy nie są wymyślane dla efektu.
- Użytkownik może zakończyć sesję w dowolnym momencie; podsumowanie wykonuje się na materiale, który zdążył się nazbierać.
- Po zamknięciu ekranu podsumowania surowe audio z sesji jest usunięte; pozostaje (opcjonalnie, nice-to-have) transkrypcja.

## Functional Requirements

### Auth & Profile

- FR-001: Użytkownik może założyć konto. Priority: must-have
  > Socrates: Rozważony counter-argument: "może wymusić OAuth-only (Google/GitHub), pominąć email+hasło — mniej kodu (brak password recovery, email verification)". Rezolucja: zachowano FR product-level, ale zarejestrowano preferencję OAuth-only w `## Open Questions` jako sygnał dla downstream stack selection.
- FR-002: Użytkownik może zalogować się do istniejącego konta. Priority: must-have
  > Socrates: Rozważony counter-argument: "może magic link zamiast hasła". Rezolucja: stoi jak napisane; konkretna metoda do rozstrzygnięcia downstream.

### Wybór sesji

- FR-003: Użytkownik widzi propozycję tematu sesji wylosowaną z predefiniowanej listy tematów. Priority: must-have
  > Socrates: Rozważone counter-argumenty: "user sam wybiera z listy" lub "free-form input". Rezolucja: stoi jak napisane — propozycja redukuje decision fatigue u użytkownika, który już ma paraliż przed mówieniem; mniej decyzji = wyższa szansa rozpoczęcia sesji.
- FR-004: Użytkownik może odrzucić proponowany temat i poprosić o inny. Priority: must-have
  > Socrates: Rozważony counter-argument: "może w ogóle nie powinien móc — akceptacja jest esencją produktu; jeśli user ciągle skipuje, unika trudnych tematów". Rezolucja: FR stoi jak napisane, ale ten counter-argument jest realny — przeniesiony do Open Questions jako kandydat do dyscypliny w v2 (np. limit skipów na sesję).
- FR-005: Aplikacja wnioskuje poziom angielskiego użytkownika z pierwszej wymiany zdań i dostosowuje do niego tempo oraz słownictwo. Priority: nice-to-have
  > Socrates: Rozważony counter-argument: "pytanie o poziom upfront primuje użytkownika — czuje się oceniany od startu, wybiera A2 jak jest B1 żeby uciec od presji". Rezolucja: **FR zmodyfikowane** — z "user wybiera poziom" na "aplikacja wnioskuje poziom". Lepiej spasowane z personą (paraliż przed oceną).

### Konwersacja (core)

- FR-006: Użytkownik może mówić do aplikacji przez mikrofon; aplikacja transkrybuje jego wypowiedź w czasie zbliżonym do rzeczywistego. Priority: must-have
  > Socrates: Rozważony counter-argument: "może v1 tekstem — tańsze do zbudowania". Rezolucja: stoi jak napisane; bez głosu produkt nie rozwiązuje zgłoszonego problemu (bariera mówienia).
- FR-007: Aplikacja odpowiada na wypowiedź użytkownika głosowo, prowadząc konwersację na wybrany temat w języku angielskim. Priority: must-have
  > Socrates: Rozważony counter-argument: "może tylko tekstem — tańsze". Rezolucja: stoi jak napisane; głos w obie strony = listening practice + tempo rozmowy. To jest produkt.
- FR-008: Użytkownik widzi w UI stan rozmowy: kiedy aplikacja mówi, kiedy słucha użytkownika, kiedy przetwarza. Priority: must-have
  > Socrates: Rozważony counter-argument: "można pominąć — naturalne turn-taking jak w telefonie, bez UI state". Rezolucja: stoi jak napisane; w przeglądarce user się gubi "czy aplikacja słucha mnie czy się zacina" bez sygnału wizualnego.
- FR-009: Użytkownik może zakończyć sesję w dowolnym momencie. Priority: must-have
  > Socrates: Rozważony counter-argument: "może minimum czas trwania — inaczej brak danych do analizy". Rezolucja: stoi jak napisane; user decyduje, aplikacja dostosowuje raport (krótka sesja → komunikat "za mało materiału").

### Podsumowanie po sesji

- FR-010: Po zakończeniu sesji aplikacja analizuje całość przebiegu rozmowy i wykrywa konkretne błędy językowe użytkownika (gramatyczne, leksykalne, składniowe). Priority: must-have
  > Socrates: Rozważone counter-argumenty: "może NA ŻYWO zamiast post-hoc" / "analiza może wskazywać błędy, których nie ma". Rezolucja: stoi jak napisane; post-hoc nie przerywa flow rozmowy (krytyczne dla user z paraliżem). Wskazywanie nieistniejących błędów jest pokryte przez Guardrail.
- FR-011: Aplikacja prezentuje użytkownikowi pogrupowaną listę wykrytych błędów (gramatyka / słownictwo / wymowa) wraz z poprawkami i krótkim wyjaśnieniem. Priority: must-have
  > Socrates: Rozważone counter-argumenty: "ogranicz do TOP-5" / "kategoryzuj zanim pokażesz". Rezolucja: **FR zmodyfikowane** — dodano wymaganie kategoryzacji (gramatyka / słownictwo / wymowa). Mocniejsza struktura listy = mniej overwhelm.
- FR-012: Aplikacja przypisuje całej sesji ocenę poziomu CEFR (A1/A2/B1/B2/C1) wraz z krótkim uzasadnieniem oraz disclaimerem o niepewności estymacji z pojedynczej sesji. Priority: must-have
  > Socrates: Rozważony counter-argument: "CEFR per pojedyncza sesja jest szumny; user dostanie A2 jednego dnia, B1 następnego". Rezolucja: stoi jak napisane, ale z dodatkiem disclaimera o niepewności estymacji — wciąż lepsze niż brak oceny.
- FR-013: Aplikacja prezentuje konkretne sugestie do dalszej nauki w oparciu o błędy z tej sesji. Priority: must-have
  > Socrates: Rozważony counter-argument: "bez persistencji błędów między sesjami sugestie będą generyczne". Rezolucja: stoi jak napisane; w v1 sugestie bazują tylko na bieżącej sesji (znana ograniczona wartość); rozszerzenie pod historię błędów jest częścią v2.
- FR-014: Użytkownik widzi pełną transkrypcję rozmowy po sesji. Priority: nice-to-have
  > Socrates: Rozważone counter-argumenty: "może must-have, nie nice-to-have — kontekst do błędów" / "privacy concern". Rezolucja: stoi jak napisane, nice-to-have; lista błędów z poprawkami zawiera już cytaty wypowiedzi, więc transkrypcja jest dodatkowym komfortem.
- FR-015: Użytkownik ma dostęp do archiwum swoich poprzednich sesji (czyste archiwum, bez adaptacji). Priority: nice-to-have
  > Socrates: Rozważony counter-argument: "bez adaptacji archiwum to dead weight". Rezolucja: stoi jak napisane, nice-to-have; archiwum działa jako motywator (widoczny progres) nawet bez adaptacji.

## Non-Functional Requirements

- Użytkownik widzi ciągły sygnał wizualny "coś się dzieje" w każdej fazie operacji trwającej dłużej niż ~500 ms (start sesji, oczekiwanie na odpowiedź aplikacji, analiza po-sesyjna). Brak takiego sygnału prowadzi do zachowania "user myśli, że aplikacja się zawiesiła, próbuje ponownie załadować stronę".
- Aplikacja jest sprawna na dwóch ostatnich major wersjach czterech mainstreamowych przeglądarek desktopowych oraz na mainstreamowych przeglądarkach mobilnych. "Sprawna" obejmuje obsługę mikrofonu i odtwarzanie głosu aplikacji bez specjalnej konfiguracji od użytkownika.
- Surowe nagranie głosu użytkownika nie pozostaje dostępne po zakończeniu przetwarzania bieżącej wypowiedzi w sesji (wzmocnienie Guardraila prywatności).

## Business Logic

Aplikacja prowadzi z użytkownikiem krótką rozmowę głosową po angielsku w bezpiecznym środowisku, w którym sam akt mówienia — powtarzany sesja po sesji — buduje płynność i rozwiązuje barierę językową; analiza błędów po każdej sesji ukierunkowuje praktykę, ale to praktyka mówienia jest rdzeniem.

Wejścia, które reguła konsumuje (jako wejścia user-facing): (1) wypowiedzi głosowe użytkownika w trakcie sesji oraz (2) temat sesji (proponowany przez aplikację, akceptowalny przez użytkownika). Wyjścia, które użytkownik dostaje: (1) odpowiedź głosowa aplikacji w trakcie rozmowy, dopasowana do bieżącego poziomu wypowiedzi użytkownika, oraz (2) post-sesyjny raport, na który składa się pogrupowana lista wykrytych błędów wraz z poprawkami, oszacowanie poziomu CEFR z disclaimerem o niepewności oraz konkretne sugestie do dalszej praktyki.

Użytkownik napotyka tę regułę w głównym flow produktu (US-01): wchodzi w sesję, mówi swobodnie na zadany temat, słyszy odpowiedzi aplikacji, a po zakończeniu dostaje raport. Wartość kumuluje się nie przez pojedynczą sesję, ale przez powtarzaną praktykę — wielokrotne wchodzenie w to samo środowisko buduje rutynę mówienia, której obecnym narzędziom (Duolingo, generyczne narzędzia konwersacyjne) brakuje.

## Access Control

Każdy użytkownik korzysta z aplikacji poprzez własne konto. Konto jest wymagane, ponieważ produkt opiera się na persistencji historii błędów między sesjami — bez tożsamości użytkownika mechanizm "aplikacja uczy się Twoich błędów i planuje następną lekcję pod nie" nie ma jak działać.

Model ról jest płaski: jedna rola — _użytkownik_. Brak roli admina, brak kuratora, brak nauczyciela. Każdy zalogowany użytkownik widzi to samo.

Konkretna metoda uwierzytelnienia jest decyzją downstream (patrz `## Open Questions`, pytanie 1); PRD zobowiązuje się tylko do faktu, że konto istnieje.

## Non-Goals

- **Brak personalizacji między sesjami** — historia błędów nie wpływa na dobór tematu kolejnej sesji. Wycięte ze scope-down v1; należy do v2.
- **Brak adaptacyjnego trackowania postępu długoterminowego** — ocena CEFR nie buduje wykresu w czasie; każda sesja to osobny pomiar. Należy do v2 razem z persistencją błędów.
- **Brak gamifikacji** — bez streaków, punktów, leaderboardów, badgeów. Anti-pattern dla persony, która unika presji oceny.
- **Brak funkcji społecznościowych** — brak dzielenia się sesjami, friend list, zespołów. Produkt jest single-user.
- **Brak innych języków docelowych nauki** — tylko angielski jako target. Polski jest językiem UI dla v1; rozszerzenie na inne pary językowe to v2+.
- **Brak offline mode** — aplikacja wymaga internetu. Techniczna konsekwencja modelu działania (głos + analiza w chmurze).
- **Brak natywnej aplikacji mobilnej** — tylko web w v1 (mobile web jest OK). Natywne mobile = osobny projekt.
- **Brak pełnej zgodności WCAG-AA** — nie celujemy w certyfikację a11y w v1. Produkt działa dla użytkownika wzrokowego; pełna obsługa audio-first dla niedowidzących należy do v2+.

## Open Questions

1. **Metoda uwierzytelnienia (email+hasło vs OAuth Google/GitHub vs magic link)** — preferencja zgłoszona dla OAuth-only podczas Socrates round (FR-001), ale decyzja właściwa należy do downstream tech-stack selection. Owner: tech-stack-selector. By: przed implementacją. **Rozstrzygnięte 2026-07-20: OAuth-only, wyłącznie Google (GitHub odrzucony — decyzja produktowa przy planowaniu S-01).**
2. **Czy ograniczyć liczbę skipów tematu na sesję (FR-004)?** — counter-argument Socratesa wskazał, że niekontrolowane skipowanie pozwala user unikać trudnych tematów. Otwarte na v2 (np. limit 3/sesja). Owner: product. By: po pierwszych zewnętrznych testach v1.
3. **Lista predefiniowanych tematów (FR-003) — ile i jakie?** — w v1 potrzebna konkretna lista. Pomysły z dyskusji: "daily standup", "job interview", "code review discussion", "ordering coffee", "explaining a bug to a colleague". Owner: user. By: przed implementacją. **Rozstrzygnięte 2026-07-21 (planowanie S-02): 10 tematów — 5 kandydatów z dyskusji + sprint planning, explaining your project, client progress update, conference networking, asking for help. Finalna lista (tytuł + opis scenariusza po angielsku) żyje w `src/lib/topics.ts`.**
4. **Sugestie dalszej nauki w v1 będą bazować tylko na bieżącej sesji (FR-013)** — przyjęte jako znana ograniczona wartość; v2 doda kontekst historii błędów. Owner: product. By: po pierwszej sesji feedbackowej z użytkownikiem.
5. **CEFR estymacja z pojedynczej sesji jest szumna (FR-012)** — przyjęte z disclaimerem o niepewności; v2 z historią sesji zbuduje stabilniejszą estymatę. Owner: product. By: v2.
