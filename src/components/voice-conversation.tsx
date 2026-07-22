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

type ErrorKind = 'mic-denied' | 'connection'

const STATE_LABELS: Record<ConversationState, string> = {
  connecting: 'Łączenie z rozmówcą…',
  listening: 'Słucham — mów śmiało',
  'user-speaking': 'Mówisz…',
  processing: 'Chwila namysłu…',
  speaking: 'Rozmówca odpowiada…',
  ended: 'Sesja zakończona',
  error: 'Coś poszło nie tak',
}

// Twardy limit sesji (decyzja: bezpiecznik kosztowy; skrócony z planowanych
// 5:00 do 2:00 ze względu na koszt Realtime API — decyzja 2026-07-22);
// ostrzeżenie wizualne 30 s przed końcem.
const SESSION_SECONDS = 2 * 60
const WARNING_SECONDS = 30

const ACTIVE_STATES: ReadonlyArray<ConversationState> = [
  'listening',
  'user-speaking',
  'processing',
  'speaking',
]

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

const CARD_CLASS =
  'relative z-10 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/[.08] bg-white/85 px-8 py-10 backdrop-blur-sm dark:border-white/[.145] dark:bg-black/70'

const SECONDARY_BUTTON_CLASS =
  'h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]'

const PRIMARY_BUTTON_CLASS =
  'h-11 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-85'

/**
 * Rdzeń rozmowy głosowej (S-03, FR-006–FR-009): pobiera token ek_,
 * zestawia sesję WebRTC przez @openai/agents-realtime i mapuje zdarzenia
 * sesji na maszynę stanów UI (orb + etykieta). Do tego twardy limit 5:00
 * z odliczaniem, karty błędów z ręcznym retry (świeży token + nowa sesja)
 * i ekran końcowy — zaślepka, którą S-04 podmieni na raport.
 */
export function VoiceConversation({
  topic,
  onStateChange,
  onExit,
  onNewSession,
}: {
  topic: Topic
  onStateChange: (state: ConversationState) => void
  onExit: () => void
  onNewSession: () => void
}) {
  const [state, setState] = useState<ConversationState>('connecting')
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null)
  // Pozostały czas sesji; null = odliczanie nieaktywne (łączenie, błąd, koniec).
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  // Licznik prób — inkrementacja wymusza ponowny przebieg efektu połączenia
  // (retry = świeży token + całkiem nowa sesja; poprzednia wymiana przepada).
  const [attempt, setAttempt] = useState(0)
  const sessionRef = useRef<RealtimeSession | null>(null)
  // Pełna historia rozmowy (history_updated) — utrzymywana w pamięci także
  // na ekranie końcowym jako punkt przekazania dla raportu S-04; ref, bo
  // zmiany historii nie mają powodować re-renderów. Surowe audio nigdzie
  // nie jest zapisywane (strumienie WebRTC są przejściowe z założenia).
  const historyRef = useRef<RealtimeItem[]>([])
  // Odróżnia świadome zakończenie (przycisk / limit czasu) od zerwania
  // połączenia, żeby normalny koniec nigdy nie wyglądał jak błąd.
  const userEndedRef = useRef(false)
  // Lustro stanu dla handlerów zdarzeń sesji (odczyt bez re-subskrypcji).
  const stateRef = useRef(state)
  // Lustro odliczania dla callbacku interwału (tam też zapada auto-koniec).
  const secondsLeftRef = useRef<number | null>(null)

  const updateSecondsLeft = useCallback((value: number | null) => {
    secondsLeftRef.current = value
    setSecondsLeft(value)
  }, [])

  // Przejścia stanów aktywnej rozmowy — stany terminalne nie są nadpisywane
  // przez spóźnione zdarzenia sesji.
  const setActiveState = useCallback((next: ConversationState) => {
    setState((prev) => (prev === 'ended' || prev === 'error' ? prev : next))
  }, [])

  useEffect(() => {
    stateRef.current = state
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
    // Nieoczekiwane zerwanie połączenia w aktywnej rozmowie → karta błędu;
    // świadome zakończenie (przycisk / limit czasu) jest odfiltrowane flagą.
    session.transport.on('connection_change', (status) => {
      if (status !== 'disconnected' || userEndedRef.current || cancelled) {
        return
      }
      const current = stateRef.current
      if (
        current === 'ended' ||
        current === 'error' ||
        current === 'connecting'
      ) {
        return
      }
      setErrorKind('connection')
      updateSecondsLeft(null)
      setState('error')
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
        // Odliczanie startuje, gdy sesja osiąga stan aktywny.
        updateSecondsLeft(SESSION_SECONDS)
      } catch (error) {
        if (cancelled) return
        console.error('voice conversation connect:', error)
        setErrorKind(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'mic-denied'
            : 'connection',
        )
        updateSecondsLeft(null)
        setState('error')
      }
    })()

    return () => {
      cancelled = true
      sessionRef.current = null
      session.close()
    }
  }, [topic, attempt, setActiveState, updateSecondsLeft])

  // Tykanie zegara tylko w aktywnej rozmowie; interval sprzątany przy każdym
  // wyjściu ze stanu aktywnego (błąd, koniec, odmontowanie). Po upływie
  // limitu automatyczne zakończenie — przepływ jak przy przycisku (normalny
  // koniec, nie błąd), wprost do ekranu końcowego.
  const isActive = ACTIVE_STATES.includes(state)
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      const current = secondsLeftRef.current
      if (current === null) return
      const next = Math.max(0, current - 1)
      if (next === 0) {
        userEndedRef.current = true
        sessionRef.current?.close()
        updateSecondsLeft(null)
        setState('ended')
        return
      }
      updateSecondsLeft(next)
    }, 1000)
    return () => clearInterval(id)
  }, [isActive, updateSecondsLeft])

  // Świadome zakończenie rozmowy (FR-009) — dostępne w każdym stanie,
  // także w trakcie łączenia (connect() bywa zawieszalny).
  const endConversation = () => {
    userEndedRef.current = true
    sessionRef.current?.close()
    updateSecondsLeft(null)
    setState('ended')
  }

  const retryConversation = () => {
    setErrorKind(null)
    updateSecondsLeft(null)
    setState('connecting')
    setAttempt((current) => current + 1)
  }

  if (state === 'error') {
    return (
      <div className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold tracking-tight">
          {errorKind === 'mic-denied'
            ? 'Brak dostępu do mikrofonu'
            : 'Połączenie przerwane'}
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {errorKind === 'mic-denied'
            ? 'Rozmowa potrzebuje mikrofonu. Kliknij ikonę kłódki (lub ustawień strony) przy pasku adresu przeglądarki, zezwól na dostęp do mikrofonu i spróbuj ponownie.'
            : 'Połączenie z rozmówcą zostało przerwane. Sprawdź połączenie z internetem i spróbuj ponownie — rozmowa zacznie się od nowa.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={retryConversation}
            className={PRIMARY_BUTTON_CLASS}
          >
            Spróbuj ponownie
          </button>
          <button
            type="button"
            onClick={onExit}
            className={SECONDARY_BUTTON_CLASS}
          >
            Wróć do tematu
          </button>
        </div>
      </div>
    )
  }

  if (state === 'ended') {
    return (
      <div className={CARD_CLASS}>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sesja zakończona
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Raport z rozmowy pojawi się w następnym kroku budowy aplikacji.
        </p>
        <button
          type="button"
          onClick={onNewSession}
          className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          Nowa sesja
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
      {secondsLeft !== null && (
        <p
          className={`font-mono text-sm tabular-nums ${
            secondsLeft <= WARNING_SECONDS
              ? 'animate-pulse font-semibold text-amber-600 dark:text-amber-400'
              : 'text-zinc-600 dark:text-zinc-400'
          }`}
        >
          {formatCountdown(secondsLeft)}
        </p>
      )}
      <button
        type="button"
        onClick={endConversation}
        className={`mt-2 ${SECONDARY_BUTTON_CLASS}`}
      >
        Zakończ rozmowę
      </button>
    </div>
  )
}
