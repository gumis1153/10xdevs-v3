import { act, render, screen } from '@testing-library/react'
import { VoiceConversation } from '@/components/voice-conversation'
import type { Topic } from '@/lib/topics'
import {
  countRealtimeCalls,
  deferred,
  resetRealtimeFake,
  type Deferred,
} from '@/test/fakes/realtime-session'

/**
 * Cykl życia sesji głosowej — ryzyko #1 z `test-plan.md` §2 (High × High,
 * jedyny realnie przeżyty incydent: „rozmowa się zakończyła, ale głos nadal
 * odpowiadał"). Oracle każdego testu w tym pliku: FR-009 („użytkownik może
 * zakończyć sesję w dowolnym momencie") w koniunkcji z definicją ryzyka #1 —
 * po zakończeniu rozmowy nie płynie ani jeden token. Zakończenie znaczy więc
 * brak dalszej aktywności sesji, nie tylko zmianę ekranu.
 *
 * Granica podmiany to moduł `@openai/agents-realtime` (patrz
 * `src/test/fakes/realtime-session.ts`). Konsekwencja przyjęta świadomie:
 * testy dowodzą sekwencji i kontraktu NASZEGO kodu, nie fizyki urządzenia —
 * fizycznego zwolnienia mikrofonu nie da się dowieść w jsdom.
 *
 * Świadomie `fireEvent`, nie `@testing-library/user-event`: ten drugi wymaga
 * opcji `advanceTimers` przy `vi.useFakeTimers()` i łatwo zakleszcza test
 * odliczania.
 *
 * Fabryka mocka ładuje fake'a przez dynamiczny `await import` — `vi.mock` jest
 * hoistowany nad importy, więc statycznie zaimportowany symbol nie jest jeszcze
 * zainicjalizowany w momencie, gdy fabryka odpala (ReferenceError).
 */
vi.mock(import('@openai/agents-realtime'), async () => {
  const fake = await import('@/test/fakes/realtime-session')
  return fake.realtimeFakeModule()
})

const TOPIC: Topic = {
  id: 'daily-standup',
  title: 'Daily standup',
  description: "Tell your team what you did yesterday and what's blocking you.",
  category: 'work',
}

// Twardy limit sesji wg PRD US-01 („2–3 minuty") — literał, nie import
// `SESSION_SECONDS`. Asercja licząca czas tą samą stałą, którą liczy kod,
// byłaby lustrem implementacji.
const SESSION_LIMIT_MS = 3 * 60 * 1000

// Zawiesza `POST /api/realtime/token` — okno wyścigu D1 leży na fetchu tokenu,
// nie na `connect()`. null = odpowiedź natychmiastowa.
let tokenGate: Deferred<void> | null = null

const consoleError = vi.fn()

/** Kod produkcyjny czyta z odpowiedzi tylko `ok` i `json()` — tyle udajemy. */
function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

function stubFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/realtime/token')) {
        if (tokenGate) await tokenGate.promise
        return jsonResponse({ value: 'ek_fake_token' })
      }
      if (url.includes('/api/report')) {
        return jsonResponse({ kind: 'insufficient_material', learnerWordCount: 0 })
      }
      throw new Error(`nieoczekiwany fetch w teście: ${url}`)
    }),
  )
}

/**
 * Probe uprawnień (`voice-conversation.tsx:250-253`) — strumień musi oddać
 * ścieżkę ze `stop()`, inaczej kod wpada w gałąź `mic-denied` i test bada
 * zupełnie inną ścieżkę niż zamierzona.
 */
function stubMediaDevices(): void {
  const stream = { getTracks: () => [{ stop: vi.fn() }] }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
}

function renderConversation() {
  const callbacks = {
    onStateChange: vi.fn(),
    onExit: vi.fn(),
    onNewSession: vi.fn(),
  }
  const view = render(<VoiceConversation topic={TOPIC} {...callbacks} />)
  return { ...view, ...callbacks }
}

/**
 * Drenuje łańcuch `await`-ów efektu łączącego (getUserMedia → fetch → json →
 * connect). Same mikrozadania, więc działa identycznie na prawdziwych
 * i sfałszowanych timerach.
 */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve()
    }
  })
}

beforeEach(() => {
  resetRealtimeFake()
  tokenGate = null
  consoleError.mockReset()
  vi.spyOn(console, 'error').mockImplementation(consoleError)
  stubMediaDevices()
  stubFetch()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('VoiceConversation — ścieżka B: twardy limit sesji', () => {
  it('po wyczerpaniu limitu zamyka sesję dokładnie raz i prowadzi na ekran końcowy', async () => {
    vi.useFakeTimers()
    renderConversation()
    await settle()

    expect(countRealtimeCalls('connect')).toBe(1)
    expect(countRealtimeCalls('close')).toBe(0)

    // Fallback otwarcia (5 s) wystrzeli w trakcie przesuwania i przełączy stan
    // na `listening` — to nadal stan aktywny, odliczanie biegnie dalej.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SESSION_LIMIT_MS)
    })

    expect(countRealtimeCalls('close')).toBe(1)
    expect(countRealtimeCalls('connect')).toBe(1)
    expect(
      screen.queryByRole('button', { name: 'Zakończ rozmowę' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Połączenie przerwane' }),
    ).not.toBeInTheDocument()
    // Rozmowa bez ani jednej tury ucznia → „za mało materiału", nie karta błędu.
    expect(
      screen.getByRole('heading', { name: 'Za mało materiału do analizy' }),
    ).toBeInTheDocument()
  })
})

describe('VoiceConversation — ścieżka C: odmontowanie', () => {
  it('odmontowanie po udanym połączeniu zamyka sesję dokładnie raz', async () => {
    const { unmount } = renderConversation()
    await settle()

    expect(countRealtimeCalls('connect')).toBe(1)
    expect(countRealtimeCalls('close')).toBe(0)

    unmount()

    expect(countRealtimeCalls('close')).toBe(1)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('odmontowanie w trakcie łączenia nie dopuszcza do powstania sesji', async () => {
    tokenGate = deferred<void>()
    const { unmount } = renderConversation()
    await settle()

    // Łączenie wisi na tokenie — sesja jeszcze nie istnieje po stronie SDK.
    expect(screen.getByText('Łączenie z rozmówcą…')).toBeInTheDocument()
    expect(countRealtimeCalls('connect')).toBe(0)

    unmount()
    tokenGate.resolve()
    await settle()

    expect(countRealtimeCalls('connect')).toBe(0)
    expect(countRealtimeCalls('requestResponse')).toBe(0)
    expect(countRealtimeCalls('close')).toBe(1)
    // React 19 nie ostrzega już o setState po odmontowaniu, ale cicha gałąź
    // `catch` w kodzie produkcyjnym loguje — brak logu jest tu asercją.
    expect(consoleError).not.toHaveBeenCalled()
  })
})
