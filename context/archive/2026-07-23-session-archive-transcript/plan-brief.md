# Archiwum sesji z transkrypcją (S-05) — Plan Brief

> Full plan: `context/changes/session-archive-transcript/plan.md`

## What & Why

Pierwsza warstwa persystencji w projekcie: udane rozmowy zapisują się trwale i
użytkownik ma do nich wracać. Zamyka FR-014 (transkrypcja po sesji w trwałym
widoku) i FR-015 (archiwum poprzednich sesji) — secondary Success Criteria z
PRD. Archiwum działa jako motywator (widoczny progres) nawet bez adaptacji
między sesjami.

## Starting Point

Raport (S-04) jest w pełni bezstanowy: `voice-conversation.tsx` trzyma historię
w pamięci, POST-uje `{ turns }` do `/api/report`, renderuje `Report` inline w
`SessionReport` i gubi wszystko przy „Nowa sesja". Supabase jest auth-only —
zero migracji, zero tabel. Gotowe do reużycia: kontrakt `ReportSchema`, klient
serwerowy `createClient()` + `requireUser()`, bramka auth w `proxy.ts`, wzorzec
Server Action `signOut`. Routing to jedna strona `/`.

## Desired End State

Po udanej sesji jeden wiersz `sessions` (temat, CEFR, liczba błędów, pełny
raport + transkrypt) jest zapisany pod tożsamością użytkownika. Header ma link
„Archiwum" → `/archive` (lista: data, temat, CEFR, liczba błędów, najnowsze na
górze) → `/archive/[id]` (pełny raport w tym samym wyglądzie co ekran końcowy +
transkrypt). Użytkownik może usunąć sesję z potwierdzeniem. Widzi wyłącznie
własne sesje; cudza/nieistniejąca → 404.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trigger zapisu | Serwerowo w `/api/report` po bramce groundingu | Serwer ma już `user` + raport + tury; brak drugiego endpointu i klienta przeglądarkowego Supabase. | Plan |
| Zakres archiwum | Tylko sesje z pełnym raportem | Spójne z „czyste archiwum" i komunikatem „za mało materiału" — sesje bez oceny nie mają czego archiwizować. | Plan |
| Kształt schematu | Jedna tabela `sessions` + `report`/`transcript` JSONB | Czytane w całości, small data, brak analityki w v1 (progres CEFR to Non-Goal v2); jedna polityka RLS. | Plan |
| UX awarii zapisu | Best-effort, cichy — raport i tak wraca | Główna wartość (raport, US-01) nie może paść przez nice-to-have (archiwum). | Plan |
| Nawigacja | `/archive` + `/archive/[id]`, link w headerze | Linkowalny URL na sesję; szczegół ładuje swój wiersz; naturalne miejsce na `requireUser()` + RLS. | Plan |
| Zawartość listy | Data + temat + CEFR + liczba błędów, malejąco po dacie, bez paginacji | CEFR i liczba błędów to sygnały progresu; brak paginacji OK przy small data. | Plan |
| Usuwanie | W scope v1 — Server Action + potwierdzenie + polityka RLS delete | Wybór użytkownika (wbrew rekomendacji „read-only") — pełna kontrola nad danymi. | Plan |
| Widok szczegółu | Wydzielony prezentacyjny `ReportView`, reużyty w obu miejscach | Zero duplikacji layoutu raportu; szczegół może być server-component. | Plan |
| Ścieżka bezpieczeństwa zapisu | INSERT user-scoped klientem + RLS `with check` | Nie potrzeba service-role key; RLS domyka własność od pierwszej tabeli. | Plan |

## Scope

**In scope:** pierwsza migracja `sessions` + RLS (SELECT/INSERT/DELETE własnych
wierszy); rozszerzenie payloadu `/api/report` o `topic`; best-effort INSERT w
route raportu; przekazanie tematu z klienta; wydzielenie `ReportView`; route'y
`/archive` i `/archive/[id]`; usuwanie przez Server Action z potwierdzeniem;
link „Archiwum" w headerze.

**Out of scope:** persystencja sesji „za mało materiału"/błędnych; paginacja;
tracking progresu / wykres CEFR (v2); edycja sesji; retry zapisu; zmiany w
torze audio, instrukcjach rozmowy i logice oceny.

## Architecture / Approach

Faza 1 (dane): `POST /api/report` po bramce groundingu wstawia wiersz
user-scoped klientem (RLS) w `try/catch` best-effort, przed zwrotem raportu;
payload rośnie o `topic`. Faza 2 (UI): server components `/archive` i
`/archive/[id]` czytają przez RLS (bez ręcznego filtra `user_id`), reużywają
wydzielony `ReportView`; usuwanie to Server Action `deleteSession` + `redirect`
wzorem `signOut`, z klienckim przyciskiem potwierdzenia.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Warstwa danych | Migracja + RLS + best-effort zapis udanej sesji z `/api/report` | Poprawność RLS/schematu przy migracjach forward-only; bramka ludzka `db push` |
| 2. UI archiwum | `/archive`, `/archive/[id]`, usuwanie, link w headerze, `ReportView` | Refaktor `SessionReport` bez regresji ekranu końcowego S-04 |

**Prerequisites:** S-01 (auth — done) i S-04 (raport + transkrypt — done);
praca na branchu + PR (protect-master); bramka ludzka `supabase login` + `link`
+ `db push` przed testem na preview.
**Estimated effort:** ~2 sesje (po jednej na fazę), każda domknięta
preview-deploymentem i weryfikacją manualną.

## Open Risks & Assumptions

- Migracje forward-only → schemat trudno cofnąć; RLS musi być poprawne od
  pierwszej tabeli (mitygacja: pełny SQL w planie, weryfikacja izolacji
  cross-user w kryteriach manualnych).
- `db push` to bramka ludzka — preview/prod nie zobaczą tabeli, dopóki człowiek
  nie wykona pushu; implementacja zatrzymuje się przed nim.
- Best-effort zapis oznacza możliwość pojedynczego utraconego wiersza przy
  awarii DB (świadomie zaakceptowane — archiwum to nice-to-have).

## Success Criteria (Summary)

- Ukończenie udanej sesji tworzy dokładnie jeden wiersz; „za mało materiału" i
  błędy analizy nie tworzą wiersza; awaria zapisu nie psuje raportu.
- Użytkownik widzi z headera listę własnych sesji i otwiera pełny raport +
  transkrypt każdej z nich; cudza sesja → 404.
- Usunięcie sesji (z potwierdzeniem) znika z listy i z DB.
