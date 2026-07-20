import { signOut } from '@/app/auth/actions'
import { requireUser } from '@/lib/supabase/server'

export default async function Home() {
  const user = await requireUser()

  const avatarUrl =
    typeof user.user_metadata?.avatar_url === 'string'
      ? user.user_metadata.avatar_url
      : null
  const displayName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : (user.email ?? 'Zalogowany użytkownik')

  return (
    <div className="flex flex-1 flex-col font-sans">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <span className="text-lg font-semibold tracking-tight">
          english-talk
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
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
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium leading-5">
                {displayName}
              </span>
              {user.email && displayName !== user.email && (
                <span className="text-xs leading-4 text-zinc-600 dark:text-zinc-400">
                  {user.email}
                </span>
              )}
            </div>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="h-9 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Wyloguj się
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-black/[.16] px-8 py-12 dark:border-white/[.24]">
          <h1 className="text-xl font-semibold tracking-tight">
            Rozpocznij sesję
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Tu wkrótce zaczniesz rozmowę po angielsku — propozycja tematu
            pojawi się w następnym kroku budowy aplikacji.
          </p>
        </div>
      </main>
    </div>
  )
}
