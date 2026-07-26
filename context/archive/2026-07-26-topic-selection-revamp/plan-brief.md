# Topic Selection Revamp — Plan Brief

> Full plan: `context/changes/topic-selection-revamp/plan.md`

## What & Why

Ekran startu sesji pokazuje dziś jeden wylosowany temat. S-09 zmienia to na wybór spośród
**3 zbalansowanych tematów** i rozszerza pulę z 10 do **30** (15 „praca" / 15 „poza pracą").
Cel: dać użytkownikowi realny, ale nadal lekki wybór (mniej decision fatigue niż pełna lista,
więcej sprawczości niż pojedyncza propozycja) i pokryć konteksty poza pracą, których persona
też potrzebuje.

## Starting Point

`src/lib/topics.ts` ma 10 tematów (typ `{id, title, description}`) i `drawTopic(excludeId)`
losujące jeden. `session-start.tsx` pokazuje go na jednej karcie z przyciskami „Rozpocznij
rozmowę" / „Inny temat". Temat jest zdenormalizowany w tabeli `sessions` (snapshot), więc
zmiana puli nie wymaga migracji DB.

## Desired End State

Na starcie użytkownik widzi 3 karty (tytuł + pełny opis), zawsze z ≥1 tematem z każdej
kategorii. Klik karty od razu startuje rozmowę na tym temacie. „Inne tematy" losuje nowy
zestaw 3 (bez limitu); „Nowa sesja" po zakończeniu wraca do świeżego zestawu 3.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Dobór 3 z puli | Zbalansowany: ≥1 „work" i ≥1 „life", 3. losowy | Podział 50/50 puli jest widoczny w każdym zestawie | Plan |
| UX wyboru | Klik karty = wybór + start | Jeden gest = wybór i wymagany gest getUserMedia (Safari), min. tarcia | Plan |
| Re-roll | Nowy zestaw 3, bez limitu | Spójne z PRD (limit skipów = v2, Open Q2) | Plan |
| Treść tematów | Autor generuje 30 do przeglądu | Zachowuje 10 zwalidowanych + 20 nowych, szybkie | Plan |
| Układ kart | Tytuł + pełny opis na każdej | Świadomy wybór; brak ukrytej treści (hover nie działa na mobile) | Plan |
| Model danych | Pole `category: 'work' \| 'life'` w `Topic` | Addytywne, nie persystowane, bez migracji DB | Plan |

## Scope

**In scope:** typ `Topic` + kategoria; pula 30 (15/15); `drawTopicSet()`; przeprojektowanie
ekranu startu na 3 karty + re-roll zestawu; aktualizacja `page.tsx`.

**Out of scope:** tor głosowy, API raportu, DB/migracje, limit losowań, free-form/wybór poziomu,
przepisywanie 10 istniejących tematów, testy automatyczne.

## Architecture / Approach

Dwie fazy: (1) dane + logika w `src/lib/topics.ts` (weryfikowalne przez build/lint w izolacji),
(2) UI w `src/components/session-start.tsx` + `src/app/page.tsx`. Interfejs `VoiceConversation`
(pojedynczy `Topic`) nie zmienia się → zerowe ryzyko regresu w torze głosowym.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dane i logika doboru | Typ z kategorią, pula 30 (15/15), `drawTopicSet()` z gwarancją ≥1/kategoria | Treść i podział 30 tematów do akceptacji |
| 2. Ekran wyboru | 3 karty klik=start, re-roll zestawu, świeży zestaw po „Nowej sesji" | Rozbicie gestu Safari przy zmianie z „przycisk" na „klik karty" |

**Prerequisites:** S-02 (istniejące `topics.ts` i mechanika losowania) — spełnione.
**Estimated effort:** ~1 sesja, 2 fazy (bulk to treść 20 nowych tematów, technicznie lekkie).

## Open Risks & Assumptions

- Klik karty musi pozostać synchronicznym gestem (przed `await`), inaczej Safari zablokuje mikrofon.
- Podział „work/life" 15/15 zależy od kategoryzacji istniejących 10 (9 „work" + `ordering-coffee` „life`) — reszta domknięta 20 nowymi (6 „work" + 14 „life").

## Success Criteria (Summary)

- Ekran startu pokazuje 3 karty z oboma kontekstami; klik startuje rozmowę z działającym mikrofonem.
- „Inne tematy" i „Nowa sesja" dają nowe zestawy 3 bez powtórzeń względem poprzedniego.
- Wybrany temat trafia do rozmowy i archiwum bez regresu; `build` i `lint` przechodzą.
