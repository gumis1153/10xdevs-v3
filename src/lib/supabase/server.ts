import 'server-only'

import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components nie mogą zapisywać ciasteczek — odświeżanie
            // sesji należy do src/proxy.ts.
          }
        },
      },
    }
  )
}

/**
 * Odczyt zalogowanego użytkownika, memoizowany w obrębie jednego żądania.
 * `auth.getUser()` to realne odpytanie Supabase Auth (walidacja JWT), a od S-08
 * usera potrzebuje zarówno layout grupy `(app)` (avatar w headerze), jak i każda
 * strona pod nim (własna bramka sesji) — bez `cache()` byłyby to dwa okrążenia
 * na jedno renderowanie. `cache()` żyje tylko w zakresie jednego żądania, więc
 * nie ma tu współdzielenia między użytkownikami.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Brak sesji to stan normalny (bramki wyżej robią redirect); loguj tylko
  // realne awarie.
  if (error && error.name !== 'AuthSessionMissingError') {
    console.error('getUser failed:', error.message)
  }

  return user
})

/**
 * Bramka sesji dla stron i Server Actions. Świadomie cienka: memoizowany jest
 * sam odczyt, nie przepływ sterowania — `redirect()` zostaje poza `cache()`,
 * żeby nigdy nie trafił do zapamiętanej wartości.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return user
}
