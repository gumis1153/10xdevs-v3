import type { RealtimeItem } from '@openai/agents-realtime'
import type { Turn } from '@/lib/report/schema'

/**
 * Czysta konwersja historii sesji realtime na tekstowe tury dla /api/report
 * (S-04) — jedyne miejsce znające kształt contentu RealtimeItem. Przepuszcza
 * wyłącznie tekst: audio (base64) i elementy tool/mcp nigdy nie opuszczają
 * klienta (guardrail prywatności).
 */
export function buildTurns(history: RealtimeItem[]): Turn[] {
  const turns: Turn[] = []
  for (const item of history) {
    if (item.type !== 'message') continue
    // Tura systemowa to ziarno instrukcji — nie jest częścią rozmowy.
    if (item.role === 'system') continue
    const text = item.content
      .map((part) => {
        switch (part.type) {
          case 'input_text':
          case 'output_text':
            return part.text
          case 'input_audio':
          case 'output_audio':
            // transcript bywa null, dopóki tura jest in_progress.
            return part.transcript ?? ''
          default:
            return ''
        }
      })
      .join(' ')
      .trim()
    if (!text) continue
    turns.push({
      speaker: item.role === 'user' ? 'learner' : 'tutor',
      text,
    })
  }
  return turns
}
