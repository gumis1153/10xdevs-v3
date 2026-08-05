# Vercel Build Test Gate Implementation Plan

## Overview

Zamknąć bramkę testów jednostkowych/komponentowych w buildzie Vercela: `npm run test:run`
uruchamia się przed `next build`, więc czerwony suite kończy build błędem, ustawia
required status check `Vercel` na FAILURE i blokuje merge do `master` — a także blokuje
deploy produkcyjny. Dziś suite biega wyłącznie lokalnie i jego uruchomienie zależy od
pamięci developera.

Zmiana obejmuje też naprawę pułapki `NODE_ENV`, bez której bramka świeciłaby na czerwono
z fałszywego powodu, oraz synchronizację trzech dokumentów, które opisują stan bramek.

## Current State Analysis

**Co już istnieje i działa:**

- **Jedyne CI w projekcie to build Vercela.** Brak katalogu `.github` — nie ma żadnego
  workflow GitHub Actions. `tech-stack.md` deklaruje `ci_provider: github-actions`, ale
  na dysku nie ma tego ani jednego pliku; faktyczny provider bramek to Vercel.
- **Łańcuch egzekucji merge'a jest już szczelny.** Ruleset `protect-master` zawiera regułę
  `required_status_checks` z kontekstem `Vercel`
  (`gh api repos/:owner/:repo/rulesets/19239456`). Na PR #27 ten check raportuje się jako
  `{"context":"Vercel","state":"SUCCESS"}`. Czyli: gdy build padnie, check idzie na
  FAILURE i GitHub blokuje merge. **Tej części nie trzeba budować.**
- **`vercel.ts` istnieje** (`@vercel/config` jest w devDependencies) i zawiera dziś tylko
  `regions: ['fra1']` z komentarzem uzasadniającym wybór regionu.
- **Brak override'u Build Command w dashboardzie.** `vercel project inspect english-talk`
  pokazuje przy Build Command jedynie default frameworka (``npm run build`` or
  ``next build``), więc `buildCommand` z `vercel.ts` wejdzie bez konfliktu z ustawieniem
  po stronie platformy.
- **devDependencies są instalowane w buildzie.** Dowód pośredni, ale rozstrzygający:
  `next build` wykonuje typecheck, a `typescript` i `@types/*` żyją wyłącznie w
  devDependencies — build przechodzi dziś na produkcji, więc devDeps (a z nimi `vitest`,
  `jsdom`, `@testing-library/*`) są dostępne.
- **Suite jest szybki.** 2 pliki, 11 testów, 1,19 s (`npx vitest run`). Koszt w minutach
  builda jest pomijalny; nie ma potrzeby optymalizacji ani cache'owania.

**Czego brakuje:**

- `buildCommand` nie jest ustawiony — build Vercela nie zna testów.
- `test-plan.md §5` opisuje bramkę unit+integration jako „lokalnie od §3 Phase 1,
  w CI od §3 Phase 5", a `§3` trzyma Phase 5 jako `not started`.
- `README.md:100` nazywa `npm run test:run` „bramką przed pushem" — po tej zmianie jest
  to bramka merge'a.
- `AGENTS.md` §Commit & PR mówi „Every PR gets a Vercel preview build (typecheck
  included)" — po tej zmianie build obejmuje też testy.

**Kluczowe ograniczenie odkryte w badaniu — patrz „Critical Implementation Details".**

## Desired End State

Po zakończeniu planu:

1. Otwarcie PR-a z padającym testem daje czerwony check `Vercel` i **zablokowany przycisk
   merge** — udowodnione empirycznie, nie założone.
2. Log builda Vercela pokazuje output Vitesta **przed** logiem kompilacji Next.js
   (kolejność `&&` gwarantuje szybką porażkę bez marnowania minut na kompilację).
3. `npm run test:run` daje ten sam wynik lokalnie i w buildzie Vercela, mimo że Vercel
   ustawia `NODE_ENV=production`.
4. `test-plan.md`, `README.md` i `AGENTS.md` opisują bramkę zgodnie z tym, co faktycznie
   biega.

**Jak zweryfikować**: fazy 1 i 2 mają jawne kryteria; faza 2 jest właśnie dowodem punktu 1.

### Key Discoveries:

- **Ruleset już wymaga checka `Vercel`** — reguła `required_status_checks` w rulesecie
  `protect-master`; potwierdzone na PR #27. Bramka merge'a nie wymaga nowego mechanizmu,
  tylko żeby build umiał paść z powodu testów.
- **`NODE_ENV=production` łamie suite z fałszywego powodu** — zweryfikowane lokalnie,
  tabela wariantów w „Critical Implementation Details". To jest jedyna nieoczywista rzecz
  w tej zmianie.
- **Brak override'u Build Command w Project Settings** (`vercel project inspect`) —
  `vercel.ts` jest jedynym źródłem prawdy o build commandzie.
- **`vitest.config.mts` już dokumentuje ten gatunek pułapki** — komentarze w pliku
  tłumaczą rozszerzenie `.mts` i sprzężenie `globals: true` z `compilerOptions.types`.
  Guard na `NODE_ENV` należy do tej samej rodziny i trafia w to samo miejsce.
- **Ta zmiana jest wycinkiem `test-plan.md §3 Phase 5`** („Bramki CI + warstwa AI-native"),
  wykonanym przed fazami 2–4. Test-plan argumentuje, że faza 5 jest na końcu, „bo bramka
  ma sens dopiero wtedy, gdy jest co bramkować" — po fazie 1 jest co bramkować (11
  testów), więc wcześniejsze domknięcie jest obronne, ale wymaga adnotacji w `§3`.

## What We're NOT Doing

- **Nie dodajemy lintu do bramki.** `npm run lint` zostaje lokalny; notka w `AGENTS.md`
  („ESLint does not run in CI") i wiersz `lint` w `test-plan.md §5`
  (`required after §3 Phase 5`) **pozostają bez zmian**. Dodanie lintu wciągnęłoby zmianę
  w sprzątanie istniejących ostrzeżeń ESLinta i zmieszało dwa niezależne powody czerwonego
  builda.
- **Nie tworzymy workflow GitHub Actions.** Bramka stoi na buildzie Vercela, bo required
  status check `Vercel` już istnieje. Drugi provider CI to nowy mechanizm bez nowego
  sygnału.
- **Nie warunkujemy bramki na `VERCEL_ENV`.** Testy biegną na preview **i** na produkcji —
  decyzja świadoma: nie ma być ścieżki, którą nieprzetestowany kod trafia na produkcję
  (także przy re-deployu wcześniejszego commita).
- **Nie dotykamy pozostałych elementów §3 Phase 5** — post-edit hook i przegląd
  multimodalny stanów rozmowy zostają `not started`.
- **Nie ustawiamy niczego w dashboardzie Vercela.** Konfiguracja zostaje w repo.
- **Nie dodajemy komentarza uzasadniającego do `vercel.ts`** (decyzja z rundy pytań) —
  uzasadnienie pułapki `NODE_ENV` żyje w `vitest.config.mts`, a opis bramki w README.
- **Nie zmieniamy skryptów npm.** `test`, `test:run` zostają jak są; nie powstaje
  `test:ci`.
- **Nie dodajemy nowych testów.** Ta zmiana dotyczy egzekucji istniejącego suite'u.

## Implementation Approach

Bramka to jedna linia w `vercel.ts` (`buildCommand: 'npm run test:run && npm run build'`)
plus jedna linia guardu w `vitest.config.mts`. Reszta planu to dowód i dokumentacja —
i to one są tu właściwą pracą, bo bramka, której nie sprawdzono, że blokuje, jest tylko
dodatkowym krokiem w buildzie.

Kolejność faz jest celowa: konfiguracja → dowód blokowania → dokumenty. Dokumenty wchodzą
na końcu, żeby żadne zdanie w repo nie twierdziło niczego, czego faza 2 jeszcze nie
udowodniła.

`npm run build` (nie `next build`) w `buildCommand` — jeśli skrypt `build` kiedyś dostanie
dodatkowy krok, bramka pójdzie za nim automatycznie.

## Critical Implementation Details

### `NODE_ENV=production` łamie suite z fałszywego powodu

Vercel ustawia `NODE_ENV=production` w buildzie. Vitest ustawia `NODE_ENV=test` tylko
wtedy, gdy zmienna jest **nieustawiona** — więc w buildzie zostaje `production`, Vite
rozwiązuje produkcyjny export Reacta, a ten nie eksponuje `React.act`, na którym stoi
`@testing-library/react`. Wynik: `TypeError: React.act is not a function`, 10 z 11 testów
pada — z powodu, który nie ma nic wspólnego z testowanym kodem.

Zweryfikowane lokalnie przed napisaniem tego planu:

| Wariant | Wynik |
|---|---|
| `NODE_ENV=production npx vitest run` | ❌ 10 failów, `TypeError: React.act is not a function` |
| `NODE_ENV=test npx vitest run` | ✅ 11/11 |
| `process.env.NODE_ENV = 'test'` na górze `vitest.config.mts`, przy `NODE_ENV=production` w otoczeniu | ✅ 11/11 |
| `resolve: { conditions: ['development'] }` w configu, przy `NODE_ENV=production` | ❌ nadal `React.act is not a function` |

Wybrany wariant to guard w `vitest.config.mts`: działa przy każdym wywołaniu (bramka,
`npm test` w watchu, uruchomienie z IDE), jest przenośny między systemami i przeniesie się
na fazy 2–4 rolloutu bez powtarzania naprawy w kolejnych skryptach. Hoisting importów w
ESM go nie psuje — potwierdzone empirycznie powyżej, bo `plugin-react` czyta `NODE_ENV`
leniwie, nie w momencie importu.

**Konsekwencja dla implementacji**: guard musi wejść w tym samym commicie co
`buildCommand`. Odwrotna kolejność daje czerwony build, którego przyczyna wygląda jak
zepsuty test.

---

## Phase 1: Bramka + guard NODE_ENV

### Overview

Ustawić `buildCommand` w `vercel.ts` i zabezpieczyć `NODE_ENV` w configu Vitesta — jeden
commit, bo rozdzielenie daje czerwony build z mylącym komunikatem.

### Changes Required:

#### 1. Build command Vercela

**File**: `vercel.ts`

**Intent**: Wpleść suite testowy w build tak, żeby jego porażka kończyła build (a przez
required status check `Vercel` — blokowała merge i deploy produkcyjny). Testy przed
buildem, żeby czerwony suite nie płacił za kompilację.

**Contract**: Do obiektu `config: VercelConfig` dochodzi pole
`buildCommand: 'npm run test:run && npm run build'`. Istniejące `regions: ['fra1']` i jego
komentarz zostają nietknięte. Bez dodatkowego komentarza uzasadniającego (decyzja z rundy
pytań).

#### 2. Guard NODE_ENV w runnerze testów

**File**: `vitest.config.mts`

**Intent**: Wymusić `NODE_ENV=test` niezależnie od otoczenia, w którym runner startuje —
inaczej build Vercela (`NODE_ENV=production`) rozwiązuje produkcyjnego Reacta i suite pada
na `React.act is not a function`. Komentarz jest tu obowiązkowy: bez niego guard wygląda na
przypadkową mutację `process.env` i jest pierwszym kandydatem do „uproszczenia".

**Contract**: Przypisanie `process.env.NODE_ENV = 'test'` w module scope
`vitest.config.mts`, przed `export default`, z komentarzem w stylu pozostałych komentarzy w
tym pliku (dlaczego, nie co): Vitest ustawia `NODE_ENV` tylko gdy nieustawione; Vercel
ustawia `production`; produkcyjny export Reacta nie ma `React.act`, którego wymaga
`@testing-library/react`. Wariant `resolve.conditions` jest sprawdzony i **nie** działa —
warto to w komentarzu odnotować, żeby nikt nie próbował go drugi raz.

### Success Criteria:

#### Automated Verification:

- Suite przechodzi w symulowanym środowisku builda: `NODE_ENV=production npm run test:run` → 11/11
- Suite przechodzi bez zmiennej (ścieżka lokalna): `npm run test:run` → 11/11
- Typecheck i build przechodzą lokalnie: `npm run build`
- Lint przechodzi: `npm run lint`
- Pełny łańcuch bramki przechodzi lokalnie: `npm run test:run && npm run build`

#### Manual Verification:

- Build preview na PR-ze jest zielony, a w jego logu output Vitesta („Test Files 2 passed", „Tests 11 passed") pojawia się **przed** logiem kompilacji Next.js
- Log builda potwierdza, że Vercel użył commanda z `vercel.ts`, a nie defaultu frameworka

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na
potwierdzenie od człowieka, że log builda preview wygląda zgodnie z opisem, przed przejściem
do fazy 2. Faza 2 świadomie psuje build — nie ma sensu jej odpalać, dopóki nie wiemy, że
zielona ścieżka działa.

---

## Phase 2: Dowód, że bramka blokuje

### Overview

Zielony build dowodzi tylko, że testy się odpaliły. Celem tej zmiany jest blokowanie —
i to trzeba udowodnić osobno, celowo psując jedną asercję na tym samym PR-ze, a potem
cofając ten commit.

### Changes Required:

#### 1. Commit dowodowy — złamana asercja

**File**: jeden z `src/lib/realtime/transcript.test.ts` lub `src/components/voice-conversation.test.tsx`

**Intent**: Wywołać deterministyczną, jednoznaczną porażkę suite'u, żeby zobaczyć, co robi
z nią build i GitHub. Preferowany `transcript.test.ts` — test czysto jednostkowy, więc
porażka nie może być pomylona z pułapką środowiskową Reacta z fazy 1.

**Contract**: Minimalna zmiana jednej oczekiwanej wartości w jednej asercji — nie usuwanie
testu, nie `expect.fail()`, nie `throw`. Commit z jawnym komunikatem, że jest tymczasowy
i zostanie cofnięty (np. `test: temporary failing assertion to prove the build gate`).

#### 2. Revert commitu dowodowego

**File**: ten sam plik testowy

**Intent**: Przywrócić zielony suite, żeby PR był mergowalny. Historia PR-a zachowuje ślad
dowodu.

**Contract**: `git revert` commitu dowodowego (nie amend, nie force-push) — czerwony i
zielony build muszą zostać widoczne w historii checków PR-a jako dowód.

### Success Criteria:

#### Automated Verification:

- Po commicie dowodowym `npm run test:run` pada lokalnie z niezerowym kodem wyjścia: `npm run test:run; echo $?` → wartość ≠ 0
- Po revercie suite wraca na zielono: `npm run test:run` → 11/11
- Check `Vercel` na commicie dowodowym raportuje porażkę: `gh pr view <nr> --json statusCheckRollup` pokazuje `{"context":"Vercel","state":"FAILURE"}`
- Check `Vercel` na commicie po revercie raportuje sukces: to samo zapytanie pokazuje `state: SUCCESS`

#### Manual Verification:

- Na czerwonym commicie GitHub pokazuje merge jako zablokowany z powodu wymaganego checka `Vercel` (nie tylko „some checks failed" — konkretnie brak możliwości merge'a)
- Log padniętego builda zawiera komunikat asercji Vitesta i **nie** zawiera logu kompilacji Next.js — dowód, że `&&` przerwał build przed kompilacją
- Po revercie PR wraca do stanu mergowalnego

**Implementation Note**: Poczekaj na potwierdzenie od człowieka, że oba stany checka
(FAILURE i SUCCESS) zostały zobaczone na PR-ze, przed przejściem do fazy 3. Faza 3 zapisuje
w dokumentach właśnie ten fakt — bez dowodu byłaby twierdzeniem na wiarę.

---

## Phase 3: Synchronizacja dokumentów

### Overview

Zapisać w dokumentach dokładnie to, co faza 2 udowodniła. Trzy pliki mają dziś zdania,
które ta zmiana czyni nieprawdziwymi.

### Changes Required:

#### 1. Stan bramek w planie testów

**File**: `context/foundation/test-plan.md`

**Intent**: `§5` ma opisywać bramkę unit+integration jako faktycznie wymuszaną w buildzie
Vercela, a `§3` ma nie sugerować, że po bramkach CI nikt jeszcze nie tknął — bo kolejna
sesja `/10x-test-plan` czyta `§3` jako stan i pominęłaby to, co już stoi.

**Contract**: W tabeli `§5 Quality Gates`, wiersz `unit + integration`: kolumna „Gdzie" →
Vercel preview build (podpięte), kolumna „Wymagana?" → `required`. Wiersz `lint (ESLint)`
**zostaje bez zmian** (`required after §3 Phase 5`). W tabeli `§3 Phased Rollout`, wiersz
Phase 5: Status zostaje `not started` (post-edit hook i przegląd multimodalny nie ruszyły),
ale dochodzi adnotacja, że bramka testów wyszła poza kolejność w
`context/changes/vercel-build-test-gate/` — wraz z jednym zdaniem, dlaczego było to obronne
(po fazie 1 jest co bramkować). Wartości Status pozostają literałami ze słownika — parser
orkiestratora od nich zależy.

#### 2. Opis bramki w README

**File**: `README.md`

**Intent**: `README.md:100` nazywa `npm run test:run` „bramką przed pushem" — sugeruje
dobry nawyk. To jest teraz bramka merge'a i README jest pierwszym miejscem, gdzie ktoś
sprawdza, co musi przejść.

**Contract**: W podsekcji `### Testy` zaktualizować opis `npm run test:run` tak, żeby
mówił, że ten sam przebieg jest wymuszany w buildzie Vercela na każdym PR-ze i że jego
porażka blokuje merge oraz deploy produkcyjny. Wskazać `vercel.ts` jako miejsce, gdzie
bramka jest skonfigurowana.

#### 3. Kontrakt dla agentów

**File**: `AGENTS.md`

**Intent**: Sekcja §Commit & PR mówi „Every PR gets a Vercel preview build (typecheck
included)". Agent czyta ten plik na starcie — nieaktualny opis bramek jest najdroższym
rodzajem nieaktualnej dokumentacji.

**Contract**: Uzupełnić to zdanie tak, żeby build preview obejmował testy obok typechecku.
Zdanie „ESLint does not run in CI — run `npm run lint` locally before pushing"
**pozostaje**, bo lint jest poza zakresem tej zmiany — jego usunięcie skonfliktowałoby
`AGENTS.md` z `test-plan.md §5`.

### Success Criteria:

#### Automated Verification:

- Żaden dokument nie opisuje już bramki unit+integration jako wyłącznie lokalnej: `grep -n "w CI od §3 Phase 5" context/foundation/test-plan.md` → brak trafień
- Notka o ESLincie przetrwała w obu miejscach: `grep -c "ESLint does not run in CI" AGENTS.md` → 1 oraz `grep -n "required after §3 Phase 5" context/foundation/test-plan.md` → trafienie w wierszu `lint`
- Wartości Status w `§3` nadal należą do słownika parsera: `grep -nE "not started|change opened|researched|planned|implementing|complete" context/foundation/test-plan.md` → wiersz Phase 5 ma `not started`
- Suite i build nadal przechodzą po zmianach w dokumentach: `npm run test:run && npm run build`

#### Manual Verification:

- Przeczytanie `### Testy` w README bez wcześniejszego kontekstu odpowiada na pytanie „co musi przejść, żebym mógł zmergować" — bez zaglądania do `vercel.ts`
- `test-plan.md §3` czyta się spójnie: Phase 5 jest `not started`, a adnotacja tłumaczy, dlaczego jedna z jej bramek już stoi
- `change.md` ma `status: planned` → po wdrożeniu `complete`, `updated` na dziś

---

## Testing Strategy

Ta zmiana nie dodaje testów — dodaje egzekucję istniejących. „Testowaniem" jest tu
weryfikacja samej bramki.

### Unit Tests:

- Brak nowych. Istniejące 11 testów w 2 plikach jest przedmiotem bramki, nie jej celem.

### Integration Tests:

- Brak nowych. Warstwa integration wchodzi w `test-plan.md §3` fazach 2–3 i skorzysta z tej
  bramki automatycznie — dzięki guardowi w `vitest.config.mts` nie będzie musiała powtarzać
  naprawy `NODE_ENV`.

### Manual Testing Steps:

1. Lokalnie: `NODE_ENV=production npm run test:run` → 11/11 (dowód, że guard z fazy 1 działa).
2. Lokalnie: `npm run test:run && npm run build` → oba kroki zielone, w tej kolejności.
3. Na PR-ze: sprawdzić log builda preview — output Vitesta przed kompilacją Next.js.
4. Faza 2: commit z jedną złamaną asercją → check `Vercel` na FAILURE, merge zablokowany,
   log builda bez kompilacji Next.js.
5. Faza 2: revert → check `Vercel` na SUCCESS, PR mergowalny.

## Performance Considerations

Suite trwa 1,19 s przy 2 plikach i 11 testach — wobec czasu instalacji zależności i
kompilacji Next.js jest to szum. Nie ma potrzeby cache'owania, równoległości ani
`--reporter=dot`.

Warto to jednak odnotować jako rzecz do obserwacji: gdy fazy 3–4 rolloutu dorzucą warstwę
integration na lokalnym stacku Supabase i e2e w Playwright, ten sam `buildCommand`
przestanie być darmowy — integration wymagająca działającej bazy w kontenerze builda
Vercela może się wręcz okazać niewykonalna w tym miejscu. To decyzja dla tamtych faz, nie
dla tej; `test-plan.md §5` już zresztą dopuszcza bramkę integration jako ad hoc.

## Migration Notes

Brak migracji danych. Jedno następstwo operacyjne warte zapisania: od momentu wejścia tej
zmiany na `master` czerwony suite blokuje deploy produkcyjny. Wyjściem awaryjnym przy
flaky teście jest rollback do poprzedniego deployu (nadal dostępny w Vercelu) albo revert
commitu — nie obejście bramki.

## References

- Stan bramek i fazy rolloutu: `context/foundation/test-plan.md` §3, §5
- Ryzyko #1 (teardown sesji), które ta bramka pilnuje: `context/foundation/test-plan.md` §2
- Faza 1 rolloutu (źródło bramkowanych testów): `context/archive/2026-07-29-testing-session-lifecycle/`
- Konfiguracja platformy: `vercel.ts`
- Runner testów i jego pułapki: `vitest.config.mts`, `vitest.setup.ts`
- Ruleset egzekwujący bramkę: `gh api repos/:owner/:repo/rulesets/19239456`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bramka + guard NODE_ENV

#### Automated

- [x] 1.1 Suite przechodzi w symulowanym środowisku builda (`NODE_ENV=production npm run test:run` → 11/11)
- [x] 1.2 Suite przechodzi bez zmiennej (`npm run test:run` → 11/11)
- [x] 1.3 Typecheck i build przechodzą lokalnie (`npm run build`)
- [x] 1.4 Lint przechodzi (`npm run lint`)
- [x] 1.5 Pełny łańcuch bramki przechodzi lokalnie (`npm run test:run && npm run build`)

#### Manual

- [ ] 1.6 Build preview zielony, output Vitesta w logu przed kompilacją Next.js
- [ ] 1.7 Log builda potwierdza użycie commanda z `vercel.ts`, nie defaultu frameworka

### Phase 2: Dowód, że bramka blokuje

#### Automated

- [ ] 2.1 Po commicie dowodowym `npm run test:run` kończy się kodem ≠ 0
- [ ] 2.2 Po revercie suite wraca na zielono (11/11)
- [ ] 2.3 Check `Vercel` na commicie dowodowym raportuje `state: FAILURE`
- [ ] 2.4 Check `Vercel` po revercie raportuje `state: SUCCESS`

#### Manual

- [ ] 2.5 GitHub pokazuje merge jako zablokowany na czerwonym commicie
- [ ] 2.6 Log padniętego builda ma komunikat asercji i nie ma kompilacji Next.js
- [ ] 2.7 Po revercie PR wraca do stanu mergowalnego

### Phase 3: Synchronizacja dokumentów

#### Automated

- [ ] 3.1 `test-plan.md` nie opisuje już bramki unit+integration jako wyłącznie lokalnej
- [ ] 3.2 Notka o ESLincie przetrwała w `AGENTS.md` i w wierszu `lint` w `§5`
- [ ] 3.3 Wartości Status w `§3` nadal należą do słownika parsera
- [ ] 3.4 Suite i build przechodzą po zmianach w dokumentach

#### Manual

- [ ] 3.5 `### Testy` w README odpowiada na „co musi przejść, żebym mógł zmergować"
- [ ] 3.6 `test-plan.md §3` czyta się spójnie (Phase 5 `not started` + adnotacja)
- [ ] 3.7 `change.md` zaktualizowany (`status`, `updated`)
