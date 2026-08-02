# README Project Overview — Plan Brief

> Full plan: `context/changes/readme-project-overview/plan.md`

## What & Why

Zastępujemy nietknięty boilerplate `create-next-app` README-em, z którego osoba lub
agent wchodzący do repo dowiaduje się, czym jest **english-talk** i dla kogo, na czym
stoi, jak uruchomić projekt lokalnie od zera i gdzie leży dokumentacja projektowa —
bez pytania autora o cokolwiek. Realizuje roadmap **S-10**, ostatni plasterek MVP.

## Starting Point

`README.md` to 37 linii wygenerowanego szablonu: nazwa `english-talk` nie pada w nim ani
razu. Aplikacja nie startuje bez lokalnego Supabase (Docker), `OPENAI_API_KEY` i migracji,
a logowanie nie zadziała bez własnego Google OAuth clienta — nic z tego nie jest nigdzie
wspomniane. Cała realna dokumentacja żyje w `context/foundation/` i jest niewidoczna z roota.

## Desired End State

`README.md` po polsku, cztery sekcje: *Co to jest i dla kogo* → *Stack* → *Uruchomienie
lokalne* → *Dokumentacja projektu*, z linkiem do produkcji w nagłówku. Czytelnik
przechodzi quickstart od góry do dołu i kończy z działającą aplikacją na
`http://127.0.0.1:3000`, w której potrafi się zalogować, przeprowadzić sesję i zobaczyć
raport.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Język README | Polski | Spójnie z PRD, roadmapą, deploy-planem i komentarzami w kodzie; README linkuje do 5 polskich plików |
| Screeny / link do produkcji | Sam link, bez obrazków | UI zmieniało się w S-08 i S-09 — screeny starzeją się najszybciej; link to najtańszy dowód, że projekt żyje |
| Głębokość quickstartu | Pełny, w README | Outcome S-10 mówi wprost „bez pytania autora"; `deploy-plan.md` to dziennik decyzji, nie instrukcja |
| Zakres sekcji | Minimum (4 sekcje) | Risk S-10: README powielający PRD i `tech-stack.md` rozjedzie się z nimi przy kolejnym plasterku |
| Google OAuth | Kroki w Google Cloud Console | Bez tego czytelnik utknie na ekranie logowania — `src/proxy.ts` chroni każdy route poza `/login` |
| Poprzeczka weryfikacji | Audyt zgodności + smoke test | Łapie zmyślone fakty i złą kolejność bez godziny setupu od zera |

## Scope

**In scope:** treść `README.md` w całości; tabela wymaganych zmiennych (tylko nazwy);
procedura Google OAuth z lokalnym redirect URI; mapa dokumentacji z linkami relatywnymi;
audyt zgodności i smoke test.

**Out of scope:** zrzuty ekranu i pliki binarne; sekcja troubleshooting; wersja
angielska/dwujęzyczna; kopiowanie Non-Goals z PRD i tabeli statusów z roadmapy; zmiany
w kodzie, `package.json`, `supabase/config.toml` i `context/foundation/`; oznaczenie
S-10 jako `done` (należy do rytuału zamknięcia).

## Architecture / Approach

Jedno przejście piszące całą treść (README jest spójnym dokumentem — pisanie po kawałku
produkuje niespójny ton), potem bramka weryfikacyjna odpowiadająca na dwa różne ryzyka:
**audyt automatyczny** łapie zmyślone fakty (nieistniejąca nazwa zmiennej, martwy link,
komenda spoza `package.json`), **smoke test** łapie złą kolejność i braki proceduralne
(np. `db reset` przed `supabase start`). Źródła treści: `prd.md` (produkt),
`tech-stack.md` (stack), `deploy-plan.md:85-91` + `.env.example` + `supabase/config.toml`
(quickstart) — wszystkie parafrazowane i linkowane, nie kopiowane.

## Phases at a Glance

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Napisanie README + audyt zgodności | Kompletny `README.md` (4 sekcje, pełny quickstart, procedura OAuth) zweryfikowany pod kątem zmyślonych nazw, komend i linków | Parafraza przechodzi w kopiowanie PRD → README rozjedzie się przy kolejnym plasterku |
| 2. Smoke test quickstartu i korekty | Procedura zgodna z rzeczywistością: kolejność kroków, brakujące kroki, restart stacka po zmianie zmiennych OAuth | Smoke test biegnie na środowisku autora — nie wykryje kroku brakującego dlatego, że u autora jest już zrobiony |

**Prerequisites:** brak blokad (S-10 nie ma prerequisites). Do Fazy 2 potrzebny działający
Docker Desktop i istniejący `.env.local`.
**Estimated effort:** ~1 sesja, dwie fazy; Faza 2 to głównie czas oczekiwania na
`supabase start` i `db reset`.

## Open Risks & Assumptions

- **Redirect URI to najczęstszy punkt cichej porażki**: intuicyjne
  `http://127.0.0.1:3000/auth/callback` jest błędne — Google Cloud Console wymaga
  `http://127.0.0.1:54321/auth/v1/callback` (lokalny GoTrue). Faza 2 weryfikuje to
  realnym logowaniem.
- **Smoke test na środowisku autora ma ślepą plamkę** (Docker, konto Google Cloud już
  istnieją). Rekompensata: każdy taki krok musi być jawnie wypisany w „Wymaganiach
  wstępnych", nawet jeśli test go nie wykona.
- **Koszt utrzymania**: sekcja Stack wymienia modele (`gpt-realtime-2.1`,
  `gpt-5.6-luna`) — rozjedzie się przy zmianie modelu. Świadomie przyjęte; wersje patch
  celowo pominięte na rzecz odesłania do `package.json`.
- **Założenie**: `english-talk-black.vercel.app` pozostaje adresem produkcyjnym
  (potwierdzone 14 wystąpieniami w `context/`).

## Success Criteria (Summary)

- Osoba wchodząca pierwszy raz do repo wie po 30 sekundach, czym jest english-talk i dla kogo
- Przechodzi quickstart od góry do dołu i kończy z działającą, zalogowaną aplikacją lokalnie
- Trafia do `context/foundation/` po szczegóły, zamiast pytać autora
- Zero wartości sekretów w pliku; zero zmyślonych nazw zmiennych, komend i linków
