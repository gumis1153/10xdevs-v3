import { SessionStart } from '@/components/session-start'
import { requireUser } from '@/lib/supabase/server'
import { drawTopicSet } from '@/lib/topics'

export default async function Home() {
  // Własna bramka sesji, obok tej w layoucie grupy `(app)` i w `proxy.ts`
  // (defense-in-depth). Odczyt usera jest memoizowany per żądanie, więc to
  // wywołanie nie dokłada odpytania Supabase. Avatar bierze layout.
  await requireUser()

  return (
    // relative + overflow-hidden: kontekst pozycjonowania dla orba
    // (absolutny element przy krawędziach nie może tworzyć scrollbarów)
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
      <SessionStart initialTopics={drawTopicSet()} />
    </main>
  )
}
