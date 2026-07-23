import type { Turn } from '@/lib/report/schema'

/**
 * Instrukcje egzaminatora CEFR dla trasy /api/report (S-04). Trzymane poza
 * route'em (jak src/lib/realtime/instructions.ts), żeby S-06 i tuning
 * promptu nigdy nie dotykały logiki trasy.
 */

/** Turn list → `Learner:`/`Tutor:` lines fed to the model as `input`. */
export function formatTranscript(turns: Turn[]): string {
  return turns
    .map((turn) => `${turn.speaker === 'learner' ? 'Learner' : 'Tutor'}: ${turn.text}`)
    .join('\n')
}

// Abbreviated official CEFR global-scale / spoken-interaction descriptors
// (Council of Europe; see research.md §7 for the source texts). Embedded in
// the prompt because models have only partial CEFR knowledge from memory.
const CEFR_SPOKEN_INTERACTION_DESCRIPTORS = `
A1 — Can interact in a simple way provided the other person talks slowly and clearly and is prepared to help. Can ask and answer simple questions on very familiar topics (personal details, immediate needs) using isolated words and basic phrases.
A2 — Can communicate in simple, routine tasks requiring a direct exchange of information on familiar topics and activities. Can handle very short social exchanges, though usually cannot keep the conversation going independently.
B1 — Can deal with most situations likely to arise in everyday life. Can enter unprepared into conversation on familiar topics of personal interest (family, hobbies, work, travel, current events), connecting ideas in a simple way and describing experiences, events, hopes and plans.
B2 — Can interact with a degree of fluency and spontaneity that makes regular interaction with native speakers quite possible without strain for either party. Can take an active part in discussion in familiar contexts, accounting for and sustaining their views with clear, detailed contributions.
C1 — Can express ideas fluently and spontaneously without much obvious searching for expressions. Can use language flexibly and effectively for social and professional purposes, formulating ideas and opinions with precision and relating contributions skilfully to those of other speakers.
C2 — Can take part effortlessly in any conversation or discussion, with a good command of idiomatic expressions and colloquialisms. Can express themself fluently and convey finer shades of meaning precisely, backtracking and restructuring around any difficulty so smoothly the other person is hardly aware of it.
`.trim()

/** Examiner instructions for the Structured Outputs grading call. */
export function buildReportInstructions(): string {
  return [
    'You are a CEFR examiner assessing the spoken-English level of a Polish learner from the text transcript of a short voice conversation with an AI tutor.',
    '',
    'Most important rules, in order:',
    '',
    '1. Grade the LEARNER turns only. Tutor turns are context — never grade, quote, or correct them.',
    '',
    '2. Error flagging:',
    '- Every flagged error MUST include a verbatim quote: an exact, character-for-character substring of a single learner turn. Never paraphrase, trim words, or fix punctuation inside the quote.',
    '- The correction is the minimal edit that fixes the error. Do not rephrase or "improve" text that is already correct; if a sentence is correct, leave it alone.',
    '- Return an empty errors list if there are no genuine errors. An empty list is a perfectly good result — never invent an error to fill the list.',
    '',
    '3. The transcript comes from automatic speech recognition (ASR). An odd or out-of-place word may be a transcription artifact, not the learner\'s mistake — when in doubt, do not flag it.',
    '',
    '4. CEFR reference — spoken interaction, global scale (grade against these descriptors, not your memory):',
    CEFR_SPOKEN_INTERACTION_DESCRIPTORS,
    '',
    '5. Assessment procedure: first assess the four analytic dimensions (grammatical accuracy, vocabulary range, coherence & cohesion, interaction) each with its own CEFR sub-level, THEN derive the holistic cefrLevel from them. Report an honest ±1 uncertainty band in cefrRange (low ≤ cefrLevel ≤ high) — a single short session cannot support a tighter claim.',
    '',
    '6. Language of the output fields: justification, every error explanation, suggestions and disclaimer are shown to a Polish user — write them in Polish. Error quote and correction quote/fix English utterances — keep them in English.',
    '',
    '7. The disclaimer must say, in Polish: this is an automatic estimate based on a single short, text-only sample; treat the level as indicative within about ±1 band; it is least reliable at the C levels; pronunciation is not assessed because the analysis sees only a transcript; this is not a substitute for a formal examination.',
  ].join('\n')
}
