# OpenAI Responses API + Structured Outputs — implementation reference

> Context7-sourced snapshot (2026-07-23) for the `post-session-report` (S-04) analysis step.
> Source library: `/websites/developers_openai_api` (official OpenAI API docs).
> Companion to `research.md` §10–§11. Artifacts in English (project convention).
>
> **Scope**: the SEPARATE, server-side, one-shot call that takes a finished conversation
> transcript and returns a structured CEFR report. This is NOT the realtime session
> (that is `@openai/agents-realtime`, see `docs-openai-agents-realtime.md` in the
> `first-voice-conversation` change). This call uses the plain `openai` SDK.

## 0. Package situation (verified against node_modules)

- `openai@6.48.0` is present **transitively** (`@openai/agents-realtime` → `@openai/agents-core` → `openai`).
- **Add it as an explicit direct dependency**: `npm i openai` (pin to `^6.48.0` to avoid a second copy). Relying on hoisting is fragile.
- `zod` is already a direct dep (v4). The SDK peer-accepts `^3.25 || ^4.0`; the zod helper supports the v4 type shape. No blocker.
- Do **not** use `@openai/agents` (Agents SDK) for this — it is for multi-step agent loops. A single grading call is a plain `responses.parse()`.

## 1. API choice: Responses API (not Chat Completions)

Official guidance: *"While Chat Completions remains supported, Responses is recommended for all new projects."*
Source: https://developers.openai.com/api/docs/guides/migrate-to-responses

Key migration fact for structured outputs: **the schema moved from `response_format` (Chat Completions) to `text.format` (Responses)**.
Source: https://developers.openai.com/api/docs/guides/migrate-to-responses

## 2. Minimal text generation shape (Responses API)

```javascript
import OpenAI from "openai";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.responses.create({
  model: "gpt-5.6",
  instructions: "You are a helpful assistant.", // system-level guidance
  input: "Hello!",                              // a plain string OR an array of role messages
});

console.log(response.output_text);
```
Source: https://developers.openai.com/api/docs/guides/responses-vs-chat-completions

`input` also accepts the role-message array form:
```javascript
input: [
  { role: "system", content: "..." },
  { role: "user", content: transcript },
]
```

## 3. Reasoning effort (latency control)

```javascript
const response = await client.responses.create({
  model: "gpt-5.6",
  reasoning: { effort: "low" },   // basic tasks; keeps latency down
  input: [{ role: "user", content: prompt }],
});
console.log(response.output_text);
```
Source: https://developers.openai.com/api/docs/guides/reasoning

Effort values available in the installed SDK (`openai/resources/shared.d.ts`): `none | minimal | low | medium | high | xhigh | max`.
For a short grading call use `low` (or `minimal`) — high effort makes reasoning models slow.

## 4. Structured Outputs with the zod helper (RECOMMENDED path)

Use `zodTextFormat(schema, name)` from `openai/helpers/zod` + `client.responses.parse()`.
`responses.parse()` returns a parsed response; read the validated typed object from `output_parsed`,
and check for a `refusal` in the output items.

```javascript
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const openai = new OpenAI();

const Step = z.object({ explanation: z.string(), output: z.string() });
const MathReasoning = z.object({ steps: z.array(Step), final_answer: z.string() });

const response = await openai.responses.parse({
  model: "gpt-5.6",
  input: [
    { role: "system", content: "You are a helpful math tutor. Guide the user step by step." },
    { role: "user", content: "how can I solve 8x + 7 = -23" },
  ],
  text: {
    format: zodTextFormat(MathReasoning, "math_response"),
  },
});

// Convenience: response.output_parsed is the typed, schema-validated object.
// Or iterate output items to also catch refusals (corrected from the docs snippet,
// which had `response.content` — it should be `output.content`):
for (const output of response.output) {
  if (output.type !== "message") continue;
  for (const item of output.content) {
    if (item.type === "refusal") {
      console.log(item.refusal); // model declined — handle gracefully
      continue;
    }
    if (!item.parsed) throw new Error("Could not parse response");
    console.log(item.parsed);
  }
}
```
Source: https://developers.openai.com/api/docs/guides/structured-outputs

## 5. Structured Outputs — raw JSON-schema shape (no zod)

If not using the helper, pass the schema directly under `text.format`:

```javascript
const response = await openai.responses.create({
  model: "gpt-5.6",
  input: "Jane, 54 years old",
  text: {
    format: {
      type: "json_schema",
      name: "person",
      strict: true,
      schema: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          age:  { type: "number", minimum: 0, maximum: 130 },
        },
        required: ["name", "age"],
        additionalProperties: false,
      },
    },
  },
});
// then JSON.parse(response.output_text)
```
Source: https://developers.openai.com/api/docs/guides/responses-vs-chat-completions

**Strict-mode rules** (the zod helper generates these for you):
- every object needs `additionalProperties: false`
- every property must be listed in `required`
- ⇒ model optional fields as `.nullable()`, **not** `.optional()`, in zod
- `z.enum([...])` maps cleanly to JSON-schema enums (use for `cefrLevel`, mistake `category`)

## 6. Refusals

`responses.parse()` output items can carry `{ type: "refusal", refusal: "<message>" }` instead of parsed content.
Always handle it — treat as "analysis unavailable", not as a report. Example refusal response body:
```json
{
  "output": [{
    "type": "message", "role": "assistant",
    "content": [{ "type": "refusal", "refusal": "I'm sorry, I cannot assist with that request." }]
  }]
}
```
Source: https://developers.openai.com/api/docs/guides/structured-outputs

## 7. Model name (Open Question #1 — partially resolved)

- The official OpenAI API docs examples (Context7, 2026-07-23) consistently use **`model: "gpt-5.6"`** — so `gpt-5.6` is a **real current model alias**, corroborating the external research.
- The sub-variant names from the exa research (`gpt-5.6-luna` / `-terra` / `-sol`) were **NOT** seen in the Context7 docs snapshot — treat those as still-unverified. Confirm the exact alias + pricing against the live models/pricing page before locking it in `plan.md`:
  - https://developers.openai.com/api/docs/models
  - https://developers.openai.com/api/docs/pricing
- Principle regardless of exact alias: a cheap model + `reasoning.effort: "low"` + strict Structured Outputs. Transcript is tiny (~hundreds–2k tokens), cost is a fraction of a cent. Validate grading quality on a sample of real transcripts.

## 8. Report schema (applied — see research.md §11 for rationale)

```ts
import { z } from "zod";

const CEFR = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const ReportSchema = z.object({
  cefrLevel: CEFR.describe("Holistic CEFR level for the whole session"),
  cefrRange: z.object({ low: CEFR, high: CEFR })
    .describe("Honest ±1 uncertainty band around the holistic level"),
  confidence: z.number().describe("0..1 soft signal only; not a validated probability"),
  analytic: z.object({
    grammaticalAccuracy: CEFR,
    vocabularyRange: CEFR,
    coherenceCohesion: CEFR,
    interaction: CEFR,
  }).describe("Per-dimension sub-levels, derived before the holistic verdict"),
  justification: z.string().describe("Rationale AFTER the analytic reasoning"),
  errors: z.array(z.object({
    quote: z.string().describe("VERBATIM substring from a LEARNER turn only"),
    correction: z.string().describe("Minimal-edit fix; do not rephrase correct text"),
    category: z.enum(["grammar", "vocabulary", "syntax", "word-order"]),
    explanation: z.string(),
  })).describe("MAY be empty — return [] when no genuine errors are found"),
  suggestions: z.array(z.string()),
  disclaimer: z.string().describe("Single-session, text-only, indicative estimate wording"),
});

// text: { format: zodTextFormat(ReportSchema, "session_report") }
// -> response.output_parsed : z.infer<typeof ReportSchema>
```
Note on `category`: research.md §9 shows "pronunciation" is NOT assessable from a text transcript — decide in `plan.md` whether to drop/relabel it (this schema drops it).

## 9. Anti-hallucination (the #1 product guardrail) — enforce in prompt + code

Prompt-side (from research.md §8):
- require a **verbatim quote from the transcript** for every flagged error
- explicit: **"return an empty list if there are no errors"** — the Structured Outputs guide warns the model "will always try to adhere to the schema, which can result in hallucinations if the input is unrelated"
- minimal-edit framing; only flag **learner** turns
Code-side (deterministic, after parsing):
- reject any `errors[].quote` that is not an exact substring of the transcript (grounding gate)
- schema validity ≠ semantic validity — validate content, not just shape
Sources: https://developers.openai.com/api/docs/guides/structured-outputs and research.md §8.
