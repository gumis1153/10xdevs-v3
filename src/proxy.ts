import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })
  // Nagłówki, które @supabase/ssr każe ustawić obok Set-Cookie (anty-cache) —
  // zbierane osobno, żeby dało się je przenieść także na odpowiedzi redirect.
  const sessionHeaders = new Headers()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value)
            sessionHeaders.set(key, value)
          })
        },
      },
    }
  )

  // Nie wstawiać kodu między createServerClient a auth.getUser() —
  // grozi desynchronizacją ciasteczek sesji (patrz plan, Critical Details).
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser()

  // Fail-closed (brak usera → /login) jest OK, ale awaria Supabase musi
  // zostawić ślad. Brak sesji (anonimowy request) to stan normalny — nie loguj.
  if (getUserError && getUserError.name !== 'AuthSessionMissingError') {
    console.error('proxy getUser failed:', getUserError.message)
  }

  const { pathname } = request.nextUrl

  if (!user && pathname !== '/login' && !pathname.startsWith('/auth')) {
    // Konsumenci /api/* to fetch(), nie nawigująca przeglądarka — redirect
    // 307 na /login podałby im HTML; zwracamy 401 JSON (route'y i tak
    // weryfikują auth same — to defense-in-depth, nie jedyna bramka).
    if (pathname.startsWith('/api')) {
      return withSessionCookies(
        NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
        supabaseResponse,
        sessionHeaders
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return withSessionCookies(
      NextResponse.redirect(url),
      supabaseResponse,
      sessionHeaders
    )
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return withSessionCookies(
      NextResponse.redirect(url),
      supabaseResponse,
      sessionHeaders
    )
  }

  return supabaseResponse
}

// Przy zwracaniu innej odpowiedzi niż supabaseResponse trzeba przenieść
// odświeżone ciasteczka sesji i towarzyszące im nagłówki anty-cache —
// inaczej przeglądarka i serwer się rozjadą.
function withSessionCookies(
  response: NextResponse,
  supabaseResponse: NextResponse,
  sessionHeaders: Headers
) {
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie)
  })
  sessionHeaders.forEach((value, key) => {
    response.headers.set(key, value)
  })
  return response
}

export const config = {
  // Uwaga: wzorzec wyłącza KAŻDĄ ścieżkę kończącą się rozszerzeniem obrazka —
  // przyszły dynamiczny route (np. /report.png) ominąłby bramkę sesji.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
