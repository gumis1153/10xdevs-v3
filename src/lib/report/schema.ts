import { z } from 'zod'

/**
 * Shared contract for the post-session report (S-04): the request payload,
 * the Structured Outputs schema for the grading call, and the route response
 * union — imported by both `/api/report` and the client UI.
 *
 * Strict-mode rules (OpenAI Structured Outputs): every object gets
 * `additionalProperties: false` and all fields are required — model optional
 * fields as `.nullable()`, never `.optional()`.
 */

const CEFR = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

export type CefrLevel = z.infer<typeof CEFR>

export const TurnsPayloadSchema = z.object({
  turns: z
    .array(
      z.object({
        speaker: z.enum(['learner', 'tutor']),
        text: z.string().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(200),
})

export type TurnsPayload = z.infer<typeof TurnsPayloadSchema>
export type Turn = TurnsPayload['turns'][number]

export const ReportSchema = z.object({
  cefrLevel: CEFR.describe('Holistic CEFR level for the whole session'),
  cefrRange: z
    .object({ low: CEFR, high: CEFR })
    .describe('Honest ±1 uncertainty band around the holistic level'),
  // confidence is not rendered in v1 — kept as raw material for S-05+ (persisted
  // reports enable threshold calibration / logging of low-confidence gradings).
  confidence: z.number().describe('0..1 soft signal only; not a validated probability'),
  analytic: z
    .object({
      grammaticalAccuracy: CEFR,
      vocabularyRange: CEFR,
      coherenceCohesion: CEFR,
      interaction: CEFR,
    })
    .describe('Per-dimension sub-levels, derived before the holistic verdict'),
  justification: z.string().describe('Polish; rationale AFTER the analytic reasoning'),
  errors: z
    .array(
      z.object({
        quote: z.string().describe('VERBATIM substring from a LEARNER turn only'),
        correction: z.string().describe('English; minimal-edit fix, no rephrasing of correct text'),
        category: z.enum(['grammar', 'vocabulary', 'syntax', 'word-order']),
        explanation: z.string().describe('Polish; short, learner-friendly'),
      }),
    )
    .describe('MAY be empty — return [] when no genuine errors are found'),
  suggestions: z.array(z.string()).describe('Polish; concrete study suggestions from THIS session'),
  disclaimer: z.string().describe('Polish; single-session, text-only, ±1-band, no-pronunciation wording'),
})

export type Report = z.infer<typeof ReportSchema>

export type ReportResponse =
  | { kind: 'report'; report: Report }
  | { kind: 'insufficient_material'; learnerWordCount: number }
