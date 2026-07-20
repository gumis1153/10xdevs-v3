import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')

  // Guard przed open redirectem — akceptujemy tylko ścieżki względne.
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) {
    next = '/'
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // Lokalnie nie ma load balancera — origin jest wiarygodny.
        return NextResponse.redirect(`${origin}${next}`)
      }
      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Odmowa zgody przychodzi bez `code`, z ?error=access_denied — zachowujemy
  // rozróżnienie, żeby /login pokazał właściwy komunikat.
  const errorCode =
    searchParams.get('error') === 'access_denied'
      ? 'access_denied'
      : 'auth_callback'
  return NextResponse.redirect(`${origin}/login?error=${errorCode}`)
}
