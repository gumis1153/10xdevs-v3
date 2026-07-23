'use client'

import { deleteSession } from '@/app/archive/actions'

/**
 * Przycisk usuwania sesji z potwierdzeniem. Reszta widoku szczegółu pozostaje
 * server-component — kliencki jest tylko ten fragment, bo potrzebuje
 * window.confirm przed wysłaniem formularza (Server Action `deleteSession`
 * z zbindowanym id). Brak potwierdzenia → anulowanie wysyłki.
 */
export function DeleteSessionButton({ id }: { id: string }) {
  return (
    <form
      action={deleteSession.bind(null, id)}
      onSubmit={(event) => {
        if (
          !window.confirm(
            'Usunąć tę sesję z archiwum? Tej operacji nie można cofnąć.',
          )
        ) {
          event.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className="h-11 rounded-full border border-solid border-red-600/40 px-6 text-sm font-medium text-red-600 transition-colors hover:bg-red-600/[.06] dark:border-red-400/40 dark:text-red-400 dark:hover:bg-red-400/[.08]"
      >
        Usuń sesję
      </button>
    </form>
  )
}
