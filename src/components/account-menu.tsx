'use client'

import { useEffect, useRef, useState } from 'react'

import { signOut } from '@/app/auth/actions'

/**
 * Menu konta pod avatarem (S-08): jedyny interaktywny fragment headera, dlatego
 * jedyny 'use client' — reszta (`AppHeader`) zostaje server-componentem. Wzorzec
 * wąskiej wyspy klienckiej jak `delete-session-button.tsx`.
 *
 * Trigger to sam avatar, bez imienia i e-maila (o to chodzi w tej zmianie), więc
 * nazwa użytkownika musi wrócić jako dostępna etykieta przycisku — inaczej
 * kontrolka jest dla czytnika ekranu bezimienna, a użytkownik traci informację,
 * którym kontem jest zalogowany.
 */
export function AccountMenu({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null
  displayName: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Listenery tylko na czas otwartego menu — zamknięte nie trzyma nic na
  // dokumencie. `pointerdown` (nie `click`), żeby zamknięcie wyprzedziło
  // ewentualną nawigację pod kursorem.
  useEffect(() => {
    if (!open) return

    const close = () => {
      setOpen(false)
      triggerRef.current?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        close()
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        aria-label={`Menu konta: ${displayName}`}
        title={`Menu konta: ${displayName}`}
        className="flex h-8 w-8 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        {avatarUrl ? (
          // Avatar z zewnętrznego hosta Google (32 px) — świadomie zwykły
          // <img>, żeby nie konfigurować remotePatterns pod miniaturę.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={32}
            height={32}
            className="rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[.08] text-sm font-medium dark:bg-white/[.145]"
          >
            {(displayName[0] ?? '?').toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          id="account-menu-panel"
          className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-black/[.08] bg-white p-1 shadow-lg dark:border-white/[.145] dark:bg-[#141414]"
        >
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            >
              Wyloguj się
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
