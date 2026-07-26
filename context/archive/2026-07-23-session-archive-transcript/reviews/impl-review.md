<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Archiwum sesji z transkrypcją (S-05)

- **Plan**: context/changes/session-archive-transcript/plan.md
- **Scope**: Phase 1 & 2 of 2 (full plan)
- **Date**: 2026-07-26
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Retry raportu może zapisać zduplikowaną sesję

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/api/report/route.ts:146 (+ src/components/voice-conversation.tsx:327)
- **Detail**: Każde udane ocenienie bezwarunkowo wstawia wiersz `sessions` (route.ts:146-154). Ścieżka retry po stronie klienta (`retryReport` → `fetchReport(turnsSnapshot)`, voice-conversation.tsx:327-330) ponownie POST-uje ten sam transkrypt. Jeśli pierwsze żądanie ukończyło INSERT po stronie serwera, ale `fetch` klienta odrzucił się w trakcie odbioru odpowiedzi (reset połączenia / chwilowy offline dokładnie przy 200), użytkownik ląduje w fazie `error`, klika „Spróbuj ponownie" i uruchamia drugie pełne ocenianie → **zduplikowana zarchiwizowana sesja** (i drugie płatne wywołanie OpenAI). Okno jest wąskie (INSERT tuż przed zwrotem 200; błędy `!response.ok` i błędy DB nie wyzwalają wstawienia), ale zapisuje duplikat niemodyfikowalnego wiersza. Plan świadomie odpuszcza retry *zapisu do DB*, ale nie rozważa duplikacji z retry *klienta*.
- **Fix A ⭐ Recommended**: Zaakceptować jako znany edge case v1 — odnotować w change.md/follow-ups, bez zmiany kodu.
  - Strength: Zgodne z duchem planu („best-effort, pojedynczy utracony/nadmiarowy wiersz jest OK"); okno jest wąskie i wymaga zbiegu awarii sieci dokładnie na 200; wolumen v1 mały.
  - Tradeoff: Rzadki duplikat w archiwum + jedno dodatkowe płatne wywołanie modelu pozostają możliwe.
  - Confidence: HIGH — ścieżka retry i pozycja INSERT-u potwierdzone w kodzie.
  - Blind spot: Nie zmierzono realnej częstości resetów połączenia na 200 na Vercel/preview.
- **Fix B**: Klient generuje klucz idempotencji (np. `crypto.randomUUID()` na sesję), wysyłany w payloadzie i utrwalany jako unikatowa kolumna; retry robi upsert zamiast duplikatu.
  - Strength: Eliminuje duplikat u źródła; retry staje się bezpieczny idempotentnie.
  - Tradeoff: Nowa migracja (unikatowy indeks) + zmiana payloadu i klienta — więcej pracy niż v1 zakładał; drugie wywołanie OpenAI wciąż występuje (idempotencja chroni tylko wiersz DB).
  - Confidence: MED — wymaga forward-only migracji i przemyślenia kolizji klucza między sesjami.
  - Blind spot: Nie sprawdzono, czy transkrypt między retry jest gwarantowanie identyczny (jest — `turnsSnapshot` zamrożony).
- **Decision**: ACCEPTED (Fix A) — znany edge case v1, zgodne z best-effort z planu; bez zmian w kodzie.

### F2 — Server Action usuwania bez własnego strażnika auth

- **Severity**: 🟡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/archive/actions.ts:12
- **Detail**: `deleteSession` woła `supabase.from('sessions').delete().eq('id', id)` bez `requireUser()`, opierając się wyłącznie na RLS (`sessions_delete_own`) + bramce w `proxy.ts`. Jest to **bezpieczne** — proxy fail-close'uje nieuwierzytelnione POST-y do `/archive/[id]`, a RLS zawęża delete do `auth.uid()`, więc dowolne `id` usuwa 0 wierszy — ale jest niespójne z `/api/report`, gdzie kod komentarzem explicite deklaruje niezależny auth „defense-in-depth" (route.ts:34). Dla operacji destrukcyjnej dołożenie linii `requireUser()` byłoby spójniejszą, mocniejszą postawą.
- **Fix**: Dodać `await requireUser()` na początku `deleteSession` (defense-in-depth, spójnie z /api/report).
- **Decision**: FIXED — dodano `await requireUser()` + import w src/app/archive/actions.ts.

### F3 — JSONB rzutowany na typy bez walidacji runtime i bez error boundary

- **Severity**: 🟡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/app/archive/[id]/page.tsx:53
- **Detail**: `report`/`transcript` (JSONB) są rzutowane wprost na `Report`/`Turn[]` i podawane do `ReportView`, które robi `report.errors.some(...)`, `report.suggestions.map(...)` itd. Bezpieczne w v1 (ten kod jest jedynym zapisującym), ale przyszła zmiana schematu `Report` sprawi, że stare wiersze wywrócą render szczegółu — bez obsługi, bo w `src/app/archive/` nie ma `error.tsx`. Warto rozważyć boundary `error`/lekki parse Zod przed renderem, gdy schemat zacznie ewoluować.
- **Fix**: Dodać `src/app/archive/error.tsx` (lub lekki `ReportSchema.safeParse` przed renderem) zanim schemat `Report` zacznie się zmieniać.
- **Decision**: SKIPPED — bezpieczne w v1; do adresowania gdy schemat `Report` zacznie ewoluować.

### F4 — Cicha porażka usuwania

- **Severity**: 🟡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/archive/actions.ts:15-18
- **Detail**: Przy błędzie DB akcja loguje i mimo to robi `redirect('/archive')`, gdzie (wciąż obecna) sesja pojawia się ponownie bez żadnej informacji zwrotnej dla użytkownika. Drobna luka UX; akceptowalne, bo RLS sprawia, że typowa „porażka" to „0 wierszy / brak błędu".
- **Fix**: Zaakceptować w v1 lub przekazać sygnał błędu do UI (np. przez `?error=delete` i komunikat na liście).
- **Decision**: SKIPPED — akceptowalne w v1; typowa porażka to 0 wierszy bez błędu.

### F5 — Podwójna instancjacja klienta Supabase na żądanie archiwum

- **Severity**: 🟡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/archive/page.tsx:41-42 (+ [id]/page.tsx:35-36)
- **Detail**: `requireUser()` buduje klienta Supabase i woła `getUser()`, po czym strona buduje *drugiego* klienta przez `createClient()` do zapytania — dwie konstrukcje klienta + dwa odczyty ciasteczek na żądanie. Koszt trywialny, ale `/api/report` reużywa jednego klienta do auth i insertu; strony mogłyby analogicznie przewlec klienta, gdyby istniał wspólny helper.
- **Fix**: Zaakceptować (trywialny koszt) lub dodać helper zwracający `{ user, supabase }` z jednej instancji klienta.
- **Decision**: SKIPPED — koszt trywialny; zostawione jak jest.
