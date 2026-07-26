'use client'

import { useCallback, useState } from 'react'
import { Orb, type OrbState } from '@/components/orb'
import {
  VoiceConversation,
  type ConversationState,
} from '@/components/voice-conversation'
import { drawTopicSet, type Topic } from '@/lib/topics'

type Phase = 'proposal' | 'conversation'

/** Stan rozmowy → stan orba; stany terminalne wracają do spokojnego idle. */
function toOrbState(state: ConversationState): OrbState {
  return state === 'ended' || state === 'error' ? 'idle' : state
}

/**
 * Interaktywny rdzeń startu sesji: wybór spośród 3 zbalansowanych propozycji
 * tematu z ponownym losowaniem całego zestawu (S-09, FR-003/FR-004) i rozmowa
 * głosowa po wyborze (S-03, FR-006–FR-009). Klik karty tematu jest zarazem
 * gestem użytkownika wymaganym przez getUserMedia/AudioContext (Safari) — dlatego
 * synchronicznie, przed jakimkolwiek awaitem, przełącza fazę na rozmowę.
 */
export function SessionStart({ initialTopics }: { initialTopics: Topic[] }) {
  const [topics, setTopics] = useState(initialTopics)
  const [selected, setSelected] = useState<Topic>(initialTopics[0])
  const [phase, setPhase] = useState<Phase>('proposal')
  const [conversationState, setConversationState] =
    useState<ConversationState>('connecting')

  // Klik karty: wybór tematu + start rozmowy w jednym synchronicznym geście
  // (sygnał „łączenie" na orbie w ≤500 ms — NFR; zarazem gest dla Safari).
  const startConversation = (topic: Topic) => {
    setSelected(topic)
    setConversationState('connecting')
    setPhase('conversation')
  }

  const exitConversation = useCallback(() => {
    setPhase('proposal')
    setConversationState('connecting')
  }, [])

  // „Nowa sesja" z ekranu końcowego — powrót do propozycji ze świeżym
  // zestawem 3 tematów.
  const startNewSession = useCallback(() => {
    setTopics(drawTopicSet())
    setPhase('proposal')
    setConversationState('connecting')
  }, [])

  return (
    <>
      {/* Jeden trwały element orba przez obie fazy — repozycjonowany
          wyłącznie klasami, żeby remount nie restartował animacji CSS. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-all duration-700 ease-out ${
          phase === 'proposal' ? 'scale-95 opacity-70 blur-[2px]' : 'scale-100 opacity-100 blur-none'
        }`}
      >
        <Orb
          state={
            phase === 'conversation' ? toOrbState(conversationState) : 'idle'
          }
        />
      </div>

      {phase === 'proposal' ? (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
            Wybierz temat sesji
          </span>
          <div className="flex w-full flex-col gap-3">
            {topics.map((topic) => (
              <button
                key={topic.id}
                type="button"
                onClick={() => startConversation(topic)}
                className="flex flex-col gap-1 rounded-xl border border-solid border-black/[.08] px-5 py-4 text-left transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
              >
                <span className="text-base font-semibold tracking-tight">
                  {topic.title}
                </span>
                <span className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                  {topic.description}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTopics((current) => drawTopicSet(current))}
            className="mt-2 h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Inne tematy
          </button>
        </div>
      ) : (
        <VoiceConversation
          topic={selected}
          onStateChange={setConversationState}
          onExit={exitConversation}
          onNewSession={startNewSession}
        />
      )}
    </>
  )
}
