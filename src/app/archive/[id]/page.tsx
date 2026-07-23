import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DeleteSessionButton } from '@/app/archive/delete-session-button'
import { ReportView } from '@/components/report-view'
import type { Report, Turn } from '@/lib/report/schema'
import { createClient, requireUser } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SessionDetail = {
  id: string
  created_at: string
  topic_title: string
  report: Report
  transcript: Turn[]
}

const DATE_FORMAT = new Intl.DateTimeFormat('pl-PL', {
  dateStyle: 'long',
  timeStyle: 'short',
})

/**
 * Szczegół zarchiwizowanej sesji (S-05, FR-014/FR-015): nagłówek (temat, data),
 * reużyty rdzeń raportu (ReportView) z transkryptem oraz usuwanie. RLS zwraca
 * null dla cudzego wiersza — cudze lub nieistniejące id daje 404.
 */
export default async function ArchiveSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sessions')
    .select('id, created_at, topic_title, report, transcript')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    // Także niepoprawny UUID w URL wpada tutaj — traktujemy jak brak zasobu.
    console.error('archive detail query failed:', error.message)
    notFound()
  }
  if (!data) {
    notFound()
  }

  const session = data as SessionDetail
  const transcriptLines = session.transcript.map(
    (turn) =>
      `${turn.speaker === 'learner' ? 'Learner' : 'Tutor'}: ${turn.text}`,
  )

  return (
    <div className="flex flex-1 flex-col font-sans">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <span className="text-lg font-semibold tracking-tight">english-talk</span>
        <Link
          href="/archive"
          className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium leading-9 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          ← Archiwum
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-stretch gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {session.topic_title}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {DATE_FORMAT.format(new Date(session.created_at))}
          </p>
        </div>

        <ReportView
          report={session.report}
          transcriptLines={transcriptLines}
        />

        <DeleteSessionButton id={session.id} />
      </main>
    </div>
  )
}
