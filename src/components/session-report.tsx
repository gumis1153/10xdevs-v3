import type { Report } from '@/lib/report/schema'

/** Wynik fazy raportu na ekranie końcowym — maszyna stanów S-04. */
export type ReportOutcome =
  | { phase: 'analyzing' }
  | { phase: 'report'; report: Report }
  | { phase: 'insufficient' }
  | { phase: 'error' }

type ErrorCategory = Report['errors'][number]['category']

const CATEGORY_LABELS: Record<ErrorCategory, string> = {
  grammar: 'Gramatyka',
  vocabulary: 'Słownictwo',
  syntax: 'Składnia',
  'word-order': 'Szyk zdania',
}

const CATEGORY_ORDER: readonly ErrorCategory[] = [
  'grammar',
  'vocabulary',
  'syntax',
  'word-order',
]

// Lokalne odpowiedniki klas kart/przycisków z voice-conversation.tsx
// (duplikacja zamiast importu — uniknięcie cyklu modułów); wariant szeroki
// z tekstem do lewej mieści treść raportu.
const CARD_CLASS =
  'relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70'

const WIDE_CARD_CLASS =
  'relative z-10 flex w-full max-w-xl flex-col gap-5 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 text-left backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70'

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
  if (outcome.phase === 'analyzing') {
    return (
      <div className={CARD_CLASS}>
        <div
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
        />
        <p aria-live="polite" className={MUTED_TEXT_CLASS}>
          Analizuję rozmowę…
        </p>
      </div>
    )
  }

  if (outcome.phase === 'insufficient') {
    return (
      <div className={CARD_CLASS}>
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
      <div className={CARD_CLASS}>
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

  const { report } = outcome
  const presentCategories = CATEGORY_ORDER.filter((category) =>
    report.errors.some((error) => error.category === category),
  )

  return (
    <div className={WIDE_CARD_CLASS}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Raport z rozmowy
        </h1>
        <p className="text-lg font-medium">
          Poziom: {report.cefrLevel}{' '}
          <span className="font-normal text-zinc-600 dark:text-zinc-400">
            (pasmo {report.cefrRange.low}–{report.cefrRange.high})
          </span>
        </p>
        <p className={MUTED_TEXT_CLASS}>{report.justification}</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Błędy i poprawki</h2>
        {report.errors.length === 0 ? (
          <p className={MUTED_TEXT_CLASS}>
            Świetna robota — w tej rozmowie nie znaleźliśmy żadnych błędów
            wartych poprawy.
          </p>
        ) : (
          presentCategories.map((category) => (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {CATEGORY_LABELS[category]}
              </h3>
              <ul className="flex flex-col gap-3">
                {report.errors
                  .filter((error) => error.category === category)
                  .map((error, index) => (
                    <li
                      key={`${category}-${index}`}
                      className="rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
                    >
                      <p className="text-sm leading-6">
                        <span className="text-zinc-500 line-through dark:text-zinc-400">
                          {error.quote}
                        </span>{' '}
                        → <span className="font-medium">{error.correction}</span>
                      </p>
                      <p className={MUTED_TEXT_CLASS}>{error.explanation}</p>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {report.suggestions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Co ćwiczyć dalej</h2>
          <ul className={`list-disc pl-5 ${MUTED_TEXT_CLASS}`}>
            {report.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-500">
        {report.disclaimer}
      </p>

      <details className="group">
        <summary className="cursor-pointer select-none text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
          Pokaż transkrypcję
        </summary>
        <ul className={`mt-3 flex flex-col gap-2 ${MUTED_TEXT_CLASS}`}>
          {transcriptLines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </details>

      <button
        type="button"
        onClick={onNewSession}
        className={`self-center ${PRIMARY_BUTTON_CLASS}`}
      >
        Nowa sesja
      </button>
    </div>
  )
}
