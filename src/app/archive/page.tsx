import Link from 'next/link'

import { createClient, requireUser } from '@/lib/supabase/server'

// Świeże dane przy każdym wejściu — archiwum ma pokazywać właśnie zapisane
// sesje, więc nie prerenderujemy statycznie.
export const dynamic = 'force-dynamic'

type SessionRow = {
  id: string
  created_at: string
  topic_title: string
  cefr_level: string
  error_count: number
}

const DATE_FORMAT = new Intl.DateTimeFormat('pl-PL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

// Polska odmiana rzeczownika „błąd" po liczebniku.
function formatErrorCount(count: number): string {
  if (count === 0) return 'brak błędów'
  if (count === 1) return '1 błąd'
  const mod10 = count % 10
  const mod100 = count % 100
  const few = mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)
  return `${count} ${few ? 'błędy' : 'błędów'}`
}

const CARD_LINK_CLASS =
  'flex items-center justify-between gap-4 rounded-xl border border-black/[.08] px-5 py-4 transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.04]'

/**
 * Archiwum sesji (S-05, FR-015): lista ukończonych sesji zalogowanego
 * użytkownika, najnowsze najpierw. RLS zawęża wynik do właściciela — bez
 * ręcznego filtra po user_id. Każdy wiersz linkuje do szczegółu.
 */
export default async function ArchivePage() {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('id, created_at, topic_title, cefr_level, error_count')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('archive list query failed:', error.message)
  }

  const sessions = (data ?? []) as SessionRow[]

  return (
    <div className="flex flex-1 flex-col font-sans">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <span className="text-lg font-semibold tracking-tight">english-talk</span>
        <Link
          href="/"
          className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium leading-9 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Nowa sesja
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Archiwum sesji</h1>

        {error ? (
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Nie udało się wczytać archiwum. Spróbuj odświeżyć stronę.
          </p>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Nie masz jeszcze zapisanych sesji. Odbądź rozmowę, a po analizie
              pojawi się tutaj.
            </p>
            <Link
              href="/"
              className="self-start text-sm font-medium underline underline-offset-4"
            >
              Rozpocznij pierwszą sesję
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link href={`/archive/${session.id}`} className={CARD_LINK_CLASS}>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{session.topic_title}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {DATE_FORMAT.format(new Date(session.created_at))} ·{' '}
                      {formatErrorCount(session.error_count)}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium dark:border-white/[.145]">
                    {session.cefr_level}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
