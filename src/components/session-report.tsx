import type { Report } from '@/lib/report/schema'
import { ReportView } from '@/components/report-view'

/** Wynik fazy raportu na ekranie końcowym — maszyna stanów S-04. */
export type ReportOutcome =
  | { phase: 'analyzing' }
  | { phase: 'report'; report: Report }
  | { phase: 'insufficient' }
  | { phase: 'error' }

// Lokalne odpowiedniki klas kart/przycisków z voice-conversation.tsx
// (duplikacja zamiast importu — uniknięcie cyklu modułów). Wariant szeroki
// z treścią raportu żyje teraz w ReportView.
const CARD_CLASS =
  'relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70'

const SECONDARY_BUTTON_CLASS =
  'h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]'

const PRIMARY_BUTTON_CLASS =
  'h-11 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85'

const MUTED_TEXT_CLASS = 'text-sm leading-6 text-zinc-600 dark:text-zinc-400'

/**
 * Prezentacja ekranu końcowego S-04 (FR-010–FR-014): cztery wyniki fazy
 * raportu — analiza w toku, raport CEFR, za mało materiału, błąd z retry.
 * Czysto prezentacyjny; cykl życia żądania trzyma voice-conversation.tsx.
 */
export function SessionReport({
  outcome,
  transcriptLines,
  onRetry,
  onNewSession,
}: {
  outcome: ReportOutcome
  transcriptLines: string[]
  onRetry: () => void
  onNewSession: () => void
}) {
  // aria-live siedzi na korzeniu każdego wyniku: React reużywa ten sam
  // węzeł div między fazami, więc region live trwa i czytnik ekranu
  // ogłasza także moment, gdy spinner zmienia się w raport / błąd.
  if (outcome.phase === 'analyzing') {
    return (
      <div aria-live="polite" className={CARD_CLASS}>
        <div
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
        />
        <p className={MUTED_TEXT_CLASS}>Analizuję rozmowę…</p>
      </div>
    )
  }

  if (outcome.phase === 'insufficient') {
    return (
      <div aria-live="polite" className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold tracking-tight">
          Za mało materiału do analizy
        </h1>
        <p className={`${MUTED_TEXT_CLASS} text-center`}>
          Rozmowa była zbyt krótka, żeby rzetelnie ocenić Twój poziom języka.
          Zacznij nową sesję i porozmawiaj chwilę dłużej.
        </p>
        <button
          type="button"
          onClick={onNewSession}
          className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          Nowa sesja
        </button>
      </div>
    )
  }

  if (outcome.phase === 'error') {
    return (
      <div aria-live="polite" className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold tracking-tight">
          Analiza nie powiodła się
        </h1>
        <p className={`${MUTED_TEXT_CLASS} text-center`}>
          Nie udało się przeanalizować rozmowy. Transkrypcja jest wciąż w
          pamięci — możesz spróbować ponownie.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            className={PRIMARY_BUTTON_CLASS}
          >
            Spróbuj ponownie
          </button>
          <button
            type="button"
            onClick={onNewSession}
            className={SECONDARY_BUTTON_CLASS}
          >
            Nowa sesja
          </button>
        </div>
      </div>
    )
  }

  return (
    <ReportView
      report={outcome.report}
      transcriptLines={transcriptLines}
      announce
      footer={
        <button
          type="button"
          onClick={onNewSession}
          className={`self-center ${PRIMARY_BUTTON_CLASS}`}
        >
          Nowa sesja
        </button>
      }
    />
  )
}
