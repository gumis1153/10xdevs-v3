'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

/**
 * Usuwa sesję z archiwum (S-05, FR-015). Wzorzec `signOut`: mutacja + redirect.
 * Usuwa user-scoped klientem — polityka RLS `sessions_delete_own` gwarantuje,
 * że można skasować wyłącznie własny wiersz (cudze `id` usuwa 0 wierszy).
 */
export async function deleteSession(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) {
    console.error('delete session failed:', error.message)
  }
  redirect('/archive')
}
