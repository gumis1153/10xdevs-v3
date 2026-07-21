'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

// Origin z nagłówków żądania (nigdy na sztywno) — preview URL-e Vercela
// różnią się per deployment.
async function requestOrigin(): Promise<string> {
  const headerList = await headers()
  const origin = headerList.get('origin')
  if (origin) {
    return origin
  }

  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? ''
  const protocol = headerList.get('x-forwarded-proto') ?? 'https'
  return `${protocol}://${host}`
}

export async function signInWithGoogle() {
  const supabase = await createClient()
  const origin = await requestOrigin()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data.url) {
    redirect('/login?error=oauth')
  }

  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    // Nieudane wylogowanie odbije użytkownika z powrotem na "/" (proxy widzi
    // wciąż ważną sesję) — zostaw ślad w logach, inaczej awaria jest niema.
    console.error('signOut failed:', error.message)
  }
  redirect('/login')
}
