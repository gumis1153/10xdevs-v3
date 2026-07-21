'use client'

import { useState } from 'react'
import { Orb } from '@/components/orb'
import { drawTopic, type Topic } from '@/lib/topics'

type Phase = 'proposal' | 'accepted'

/**
 * Interaktywny rdzeń startu sesji (S-02): propozycja tematu z ponownym
 * losowaniem (FR-003/FR-004) i stan po akceptacji — zaślepka, którą S-03
 * podmieni na prawdziwą rozmowę głosową.
 */
export function SessionStart({ initialTopic }: { initialTopic: Topic }) {
  const [topic, setTopic] = useState(initialTopic)
  const [phase, setPhase] = useState<Phase>('proposal')

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
        <Orb />
      </div>

      {phase === 'proposal' ? (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
            Temat sesji
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {topic.title}
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {topic.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setPhase('accepted')}
              className="h-11 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              Rozpocznij rozmowę
            </button>
            <button
              type="button"
              onClick={() => setTopic((current) => drawTopic(current.id))}
              className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              Inny temat
            </button>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {topic.title}
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Rozmowa głosowa pojawi się w następnym kroku budowy aplikacji.
          </p>
          <button
            type="button"
            onClick={() => setPhase('proposal')}
            className="mt-2 h-9 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Zmień temat
          </button>
        </div>
      )}
    </>
  )
}
