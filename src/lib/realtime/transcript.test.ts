import type { RealtimeItem } from '@openai/agents-realtime'
import { buildTurns } from './transcript'

/**
 * Oracle: PRD §Guardrails — „Surowe nagranie głosu użytkownika nie jest
 * przechowywane trwale po przetworzeniu sesji. Transkrypcja może zostać;
 * surowe audio — nie." Z elementu audio wolno więc przepuścić WYŁĄCZNIE
 * transkrypcję, nigdy bajtów audio. Drugie źródło oracle'a: tura `system`
 * to ziarno instrukcji (S-03), nie wypowiedź uczestnika rozmowy, więc nie
 * należy do materiału ocenianego przez /api/report.
 *
 * Wartości oczekiwane są wypisane wprost — nie liczone tą samą logiką, co
 * `buildTurns` (anty-wzorzec „mirror implementation").
 */

const AUDIO_BYTES = 'UklGRiQAAABXQVZF' // atrapa base64 — nigdy nie może wyjść w turze

function learnerAudio(transcript: string | null): RealtimeItem {
  return {
    itemId: 'i-learner',
    type: 'message',
    role: 'user',
    status: 'completed',
    content: [{ type: 'input_audio', audio: AUDIO_BYTES, transcript }],
  }
}

function tutorAudio(transcript: string | null): RealtimeItem {
  return {
    itemId: 'i-tutor',
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_audio', audio: AUDIO_BYTES, transcript }],
  }
}

describe('buildTurns', () => {
  it('mapuje role SDK na mówców kontraktu raportu', () => {
    expect(buildTurns([learnerAudio('I go to school yesterday'), tutorAudio('You went, right?')])).toEqual([
      { speaker: 'learner', text: 'I went to school yesterday' },
      { speaker: 'tutor', text: 'You went, right?' },
    ])
  })

  it('nie przepuszcza bajtów audio — w turze zostaje sama transkrypcja', () => {
    const turns = buildTurns([learnerAudio('hello there')])

    expect(turns).toEqual([{ speaker: 'learner', text: 'hello there' }])
    expect(JSON.stringify(turns)).not.toContain(AUDIO_BYTES)
  })

  it('pomija turę systemową — instrukcje nie są wypowiedzią uczestnika', () => {
    const seed = 'You are a friendly English tutor. Never switch to Polish.'
    const history: RealtimeItem[] = [
      { itemId: 'i-sys', type: 'message', role: 'system', content: [{ type: 'input_text', text: seed }] },
      learnerAudio('good morning'),
    ]

    const turns = buildTurns(history)

    expect(turns).toEqual([{ speaker: 'learner', text: 'good morning' }])
    expect(JSON.stringify(turns)).not.toContain('friendly English tutor')
  })

  it.each([
    ['tura ucznia jeszcze in-progress', learnerAudio(null)],
    ['tura tutora jeszcze in-progress', tutorAudio(null)],
  ])('%s nie produkuje tury, dopóki nie ma transkrypcji', (_label, item) => {
    expect(buildTurns([item])).toEqual([])
  })

  it('pusta historia daje pustą listę tur', () => {
    expect(buildTurns([])).toEqual([])
  })
})
