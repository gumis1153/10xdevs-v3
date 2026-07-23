import { createHash } from 'node:crypto'

import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'

import { buildReportInstructions, formatTranscript } from '@/lib/report/prompt'
import {
  ReportSchema,
  TurnsPayloadSchema,
  type ReportResponse,
} from '@/lib/report/schema'
import { createClient } from '@/lib/supabase/server'

// Zapas na wywołanie modelu (reasoning effort: low → pojedyncze sekundy);
// daleko poniżej capu 300 s na planie Hobby.
export const maxDuration = 30

// Deterministyczna bramka materiału: poniżej tego progu słów ucznia analiza
// nie ma sensu (Guardrail „za mało materiału") — model nie jest wołany.
const MIN_LEARNER_WORDS = 40

const REPORT_MODEL = 'gpt-5.6-luna'

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/**
 * Jednorazowa ocena rozmowy (S-04, FR-010–FR-013): przyjmuje tekstowe tury
 * rozmowy, ocenia tury ucznia w skali CEFR przez Responses API + Structured
 * Outputs i zwraca raport. Bezstanowe — nic nie jest utrwalane (S-05).
 * Auth weryfikowany tu niezależnie od proxy (defense-in-depth).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser()

  // Brak sesji to stan normalny (401 niżej); loguj tylko realne awarie.
  if (getUserError && getUserError.name !== 'AuthSessionMissingError') {
    console.error('report getUser failed:', getUserError.message)
  }

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Stabilny pseudonim użytkownika dla OpenAI — ten sam hash, który token
  // route wysyła jako nagłówek OpenAI-Safety-Identifier; tu idzie jako
  // natywny parametr safety_identifier wywołania Responses.
  const safetyIdentifier = createHash('sha256').update(user.id).digest('hex')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const parsedPayload = TurnsPayloadSchema.safeParse(body)
  if (!parsedPayload.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const { turns } = parsedPayload.data
  const learnerTurns = turns.filter((turn) => turn.speaker === 'learner')

  const learnerWordCount = learnerTurns.reduce(
    (sum, turn) => sum + countWords(turn.text),
    0,
  )
  if (learnerWordCount < MIN_LEARNER_WORDS) {
    const response: ReportResponse = {
      kind: 'insufficient_material',
      learnerWordCount,
    }
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const client = new OpenAI()
  let parsed
  try {
    parsed = await client.responses.parse({
      model: REPORT_MODEL,
      reasoning: { effort: 'low' },
      safety_identifier: safetyIdentifier,
      instructions: buildReportInstructions(),
      input: formatTranscript(turns),
      text: { format: zodTextFormat(ReportSchema, 'session_report') },
    })
  } catch (error) {
    console.error('report responses.parse failed:', error)
    return NextResponse.json({ error: 'upstream_error' }, { status: 502 })
  }

  // Zamiast raportu model może zwrócić odmowę — traktuj jako brak analizy.
  const refusal = parsed.output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content)
    .find((part) => part.type === 'refusal')
  if (refusal || !parsed.output_parsed) {
    if (refusal) {
      console.error('report analysis refused:', refusal.refusal)
    }
    return NextResponse.json({ error: 'analysis_failed' }, { status: 502 })
  }

  const report = parsed.output_parsed

  // Bramka groundingu (anty-halucynacja): każdy błąd musi cytować dosłowny
  // substring korpusu ucznia. Join przez '\n' — konkatenacja bez separatora
  // zaakceptowałaby cytat sklejony z granicy dwóch tur.
  const learnerCorpus = learnerTurns.map((turn) => turn.text).join('\n')
  const groundedErrors = report.errors.filter((error) =>
    learnerCorpus.includes(error.quote),
  )
  const droppedCount = report.errors.length - groundedErrors.length
  if (droppedCount > 0) {
    console.warn(`report grounding gate dropped ${droppedCount} error(s)`)
  }

  const response: ReportResponse = {
    kind: 'report',
    report: { ...report, errors: groundedErrors },
  }
  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
