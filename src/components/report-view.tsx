import type { ReactNode } from 'react'

import type { Report } from '@/lib/report/schema'

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

const WIDE_CARD_CLASS =
  'relative z-10 flex w-full max-w-xl flex-col gap-5 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 text-left backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70'

const MUTED_TEXT_CLASS = 'text-sm leading-6 text-zinc-600 dark:text-zinc-400'

/**
 * Czysto prezentacyjny rdzeń raportu (S-05): nagłówek CEFR + uzasadnienie,
 * błędy pogrupowane po kategoriach, sugestie, disclaimer i transkrypt w
 * <details>. Bez akcji i bez stanu — reużywany na ekranie końcowym (S-04, ze
 * slotem `footer` na „Nowa sesja") i w widoku archiwum (/archive/[id], bez
 * footera). Bez 'use client' — renderowalny po stronie serwera.
 *
 * `announce` włącza aria-live na korzeniu: na ekranie końcowym React reużywa
 * ten sam węzeł div między fazami, więc region live ogłasza przejście
 * spinner → raport. W statycznym archiwum jest zbędny.
 */
export function ReportView({
  report,
  transcriptLines,
  announce = false,
  footer,
}: {
  report: Report
  transcriptLines: string[]
  announce?: boolean
  footer?: ReactNode
}) {
  const presentCategories = CATEGORY_ORDER.filter((category) =>
    report.errors.some((error) => error.category === category),
  )

  return (
    <div
      {...(announce ? { 'aria-live': 'polite' as const } : {})}
      className={WIDE_CARD_CLASS}
    >
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

      {footer}
    </div>
  )
}
