import type { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime'

/**
 * Minimalny fake modułu `@openai/agents-realtime` — granica podmiany dla testów
 * cyklu życia sesji (test-plan.md §6.2: podmieniamy moduł zewnętrzny, nigdy
 * wewnętrzny). Odtwarza WYŁĄCZNIE powierzchnię, której dotyka
 * `voice-conversation.tsx`: konstruktory, `on()` dla ośmiu zdarzeń sesyjnych,
 * `transport.on('connection_change')`, `connect()`, `close()`,
 * `transport.requestResponse()`.
 *
 * Świadomie NIE modelowane: `getSenders()`, `track.readyState`,
 * `peerConnection`, element `<audio>`, wybór transportu (WebRTC vs WebSocket).
 * Asercja o fizycznym zwolnieniu mikrofonu na takim fake'u byłaby asercją
 * o fake'u — przeszłaby na zielono nawet gdyby produkcja przeciekała. Ta
 * ścieżka zostaje ręcznym smoke'em w przeglądarce (test-plan.md §6.7).
 *
 * Rejestr wywołań jest globalny dla modułu i MUSI być zerowany przez
 * `resetRealtimeFake()` w `beforeEach` — instancje powstają wewnątrz efektu
 * komponentu, więc test nie ma szansy wstrzyknąć własnego rejestru.
 */

/** Wywołania rozróżniane przez rejestr — dokładnie te, które ma pilnować ryzyko #1. */
export type RealtimeCall = 'connect' | 'close' | 'requestResponse'

type Listener = (...args: unknown[]) => void

type TransportStatus = 'disconnected' | 'connecting' | 'connected'

export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

/**
 * Rozwiązywalna obietnica — pozwala testowi zatrzymać czas na konkretnym
 * `await` w kodzie produkcyjnym (okno wyścigu), a nie tylko podstawić wynik.
 * Wspólna dla fake'a SDK i dla stuba `fetch` w teście.
 */
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let calls: RealtimeCall[] = []
let sessions: FakeRealtimeSession[] = []
// Brama `connect()` — domyślnie otwarta, więc łączenie rozwiązuje się
// mikrozadaniami. `holdConnect()` zamyka ją dla scenariuszy wyścigu.
let connectGate: Promise<void> = Promise.resolve()

class FakeEmitter {
  private readonly listeners = new Map<string, Listener[]>()

  on(event: string, listener: Listener): void {
    const bucket = this.listeners.get(event)
    if (bucket) {
      bucket.push(listener)
      return
    }
    this.listeners.set(event, [listener])
  }

  /** Uchwyt dla testu: wystrzelenie zdarzenia sesji lub transportu. */
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args)
    }
  }
}

export class FakeRealtimeTransport extends FakeEmitter {
  status: TransportStatus = 'disconnected'

  requestResponse(): void {
    calls.push('requestResponse')
  }
}

export class FakeRealtimeSession extends FakeEmitter {
  readonly transport = new FakeRealtimeTransport()
  readonly connectApiKeys: string[] = []

  constructor(
    readonly agent: unknown,
    readonly options: unknown,
  ) {
    super()
    sessions.push(this)
  }

  async connect(options: { apiKey: string }): Promise<void> {
    calls.push('connect')
    this.connectApiKeys.push(options.apiKey)
    this.transport.status = 'connecting'
    await connectGate
    this.transport.status = 'connected'
    this.transport.emit('connection_change', 'connected')
  }

  close(): void {
    calls.push('close')
    // Prawdziwy transport na nieotwartym połączeniu jest no-opem bez żadnego
    // śladu — rejestr wyżej jest instrumentacją testu, nie śladem SDK. Dalsze
    // skutki (zdarzenie `connection_change`) tylko gdy było co zamykać.
    if (this.transport.status === 'disconnected') return
    this.transport.status = 'disconnected'
    this.transport.emit('connection_change', 'disconnected')
  }
}

class FakeRealtimeAgent {
  constructor(readonly config: { name: string; instructions: string }) {}
}

/**
 * Fabryka dla `vi.mock` — wołana z fabryki mocka, więc nie może zależeć od
 * niczego z ciała pliku testowego (hoisting `vi.mock`).
 *
 * Rzutowanie przez `unknown` jest tu świadome: pełna zgodność strukturalna
 * z klasami SDK wymagałaby odtworzenia dziesiątek nieużywanych metod, co
 * pogłębiłoby fake'a wbrew jego przeznaczeniu. Kod produkcyjny widzi
 * prawdziwe typy, runtime dostaje ten fake.
 */
export function realtimeFakeModule(): {
  RealtimeAgent: typeof RealtimeAgent
  RealtimeSession: typeof RealtimeSession
} {
  return {
    RealtimeAgent: FakeRealtimeAgent as unknown as typeof RealtimeAgent,
    RealtimeSession: FakeRealtimeSession as unknown as typeof RealtimeSession,
  }
}

export function resetRealtimeFake(): void {
  calls = []
  sessions = []
  connectGate = Promise.resolve()
}

export function realtimeCalls(): readonly RealtimeCall[] {
  return calls
}

export function countRealtimeCalls(kind: RealtimeCall): number {
  return calls.filter((call) => call === kind).length
}

export function realtimeSessions(): readonly FakeRealtimeSession[] {
  return sessions
}

/**
 * Wstrzymuje każde kolejne `connect()` do ręcznego rozwiązania (albo
 * odrzucenia). Wołane PRZED renderem — instancja sesji powstaje dopiero
 * w efekcie komponentu.
 */
export function holdConnect(): Deferred<void> {
  const gate = deferred<void>()
  connectGate = gate.promise
  return gate
}
