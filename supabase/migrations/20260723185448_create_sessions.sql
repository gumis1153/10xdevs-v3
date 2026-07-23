-- Pierwsza tabela w projekcie: archiwum ukończonych sesji (S-05).
-- Jeden wiersz = jedna oceniona sesja: metadane pod listę + pełny raport i
-- transkrypt jako JSONB (czytane w całości; brak analityki w v1 — Non-Goal v2).
-- RLS włączone od pierwszej tabeli (deploy-plan runbook #4); forward-only (#6).

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  topic_id text not null,
  topic_title text not null,
  cefr_level text not null,
  error_count integer not null,
  report jsonb not null,
  transcript jsonb not null
);

-- Pokrywa zapytanie listy archiwum: własne wiersze, najnowsze najpierw.
create index sessions_user_created_idx
  on public.sessions (user_id, created_at desc);

alter table public.sessions enable row level security;

-- RLS filtruje wiersze, ale rola API nadal potrzebuje uprawnień do tabeli.
-- Bez tego grantu każdy zapis/odczyt kończy się „permission denied". Tylko
-- authenticated (nie anon) i tylko operacje, dla których mamy polityki
-- (brak UPDATE — brak grantu update).
grant select, insert, delete on public.sessions to authenticated;

-- Każdy zalogowany użytkownik widzi/wstawia/usuwa wyłącznie własne wiersze.
create policy "sessions_select_own" on public.sessions
  for select to authenticated using (auth.uid() = user_id);

create policy "sessions_insert_own" on public.sessions
  for insert to authenticated with check (auth.uid() = user_id);

create policy "sessions_delete_own" on public.sessions
  for delete to authenticated using (auth.uid() = user_id);
