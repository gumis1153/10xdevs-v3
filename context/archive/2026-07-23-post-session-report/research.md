---
date: 2026-07-23T18:58:32+0200
researcher: piotr.jakubowski
git_commit: 5e6ab17a8df3137930ae68a729c7b33a4f304f23
branch: chore/first-voice-conversation-close
repository: 10xdevs
topic: "Jak uzyskać informacje o przeprowadzonej rozmowie głosowej i ocenić użytkownika (CEFR A1–C2) obecnym tech-stackiem"
tags: [research, codebase, post-session-report, cefr, openai, realtime, structured-outputs]
status: complete
last_updated: 2026-07-23
last_updated_by: piotr.jakubowski
---

# Research: post-session-report — pozyskanie danych z rozmowy i ocena CEFR

**Date**: 2026-07-23T18:58:32+0200
**Researcher**: piotr.jakubowski
**Git Commit**: 5e6ab17a8df3137930ae68a729c7b33a4f304f23
**Branch**: chore/first-voice-conversation-close
**Repository**: 10xdevs

## Research Question

Jak można uzyskać informacje na temat przeprowadzonej rozmowy głosowej (transkrypcja, podsumowanie) i **ocenić poziom użytkownika w skali CEFR (A1/A2/B1/B2/C1/C2)** przy pomocy obecnego tech-stacku (Next.js 16 + OpenAI direct + Supabase + Vercel)? Research zewnętrzny przeprowadzony przez **exa MCP**.

## Summary

Materiał do raportu **już istnieje w kliencie i nie wymaga dodatkowej infrastruktury nagrywania**: komponent rozmowy trzyma pełną historię jako `historyRef: RealtimeItem[]` (z eventu `history_updated`), utrzymywaną w pamięci także na ekranie końcowym — plan `first-voice-conversation` explicite oznaczył ten ekran jako **punkt przekazania dla S-04** (`voice-conversation.tsx:87-91`, `:304-322`). Transkrypcja użytkownika siedzi w polach `input_audio.transcript` (spisane przez `gpt-4o-mini-transcribe`), a odpowiedzi asystenta w `output_audio.transcript`.

Rekomendowana architektura oceny (zbieżna z dwoma najbliższymi opublikowanymi systemami — Bannò 2025 i EvalYaks 2024):

> transkrypcja (tury ucznia) + oficjalne deskryptory CEFR w promptcie → **OpenAI Responses API + Structured Outputs (zod v4, `strict`)** → **deterministyczna walidacja cytatów (grounding)** → raport renderowany na ekranie końcowym.

Kluczowe wnioski merytoryczne:
- **CEFR z pojedynczej krótkiej sesji jest szumny.** LLM klasy frontier osiągają zgodność z ludźmi na poziomie QWK ~0.81 (sufit human–human ~0.87), ale mają silny **bias centralny** (ściąganie do B1/B2) i **zawodzą na C1/C2** (w jednym badaniu 0% trafień na C1/C2). Raportuj poziom z pasmem ±1 i disclaimerem — dokładnie tego wymaga PRD FR-012.
- **Halucynowane poprawki to główny risk** (Guardrail PRD + roadmap S-04). Najsilniejsza, najlepiej udokumentowana mitygacja: **wymóg dosłownego cytatu z transkryptu dla każdego błędu + deterministyczny post-check (substring), minimal-edit framing, jawne „pusta lista jest OK", ograniczenie korekt tylko do tur ucznia.**
- **Kategorii „wymowa" NIE da się rzetelnie ocenić z samego tekstu.** Transkrypt gubi fonetykę/prozodię. EvalYaks wprost usuwa kryterium pronunciation przy inputcie tekstowym — to precedens dla decyzji w planie (usunąć lub przeetykietować kategorię z PRD FR-011).
- **Nic nie jest jeszcze utrwalane** — brak schematu DB, migracji i tabel; cały Supabase to na razie tylko auth. Roadmap parkuje pierwszą migrację na **S-05**, więc S-04 jest z założenia **bezstanowe** (analiza w requeście + render). Persistencja raportu wciągnęłaby pierwszą migrację do przodu.

⚠️ **Do weryfikacji na żywo przy `/10x-plan`**: dokładna nazwa modelu tekstowego OpenAI (agent podał lineup „GPT-5.6 / Sol-Terra-Luna" z lipca 2026 — potraktowane jako niezweryfikowane, patrz Open Questions). API, kształt SDK i Structured Outputs są zweryfikowane wobec zainstalowanych paczek.

---

## Detailed Findings

### 1. Źródło transkrypcji / historii rozmowy (co już mamy)

- Historia żyje w `historyRef` — `src/components/voice-conversation.tsx:91`: `const historyRef = useRef<RealtimeItem[]>([])`. Komentarz `:87-90` mówi wprost, że jest utrzymywana w pamięci na ekranie końcowym „jako punkt przekazania dla raportu S-04", a surowe audio nie jest nigdzie zapisywane.
- Zapełniana przez handler `history_updated` — `voice-conversation.tsx:151-153`: `session.on('history_updated', (history) => { historyRef.current = history })`. Dostaje **pełną** tablicę przy każdej zmianie (nie delta). To `ref` (nie state) celowo — zmiany historii nie mają wywoływać re-renderów.
- **Kształt `RealtimeItem`** (zweryfikowany z zainstalowanego `node_modules/@openai/agents-realtime/dist/items.d.ts:92`): unia `RealtimeMessageItem | RealtimeToolCallItem | RealtimeMcpCallItem | RealtimeMcpCallApprovalRequestItem`. Tekst niosą tylko `RealtimeMessageItem` (`type: 'message'`), unia po `role`:
  - `role: 'user'` → `content[]` z `{ type:'input_text', text }` lub `{ type:'input_audio', transcript: string|null }`. **Tekst mowy użytkownika = `input_audio.transcript`** (spisany przez `gpt-4o-mini-transcribe`, konfigurowany `voice-conversation.tsx:137` i przypięty serwerowo `route.ts:59`).
  - `role: 'assistant'` → `{ type:'output_text', text }` lub `{ type:'output_audio', transcript?: string|null }`. **Tekst asystenta = `output_audio.transcript`.**
  - `role: 'system'` → tylko `input_text` (ziarno instrukcji) — pomijamy.
  - Pola używają **camelCase** (`itemId`, `previousItemId`) po stronie klienta; tablica jest już w kolejności.
- **Seam ekranu końcowego** — `voice-conversation.tsx:304-322`: gałąź `ended` renderuje placeholder („Raport z rozmowy pojawi się w następnym kroku…", `:311`) + „Nowa sesja" (`onNewSession`, `:315`). Kontrakt propsów (`:68-78`): `topic`, `onStateChange`, `onExit`, `onNewSession` — **żaden nie eksponuje historii na zewnątrz**. Więc albo raport renderujemy wewnątrz tego komponentu (czytając `historyRef.current`), albo historię trzeba wypchnąć nowym callbackiem/liftem.
- Wejścia w `ended`: `:247` (timer→0) i `:261` (`endConversation`). Oba ustawiają `userEndedRef.current = true` i wołają `session.close()` przed zmianą stanu.
- Helpery SDK: `removeAudioFromContent(item)` i `getLastTextFromAudioOutputMessage` (`node_modules/@openai/agents-realtime/dist/utils.d.ts`) — przydatne do sanityzacji base64 audio przed wysłaniem na serwer.

Funkcja budująca transkrypt (czysta, karmiona `historyRef.current`), zweryfikowana wobec zainstalowanych typów v0.13.5:

```ts
import type { RealtimeItem } from '@openai/agents-realtime'

export function buildTranscript(history: RealtimeItem[]): string {
  const lines: string[] = []
  for (const item of history) {
    if (item.type !== 'message') continue      // pomiń tool/mcp
    if (item.role === 'system') continue        // pomiń turę instrukcji
    const speaker = item.role === 'user' ? 'Learner' : 'Tutor'
    const text = item.content
      .map((part) => {
        switch (part.type) {
          case 'input_text':
          case 'output_text':
            return part.text
          case 'input_audio':
          case 'output_audio':
            return part.transcript ?? ''
          default:
            return ''
        }
      })
      .join(' ')
      .trim()
    if (text) lines.push(`${speaker}: ${text}`)
  }
  return lines.join('\n')
}
```

Zastrzeżenia: `transcript` bywa `null`, dopóki tura jest `in_progress` — buduj transkrypt **dopiero po `ended`** (już trzymamy `historyRef` żywe na ekranie końcowym); opcjonalnie filtruj `status === 'completed'`.

### 2. Seamy przekazania do S-04 (co plan już przewidział)

- `voice-conversation.tsx:66`: „…ekran końcowy — zaślepka, którą S-04 podmieni na raport."
- `src/lib/realtime/instructions.ts:3-7`: instrukcje wyniesione poza komponent, żeby **S-04 (raport) i S-06 (adaptacja poziomu)** mogły je rozwijać bez dotykania logiki sesji. Linia `:18`: partner **nie poprawia** błędów na żywo — „Feedback happens after the session, not during it." → raport jest **jedynym** kanałem feedbacku (kontrakt produktowy).
- `context/changes/first-voice-conversation/plan.md:88` („No post-session report — S-04. The end screen is a stub with a hand-off…"), `:420-432` (sekcja „End screen (S-04 hand-off stub)"): historia z `history_updated` „retained in memory on the ended screen — S-04's hand-off point. Nothing is persisted or displayed … raw audio is never stored anywhere … do not add recording."
- `context/changes/first-voice-conversation/research.md:238-239`: **„The Hobby 300 s function cap … applies to S-04's analysis route, not this one."** — twarde ograniczenie dla przyszłego `/api/report`.
- `docs-openai-agents-realtime.md:79,114,132`: transkrypcja obu stron + `history_updated` = „gotowy materiał wejściowy dla S-04 bez dodatkowego kosztu".

### 3. Stan persistencji / DB (czego brakuje)

- **Nie ma nic trwałego.** Brak `supabase/migrations/`, brak plików `.sql`, brak `create table`, brak zapytań `from(<table>)`, brak drizzle/prisma, brak wygenerowanych `database.types.ts`.
- Całe użycie Supabase to **wyłącznie auth**: `src/app/auth/actions.ts:24,42`, `src/app/auth/callback/route.ts:16`, `src/app/api/realtime/token/route.ts:20-24`, `src/lib/supabase/server.ts:35-39`, `src/proxy.ts:41-44`.
- `src/lib/supabase/server.ts` eksportuje `createClient()` (`:8-32`) i `requireUser(): Promise<User>` (`:34-51`, redirect na `/login`) — wzorzec auth do reużycia w route/stronie raportu.
- Roadmap parkuje pierwszy schemat + migrację (RLS od pierwszej tabeli) na **S-05** (`roadmap.md:141,165`). **Wniosek: S-04 jak zaplanowane jest bezstanowe** — analiza w requeście i render. Decyzja o utrwaleniu raportu w S-04 wciąga pierwszą migrację do przodu (kolizja z sekwencją roadmapy).

### 4. Wzorce routingu / API (gdzie wpiąć raport)

Istniejące trasy pod `src/app/`: `api/realtime/token/route.ts` (POST, mint tokenu), `auth/actions.ts` (server actions OAuth), `auth/callback/route.ts`, strony `page.tsx` (Home — `requireUser()` → `SessionStart`), `login/page.tsx`, `layout.tsx`.

Wzorzec API do naśladowania (`src/app/api/realtime/token/route.ts`):
- Auth: `createClient()` → `supabase.auth.getUser()` (`:20-24`), 401 gdy brak usera (`:31-33`) — defense-in-depth ponad `src/proxy.ts` (`proxy.ts:58-64`).
- Błędy: benign `AuthSessionMissingError` nielogowany (`:26-29`); awarie upstream → 502 (`:70-83`).
- Cache: sukces z `Cache-Control: no-store` (`:90`).
- `OpenAI-Safety-Identifier` = sha256(`user.id`) (`:35-37,50`) — **route raportu wołający OpenAI powinien reużyć ten sam pseudonim**. `OPENAI_API_KEY` już wpięty (`:48`).

Gdzie wpiąć:
- Nowa trasa: `src/app/api/report/route.ts` (POST, przyjmuje zsanityzowany transkrypt z klienta, woła analizę OpenAI, zwraca `{ cefr, mistakes[], suggestions[], transcript }`). Musi zmieścić się w limicie funkcji (research first-voice: 300 s Hobby) — cap długości inputu / rozważ streaming.
- Widok: render **inline** w gałęzi `ended` (klient wysyła `historyRef.current` do `/api/report` i pokazuje wynik) — pasuje do obecnej architektury bez DB. Dedykowana strona `report/[id]` wymagałaby persistencji → terytorium S-05.
- **Uwaga proxy** (`proxy.ts:106-111`): matcher wyklucza ścieżki z rozszerzeniami obrazków — unikaj tras raportu z sufiksem obrazkowym (`/report.png` ominąłby bramkę sesji). Zwykłe `/api/report` (JSON) jest matchowane i bramkowane.

### 5. Slice roadmapy (S-04)

`context/foundation/roadmap.md:119-130` — „S-04: Raport po sesji":
- **Outcome** (`:121`): po sesji user widzi raport — pogrupowane błędy (gramatyka / słownictwo / wymowa) z poprawkami i wyjaśnieniami, ocena CEFR z uzasadnieniem i disclaimerem niepewności, konkretne sugestie; **sesja < 2 min → „za mało materiału do analizy".**
- **Change ID**: `post-session-report`. **PRD**: FR-010, FR-011, FR-012, FR-013, US-01, Guardraile, NFR (sygnał wizualny w trakcie analizy).
- **Prerequisites**: S-03. **Blockers**: brak. **Status**: proposed.
- **Unknowns** (`:127-128`): jak zmieścić analizę pełnego transkryptu w limicie 300 s (cap długości / streaming / background) — do rozstrzygnięcia w planie.
- **Risk** (`:129`): zamyka główne Success Criterion; największy risk to **guardrail zaufania — halucynowane poprawki niszczą cały mechanizm; pusta lista błędów musi być poprawnym wynikiem.**

### 6. Ocena CEFR LLM-em — dowody i niezawodność (research zewnętrzny / exa)

**Najbliższe precedensy (prawie identyczny setup):**
- **Bannò i in. (2025), *NL-based Assessment of L2 Oral Proficiency using LLMs*** — karmi transkrypcje ASR + analityczne deskryptory „can-do" CEFR do LLM zero-shot; „naśladuje proces interpretacyjny ludzkiego oceniającego", działa text-only, bije fine-tunowany BERT. https://arxiv.org/html/2507.10200
- **EvalYaks (Scaria i in., 2024)** — automatyczna ocena CEFR B2 speaking **z transkryptów rozmów**; ocenia grammar&vocabulary, discourse management, interactive communication i **celowo pomija pronunciation, bo input jest tekstowy**. https://arxiv.org/pdf/2408.12226

**Niezawodność (głównie badania na pisaniu, ale to kluczowa literatura benchmarkowa):**
- Yancey i in. (2023, ACL BEA): z **przykładami kalibracyjnymi w promptcie** GPT-4 prawie dorównał produkcyjnemu AWE (QWK **0.81 vs 0.84**); sufit human–human QWK **0.87**. Bez kalibracji — poniżej trywialnego baseline'u. Lekki bias łagodności +0.15 poziomu. GPT-3.5 nie dawał rady. https://aclanthology.org/2023.bea-1.49.pdf
- Replikacja (SiemonCha/ECM3401): GPT-4o-mini ~85% na B1, ale **0% na C1 i C2**, 90% B2 mylone z B1; exact-match ~31–35% (większość błędów ±1 poziom). Zmiana pojedynczego tokenu w promptcie ruszała accuracy o dziesiątki punktów. https://github.com/SiemonCha/ECM3401-LLM-Essay-Scoring
- Benedetto i in. (2024, *Computers & Education: AI*): LLM ma tylko **częściową wiedzę o CEFR z pamięci** — wynik rośnie, gdy **deskryptory są w promptcie**. https://doi.org/10.1016/j.caeai.2024.100353
- Bias centralny (Many-Facet Rasch): GPT-4 unika skrajnych ocen, klastruje środek skali.

**Wniosek dla 2–3 min transkryptu**: traktuj wynik jako *wskazanie*, raportuj poziom ±1 pasmo, spodziewaj się zawodności na C1/C2, `temperature: 0`. Adjacent-level (±1) to uczciwa metryka projektowa, nie exact-match. To dokładnie uzasadnia disclaimer wymagany przez FR-012.

### 7. Projekt promptu oceniającego (dowody / exa)

1. **Wstaw deskryptory CEFR do promptu** (nie polegaj na pamięci modelu) — global scale + spoken-interaction „can-do". Gotowe teksty oficjalne: Global scale https://rm.coe.int/168045b15e , self-assessment grid https://rm.coe.int/090000168045bb52 , Companion Volume 2020 https://rm.coe.int/-companion-volume-with-new-descriptors-2018/1680787989 . Użyj skali **spoken interaction** (input to dialog), nie writing grid.
2. **1 przykład kalibracyjny na poziom (few-shot)** — najskuteczniejsza pojedyncza technika u Yancey; naprawia skrajności A1/C2. https://aclanthology.org/2023.bea-1.49.pdf
3. **CoT/rozumowanie po wymiarach PRZED werdyktem** (morfoskładnia → leksyka → dyskurs → decyzja) — poprawia interpretowalność. Uwaga: w replikacji ECM3401 CoT **nie** podniósł surowej accuracy liczby — użyj CoT do uzasadnienia/dowodów, nie licz na wzrost trafności.
4. **Oceniaj pod-wymiary analitycznie, potem wyprowadź poziom holistyczny** (jak ludzki rater) — daje materiał do raportu (Bannò).
5. **Kalibracja/overconfidence**: randomizuj kolejność deskryptorów (bias pozycyjny); werbalizowany `confidence` to nieskalibrowany zgadu modelu — traktuj jako miękki sygnał. Disclaimer sformułuj jawnie: automatyczna estymata z krótkiej, tekstowej próbki, ~±1 pasmo, najmniej wiarygodna na poziomach C, nie zastępuje egzaminu.

### 8. Anty-halucynacja poprawek (główny guardrail — dowody / exa)

Udokumentowany failure mode + mitygacje:
- Generatywne LLM-y mają **wysoki recall, niską precyzję** w korekcie (GEC) — „poprawiają" to, co było OK (rewriting pod fluency), łamiąc minimal-edit. https://arxiv.org/html/2402.15930v1 , https://aclanthology.org/2025.emnlp-main.1431.pdf
- Odwrotnie, Pfau i in. (Cambridge ARAL): identyfikacja błędów przez GPT-4 miała **99% precyzji** (flaga = realny błąd), ale ~69% recall — precyzja to własność, na której nam zależy; pominięcie błędu jest bezpieczniejsze niż wymyślenie. https://www.cambridge.org/core/journals/annual-review-of-applied-linguistics
- Techniki do wbudowania:
  1. **Wymagaj dosłownego cytatu z transkryptu dla każdego błędu**, potem **deterministyczny post-check**: odrzuć błąd, którego `quote` nie jest dokładnym substringiem transkryptu. Wzorzec: https://github.com/pierreolivierbonin/verbatimeter
  2. **Jawnie: „zwróć pustą listę, jeśli nie ma błędów."** OpenAI Structured Outputs ostrzega, że model „zawsze trzyma się schematu, co przy niepasującym wejściu daje halucynacje" — pusta tablica musi być dozwolona. https://developers.openai.com/api/docs/guides/structured-outputs
  3. **Minimal-edit framing**: „najmniejsza możliwa zmiana; nie przeredagowuj poprawnych fragmentów; jeśli zdanie jest poprawne — zostaw." https://github.com/gotutiyan/gec-llm
  4. **Poprawiaj tylko tury ucznia** (transkrypt zawiera też tury asystenta — inaczej „poprawi" własną poprawną mowę modelu).
  5. **Uwaga na fałszywe błędy z ASR**: `gpt-4o-mini-transcribe` może zniekształcić słowo → wygląda jak błąd gramatyczny ucznia. Zawęź do tur ucznia i zaznacz, że cytat odzwierciedla transkrypcję (możliwe artefakty). Knill i in. 2018.
  6. **Walidacja treści ≠ walidacja schematu** — poprawny JSON może być „dobrze uformowanym kłamstwem"; sprawdzaj grounding cytatu po parsowaniu.

### 9. Transkrypt-only vs audio — co da się ocenić (dowody / exa)

Ograniczenie construct-validity jest jednoznaczne: **CEFR speaking normalnie obejmuje wymowę, płynność, intonację, prozodię — nic z tego nie przetrwa w transkrypcie tekstowym.**
- Transkrypcje ASR „nie zawierają informacji o realizacji komunikatu (fluency, pronunciation, intonation, rhythm, prosody)". Bannò i in. https://doi.org/10.17863/cam.99929
- **Co tekst *może* ocenić**: treść, zakres/kontrola słownictwa, poprawność/zakres gramatyki, spójność/kohezja, zarządzanie dyskursem, interakcja, trafność zadania (Craighead i in. 2020, 76% w granicach ±1 stopnia). https://aclanthology.org/2020.acl-main.206.pdf
- **Czego *nie może***: wymowa i prozodia bezpośrednio. Fluency da się tylko słabo proxy'ować markerami dysfluencji („umm", false starts) — a `gpt-4o-mini-transcribe` produkuje zwykle czysty, pozbawiony dysfluencji tekst, więc nawet ten proxy bywa niedostępny.
- **Precedens decyzji**: EvalYaks usuwa kryterium „pronunciation" przy inpucie tekstowym. https://arxiv.org/pdf/2408.12226

**Implikacja dla kategorii „wymowa" z PRD FR-011**: z transkryptu tekstowego **nie można rzetelnie flagować błędów wymowy** — brak sygnału fonetycznego; każdy taki „błąd" byłby zmyślony lub artefaktem ASR. Opcje (malejąca rygorystyczność): (1) usunąć kategorię pronunciation (precedens EvalYaks) i powiedzieć to w disclaimerze; (2) przeetykietować na „pisownia/forma wyrazu widoczna w transkrypcie"; (3) jeśli wymowa jest twardym wymogiem — potrzebne **audio**, nie transkrypt (poza zakresem pipeline'u tekstowego). **To decyzja do podjęcia w planie — koliduje z literalnym brzmieniem FR-011.**

### 10. Warstwa techniczna analizy (OpenAI direct) — zweryfikowane wobec zainstalowanych paczek

Zainstalowane wersje (z `node_modules`): `@openai/agents-realtime@0.13.5` → `@openai/agents-core@0.13.5` → **`openai@6.48.0`** (tranzytywnie); `zod` peer `^3.25 || ^4.0` (projekt na zod v4).

- **API: Responses API** (`POST /v1/responses`), nie Chat Completions — „Responses is recommended for all new projects" (https://developers.openai.com/api/docs/guides/migrate-to-responses). Dla jednorazowej analizy neutralne funkcjonalnie, ale to ścieżka do przodu z helperami `output_parsed`.
- **SDK: oficjalny `openai`**, nie `@openai/agents` (Agents SDK to pętle agentowe — zbędna ceremonia). `openai@6.48.0` jest obecny **tylko tranzytywnie** — **dodać jawnie do `package.json`** (`npm i openai`), bo poleganie na hoistingu jest kruche (pnpm/strict resolution by go nie wystawił). Przypiąć do już rozwiązanej wersji (`^6.48.0`).
- **Structured Outputs — aktualne API**: na Responses schema jest pod **`text.format`** (nie `response_format`). Użyj helpera **`zodTextFormat(schema, name)`** (z `openai/helpers/zod`) + `client.responses.parse(...)` → zwraca `ParsedResponse` z **`.output_parsed`** (zweryfikowane w `node_modules/openai/resources/responses/responses.d.ts:27,78` i `openai/helpers/zod.d.ts`). **zod v4 wspierany** — `InferZodType` w helperze akceptuje kształt v4 (`{ _zod: { output } }`). Strict wymaga `additionalProperties:false` + wszystkie pola `required` → **pola opcjonalne modeluj `.nullable()`, nie `.optional()`**; `z.enum(...)` mapuje się czysto na enumy (dobre dla `cefrLevel` i `category`).

Minimalny kształt wywołania:
```ts
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'

const client = new OpenAI() // czyta OPENAI_API_KEY
const response = await client.responses.parse({
  model: '<MODEL — zweryfikuj przy planie>',
  instructions: 'You are a CEFR examiner. Grade the learner turns only...',
  input: transcript,
  reasoning: { effort: 'low' },   // trzyma latencję < ~10 s (jeśli model reasoningowy)
  text: { format: zodTextFormat(ReportSchema, 'session_report') },
})
const report = response.output_parsed // typowany, zwalidowany schematem
```

- **Model**: agent (research exa) rekomendował domyślnie „gpt-5.6-luna" + `reasoning.effort:'low'`, fallback „gpt-5-mini", floor „gpt-4.1-mini". ⚠️ Nazwy z lipca 2026 **niezweryfikowane** wobec żywych docsów — patrz Open Questions. Zasada trzyma się niezależnie od nazwy: **tani model z lekkim reasoningiem** (transkrypt to kilkaset–~2k tokenów, koszt ułamek centa), z rygorystycznym Structured Outputs; walidować na próbce realnych transkryptów przed zaklepaniem w planie.
- **Gdzie liczyć**: synchroniczny **POST route** zwracający JSON raportu; `export const maxDuration = 30` jako zapas; Fluid Compute domyślnie on. Jeśli kiedyś dołożymy persistencję bez blokowania usera — `after()` z `next/server` (Next 16, stabilne; nie uzależnia trasy dynamicznie). Bez background jobów dla pojedynczego wywołania.

### 11. Rekomendowany kształt schematu raportu (Structured Outputs, zod v4)

```ts
const ReportSchema = z.object({
  cefrLevel: z.enum(['A1','A2','B1','B2','C1','C2']),
  cefrRange: z.object({ low: z.enum([...]), high: z.enum([...]) }), // uczciwe ±1
  confidence: z.number(),                    // miękki sygnał, nie werdykt
  analytic: z.object({                       // pod-poziomy per wymiar
    grammaticalAccuracy: z.enum([...]),
    vocabularyRange: z.enum([...]),
    coherenceCohesion: z.enum([...]),
    interaction: z.enum([...]),
  }),
  justification: z.string(),                 // uzasadnienie PO rozumowaniu
  errors: z.array(z.object({                 // MOŻE być pusta
    quote: z.string(),                       // dosłowny substring transkryptu (tura ucznia)
    correction: z.string(),                  // minimal-edit
    category: z.enum(['grammar','vocabulary','syntax','word-order']), // patrz §9 nt. pronunciation
    explanation: z.string(),
  })),
  suggestions: z.array(z.string()),
  disclaimer: z.string(),
})
```
Każde pole z `description` (materialnie poprawia jakość); `confidence` jako `number` 0–1; enumy zamiast wolnego tekstu, by nie dryfowały. Prior-art: OpenAI cookbook structured-outputs, Fiddler CustomJudge `{label, confidence, reasoning}`.

## Code References

- `src/components/voice-conversation.tsx:91` — `historyRef: RealtimeItem[]` (źródło transkryptu)
- `src/components/voice-conversation.tsx:151-153` — handler `history_updated` (pełna historia)
- `src/components/voice-conversation.tsx:304-322` — placeholder ekranu `ended` (seam raportu S-04)
- `src/components/voice-conversation.tsx:36` — `SESSION_SECONDS = 2*60` (kolizja z guardrail „min 2 min materiału")
- `src/lib/realtime/instructions.ts:3-7,18` — instrukcje wyniesione dla S-04/S-06; brak korekt na żywo
- `src/app/api/realtime/token/route.ts:20-33,35-37,90` — wzorzec API: auth, safety-identifier, no-store
- `src/lib/supabase/server.ts:8-51` — `createClient()` + `requireUser()` (jedyne użycie Supabase = auth)
- `src/lib/topics.ts:1-5` — typ `Topic { id, title, description }`
- `node_modules/@openai/agents-realtime/dist/items.d.ts:5-92` — kształt `RealtimeItem`/`RealtimeMessageItem`
- `node_modules/openai/resources/responses/responses.d.ts:27,78` — `responses.parse().output_parsed`
- `node_modules/openai/helpers/zod.d.ts` — `zodTextFormat`, wsparcie zod v4

## Architecture Insights

- **Materiał do raportu jest darmowym efektem ubocznym S-03** — dwustronna transkrypcja + `history_updated` już produkują wejście; nie potrzeba nagrywania ani nowej telemetrii.
- **S-04 jest z założenia bezstanowe** wobec obecnej sekwencji (pierwsza migracja = S-05). Ścieżka najmniejszego oporu: klient POST-uje zsanityzowany transkrypt → `/api/report` → Responses API + Structured Outputs → render inline w `ended`. Persistencja/archiwum (FR-015) = osobny slice.
- **Dwa niezależne guardraile decydują o zaufaniu**: (1) anty-halucynacja poprawek (cytat+substring, minimal-edit, pusta lista OK, tylko tury ucznia); (2) uczciwość oceny CEFR (±1 pasmo, disclaimer, temp 0). Oba mają mocne pokrycie w literaturze i w PRD.
- **Reużyj wzorca token route'a** (auth defense-in-depth, `OpenAI-Safety-Identifier` = sha256(user.id), `no-store`, 502 na awarie upstream) dla `/api/report`.

## Historical Context (from prior changes)

- `context/changes/first-voice-conversation/plan.md:88,420-432` — S-04 zaplanowane jako podmiana stuba ekranu końcowego; historia trzymana w pamięci jako hand-off; zakaz nagrywania audio.
- `context/changes/first-voice-conversation/research.md:238-239` — limit funkcji 300 s (Hobby) dotyczy trasy analizy S-04 (nie token route'a).
- `context/changes/first-voice-conversation/docs-openai-agents-realtime.md:79,114,132` — transkrypcja obu stron → materiał S-04 bez dodatkowego kosztu.
- `context/foundation/roadmap.md:119-130` — slice S-04 (outcome, PRD refs, unknowns: limit 300 s, risk: halucynowane poprawki).
- `context/foundation/prd.md:57,93-104` — FR-010..FR-014 + Guardraile (min 2 min, brak zmyślonych błędów, kasowanie audio).
- `context/foundation/tech-stack.md:43-47` — OpenAI direct (OpenRouter odrzucony); potwierdza brak warstwy gateway dla analizy.

## Related Research

- `context/changes/first-voice-conversation/research.md` — realtime, transkrypcja, limity funkcji (bezpośredni poprzednik).

## Open Questions

1. **Dokładna nazwa modelu tekstowego OpenAI** — research exa podał „GPT-5.6 (Sol/Terra/Luna)". **Aktualizacja 2026-07-23 (Context7)**: bazowy alias **`gpt-5.6` jest potwierdzony** — pojawia się w oficjalnych przykładach OpenAI API docs (patrz `docs-openai-responses-structured-outputs.md` §7). Warianty `-luna/-terra/-sol` nadal **niepotwierdzone** — zweryfikować alias + pricing na `developers.openai.com/api/docs/models` przy `/10x-plan`. Zasada (tani model + lekki reasoning + strict Structured Outputs) niezależna od nazwy. Owner: plan. By: przed implementacją.
2. **Kategoria „wymowa" (FR-011) przy transkrypcie tekstowym** — literalnie nieosiągalna z tekstu (§9). Decyzja produktowo-techniczna w planie: usunąć / przeetykietować / (poza zakresem) audio. Owner: plan + product.
3. **Kolizja „min 2 min materiału" (Guardrail) z twardym capem sesji 120 s** (`voice-conversation.tsx:36`) — brak pomiaru realnego czasu mowy; próg i sposób pomiaru (czas trwania / liczba tur / liczba słów) do zaprojektowania. Owner: plan.
4. **Persistencja raportu w S-04 vs S-05** — S-04 zaprojektowane bezstanowo; jeśli chcemy zapis/archiwum (FR-015), wciąga pierwszą migrację (RLS) do przodu. Rozstrzygnąć zakres w planie. Owner: plan + product.
5. **Sanityzacja historii przed wysłaniem na serwer** — usunąć base64 audio z `content` (`removeAudioFromContent`) i ograniczyć payload, by trafiał tylko tekst (prywatność + limit 300 s). Owner: plan.
6. **Few-shot kalibracyjny** — czy pozyskać po 1 oznaczonym CEFR przykładzie na poziom (najskuteczniejsza technika u Yancey)? Źródło danych do ustalenia. Owner: plan/product.
