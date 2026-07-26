import { AppHeader } from '@/components/app-header'
import { requireUser } from '@/lib/supabase/server'

/**
 * Layout zalogowanej części aplikacji (S-08). Header renderuje się tutaj raz,
 * zamiast być powielany w każdej stronie. `/login`, `/auth` i `/api` leżą poza
 * grupą `(app)`, więc nie mogą go odziedziczyć.
 *
 * Nawiasy w nazwie folderu wyłączają go z URL-a — ścieżki `/`, `/archive`
 * i `/archive/[id]` są bez zmian. `requireUser()` jest tu bramką sesji dla całej
 * grupy; strony pod nią mają własne wywołanie (defense-in-depth), a memoizacja
 * w `getUser()` sprawia, że kosztuje to jedno odpytanie Supabase na żądanie.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
      <AppHeader avatarUrl={avatarUrl} displayName={displayName} />
      {children}
    </div>
  )
}
