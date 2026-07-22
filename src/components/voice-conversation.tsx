'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RealtimeAgent,
  RealtimeSession,
  type RealtimeItem,
} from '@openai/agents-realtime'
import { buildInstructions } from '@/lib/realtime/instructions'
import type { Topic } from '@/lib/topics'

export type ConversationState =
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'processing'
  | 'speaking'
  | 'ended'
  | 'error'

const STATE_LABELS: Record<ConversationState, string> = {
  connecting: 'Łączenie z rozmówcą…',
  listening: 'Słucham — mów śmiało',
  'user-speaking': 'Mówisz…',
  processing: 'Chwila namysłu…',
  speaking: 'Rozmówca odpowiada…',
  ended: 'Sesja zakończona',
  error: 'Coś poszło nie tak',
}

/**
 * Rdzeń rozmowy głosowej (S-03, FR-006–FR-009): pobiera token ek_,
 * zestawia sesję WebRTC przez @openai/agents-realtime i mapuje zdarzenia
 * sesji na maszynę stanów UI (orb + etykieta). Sesja żyje wyłącznie po
 * stronie klienta; zakończenie wraca do fazy propozycji tematu (ekran
 * końcowy dojdzie w fazie 3).
 */
export function VoiceConversation({
  topic,
  onStateChange,
  onExit,
}: {
  topic: Topic
  onStateChange: (state: ConversationState) => void
  onExit: () => void
}) {
  const [state, setState] = useState<ConversationState>('connecting')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const sessionRef = useRef<RealtimeSession | null>(null)
  // Pełna historia rozmowy (history_updated) — materiał dla raportu S-04;
  // ref, bo zmiany historii nie mają powodować re-renderów.
  const historyRef = useRef<RealtimeItem[]>([])
  // Odróżnia świadome zakończenie (przycisk) od zerwania połączenia,
  // żeby normalny koniec nigdy nie wyglądał jak błąd.
  const userEndedRef = useRef(false)

  // Przejścia stanów aktywnej rozmowy — stany terminalne nie są nadpisywane
  // przez spóźnione zdarzenia sesji.
  const setActiveState = useCallback((next: ConversationState) => {
    setState((prev) => (prev === 'ended' || prev === 'error' ? prev : next))
  }, [])

  useEffect(() => {
    onStateChange(state)
  }, [state, onStateChange])

  useEffect(() => {
    // Flaga anulowania na wypadek odmontowania w trakcie łączenia
    // (StrictMode w dev podwójnie odpala efekty — bez tego powstałaby
    // druga równoległa sesja audio).
    let cancelled = false
    userEndedRef.current = false

    const agent = new RealtimeAgent({
      name: 'English conversation partner',
      instructions: buildInstructions(topic),
    })

    // Lustrzana kopia configu przypiętego serwerowo w /api/realtime/token —
    // SDK przy connect() wysyła session.update i niedopięte pola nadpisałby
    // własnymi domyślnymi (semantic_vad, noiseReduction: null), unieważniając
    // mitygację echa Safari i eventy speech_started/stopped (server_vad).
    const session = new RealtimeSession(agent, {
      model: 'gpt-realtime-2.1',
      config: {
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe' },
            turnDetection: { type: 'server_vad', threshold: 0.75 },
            noiseReduction: { type: 'far_field' },
          },
        },
      },
    })
    sessionRef.current = session

    session.on('agent_start', () => setActiveState('processing'))
    session.on('agent_end', () => setActiveState('listening'))
    session.on('audio_start', () => setActiveState('speaking'))
    session.on('audio_stopped', () => setActiveState('listening'))
    session.on('audio_interrupted', () => setActiveState('listening'))
    session.on('history_updated', (history) => {
      historyRef.current = history
    })
    session.on('error', (err) => {
      console.error('realtime session error:', err.error)
    })
    // Mowa użytkownika przychodzi wyłącznie surowymi eventami transportu
    // i tylko w trybie server_vad (research.md, korekta §2).
    session.on('transport_event', (event) => {
      if (event.type === 'input_audio_buffer.speech_started') {
        setActiveState('user-speaking')
      } else if (event.type === 'input_audio_buffer.speech_stopped') {
        setActiveState('processing')
      }
    })
    // Nieoczekiwane zerwanie połączenia w aktywnej rozmowie → stan błędu;
    // świadome zakończenie (przycisk) jest odfiltrowane flagą.
    session.transport.on('connection_change', (status) => {
      if (status === 'disconnected' && !userEndedRef.current && !cancelled) {
        setErrorMessage('Połączenie z rozmówcą zostało przerwane.')
        setState((prev) =>
          prev === 'ended' || prev === 'error' || prev === 'connecting'
            ? prev
            : 'error',
        )
      }
    })

    ;(async () => {
      try {
        // Własny getUserMedia przed connect() dla kontrolowanego UX odmowy
        // uprawnień; strumień od razu zatrzymujemy — SDK pobiera swój.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        })
        stream.getTracks().forEach((track) => track.stop())

        const response = await fetch('/api/realtime/token', { method: 'POST' })
        if (!response.ok) {
          throw new Error(`token endpoint responded ${response.status}`)
        }
        const { value } = (await response.json()) as { value: string }
        if (cancelled) return

        await session.connect({ apiKey: value })
        if (cancelled) {
          session.close()
          return
        }
        setActiveState('listening')
      } catch (error) {
        if (cancelled) return
        console.error('voice conversation connect:', error)
        setErrorMessage(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'Brak dostępu do mikrofonu. Odblokuj mikrofon w ustawieniach przeglądarki i spróbuj ponownie.'
            : 'Nie udało się nawiązać połączenia z rozmówcą. Spróbuj ponownie.',
        )
        setState('error')
      }
    })()

    return () => {
      cancelled = true
      sessionRef.current = null
      session.close()
    }
  }, [topic, setActiveState])

  // Świadome zakończenie rozmowy (FR-009) — dostępne w każdym stanie,
  // także w trakcie łączenia (connect() bywa zawieszalny).
  const endConversation = () => {
    userEndedRef.current = true
    sessionRef.current?.close()
    onExit()
  }

  if (state === 'error') {
    return (
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70">
        <h1 className="text-2xl font-semibold tracking-tight">
          {STATE_LABELS.error}
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={onExit}
          className="mt-2 h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Wróć do tematu
        </button>
      </div>
    )
  }

  return (
    <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
      <p
        aria-live="polite"
        className="text-sm leading-6 text-zinc-600 dark:text-zinc-400"
      >
        {STATE_LABELS[state]}
      </p>
      <button
        type="button"
        onClick={endConversation}
        className="mt-2 h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
      >
        Zakończ rozmowę
      </button>
    </div>
  )
}
