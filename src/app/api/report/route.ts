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
 * Outputs i zwraca raport. Udany raport jest best-effort archiwizowany (S-05);
 * błąd zapisu nie blokuje odpowiedzi. Auth weryfikowany tu niezależnie od proxy
 * (defense-in-depth).
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

  const { turns, topic } = parsedPayload.data
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

  let parsed
  try {
    // Konstruktor rzuca synchronicznie przy braku OPENAI_API_KEY — musi
    // siedzieć w try, żeby zła konfiguracja env dawała to samo 502.
    const client = new OpenAI()
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
  // substring korpusu ucznia. Białe znaki zwijane po obu stronach (model
  // potrafi znormalizować np. podwójną spację z ASR — bez tego prawdziwy
  // błąd wypadałby po cichu), ale per tura i z joinem przez '\n' — separator
  // tur nie może stać się spacją, bo przepuściłby cytat sklejony z granicy
  // dwóch tur.
  const collapseWhitespace = (text: string) =>
    text.replace(/\s+/g, ' ').trim()
  const learnerCorpus = learnerTurns
    .map((turn) => collapseWhitespace(turn.text))
    .join('\n')
  const groundedErrors = report.errors.filter((error) =>
    learnerCorpus.includes(collapseWhitespace(error.quote)),
  )
  const droppedCount = report.errors.length - groundedErrors.length
  if (droppedCount > 0) {
    console.warn(`report grounding gate dropped ${droppedCount} error(s)`)
  }

  const groundedReport = { ...report, errors: groundedErrors }

  // Archiwizacja sesji (S-05) — best-effort. Zapis idzie tym samym
  // user-scoped klientem (RLS wymusza user_id = auth.uid()), po bramce
  // groundingu, tak by utrwalić dokładnie ten raport, który dostaje klient.
  // Awaria DB nigdy nie blokuje raportu (główna wartość US-01 > nice-to-have
  // archiwum) — logujemy i lecimy dalej. Gałęzie „za mało materiału" i błędów
  // nie docierają tutaj, więc nie zapisują wiersza.
  try {
    const { error: insertError } = await supabase.from('sessions').insert({
      user_id: user.id,
      topic_id: topic.id,
      topic_title: topic.title,
      cefr_level: groundedReport.cefrLevel,
      error_count: groundedErrors.length,
      report: groundedReport,
      transcript: turns,
    })
    if (insertError) {
      console.error('report session insert failed:', insertError.message)
    }
  } catch (error) {
    console.error('report session insert threw:', error)
  }

  const response: ReportResponse = {
    kind: 'report',
    report: groundedReport,
  }
  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
