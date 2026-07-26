import Link from 'next/link'

import { AccountMenu } from '@/components/account-menu'

/**
 * Wspólny header dla zalogowanej części aplikacji (S-08): logo prowadzące na "/"
 * i menu konta pod avatarem — nic więcej. Bez 'use client': interaktywny jest
 * wyłącznie `AccountMenu`, więc strony nie są wciągane do bundla klienckiego.
 *
 * Przyjmuje gotowe propsy, nie `User` — zawężanie `user_metadata` żyje w jednym
 * miejscu, w layoucie grupy `(app)`.
 */
export function AppHeader({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null
  displayName: string
}) {
  return (
    <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-70"
      >
        english-talk
      </Link>
      <AccountMenu avatarUrl={avatarUrl} displayName={displayName} />
    </header>
  )
}
