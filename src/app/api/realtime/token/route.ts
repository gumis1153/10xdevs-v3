import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

// TTL tokenu ek_: okno na NAWIĄZANIE sesji (nie długość rozmowy) — token
// mintowany jest tuż przed connect(), więc 120 s wystarcza z zapasem.
// MERGE-GATE wymaga ≤600 s (context/deployment/deploy-plan.md:73).
const TOKEN_TTL_SECONDS = 120

/**
 * Mintuje krótkotrwały ephemeral client secret (ek_) dla przeglądarkowej
 * sesji Realtime (S-03). Konfiguracja sesji jest przypięta serwerowo jako
 * defense-in-depth — klient MUSI ją lustrzanie powtórzyć w RealtimeSession,
 * bo SDK przy connect() wysyła własny session.update (patrz plan, Critical
 * Details). Auth weryfikowany tu niezależnie od proxy (defense-in-depth).
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser()

  // Brak sesji to stan normalny (401 niżej); loguj tylko realne awarie.
  if (getUserError && getUserError.name !== 'AuthSessionMissingError') {
    console.error('realtime token getUser failed:', getUserError.message)
  }

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // OpenAI-Safety-Identifier: stabilny pseudonim użytkownika — hash zamiast
  // surowego id, żeby nie wysyłać identyfikatorów Supabase do OpenAI.
  const safetyIdentifier = createHash('sha256').update(user.id).digest('hex')

  // Awaria transportowa (DNS, reset połączenia) ma iść tą samą kontrolowaną
  // ścieżką 502 co błędna odpowiedź upstreamu.
  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
          'Content-Type': 'application/json',
          'OpenAI-Safety-Identifier': safetyIdentifier,
        },
        body: JSON.stringify({
          expires_after: { anchor: 'created_at', seconds: TOKEN_TTL_SECONDS },
          session: {
            type: 'realtime',
            model: 'gpt-realtime-2.1',
            audio: {
              input: {
                transcription: { model: 'gpt-4o-mini-transcribe' },
                // threshold 0.75 + far_field = mitygacja echa głośnika
                // w Safari iOS (research.md §Safari).
                turn_detection: { type: 'server_vad', threshold: 0.75 },
                noise_reduction: { type: 'far_field' },
              },
            },
          },
        }),
      }
    )
  } catch (error) {
    console.error('realtime client_secrets fetch failed:', error)
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 })
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '')
    console.error(
      'realtime client_secrets failed:',
      upstream.status,
      detail.slice(0, 500)
    )
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 })
  }

  const secret: { value: string; expires_at: number } = await upstream.json()

  // Tylko ek_ + wygaśnięcie — klucz serwerowy nigdy nie opuszcza route'u.
  return NextResponse.json(
    { value: secret.value, expiresAt: secret.expires_at },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
