export type TopicCategory = 'work' | 'life'

export type Topic = {
  id: string
  title: string
  description: string
  category: TopicCategory
}

export const TOPICS: readonly Topic[] = [
  // --- work (15) ---
  {
    id: 'daily-standup',
    title: 'Daily standup',
    description:
      "Tell your team what you did yesterday, what you're working on today, and what's blocking you.",
    category: 'work',
  },
  {
    id: 'job-interview',
    title: 'Job interview',
    description:
      "You're interviewing for a developer role. Talk about your experience, your strengths, and why you want this job.",
    category: 'work',
  },
  {
    id: 'code-review',
    title: 'Code review discussion',
    description:
      'Discuss a pull request with a colleague: explain your feedback and defend your implementation choices.',
    category: 'work',
  },
  {
    id: 'explaining-a-bug',
    title: 'Explaining a bug',
    description:
      'Walk a colleague through a bug you found: what happens, how to reproduce it, and what you think causes it.',
    category: 'work',
  },
  {
    id: 'sprint-planning',
    title: 'Sprint planning',
    description:
      'Discuss upcoming tasks with your team: estimate effort, raise concerns, and agree on priorities.',
    category: 'work',
  },
  {
    id: 'explaining-your-project',
    title: 'Explaining your project',
    description:
      "A new teammate just joined. Describe what your project does, how it's built, and where they should start.",
    category: 'work',
  },
  {
    id: 'client-update',
    title: 'Client progress update',
    description:
      "Give a client a status update: what's done, what's delayed, and what happens next.",
    category: 'work',
  },
  {
    id: 'conference-networking',
    title: 'Conference networking',
    description:
      'You meet another developer at a tech conference. Introduce yourself and chat about what you both work on.',
    category: 'work',
  },
  {
    id: 'asking-for-help',
    title: 'Asking for help',
    description:
      "You're stuck on a task. Ask a colleague for help: describe the problem and what you've already tried.",
    category: 'work',
  },
  {
    id: 'sprint-retro',
    title: 'Sprint retrospective',
    description:
      "Share what went well this sprint, what didn't, and one thing the team should improve next time.",
    category: 'work',
  },
  {
    id: 'pair-programming',
    title: 'Pair programming',
    description:
      'Pair with a colleague on a tricky function: think out loud, suggest ideas, and react to theirs.',
    category: 'work',
  },
  {
    id: 'tech-decision-debate',
    title: 'Tech decision debate',
    description:
      'Argue for one library or approach over another with a teammate who disagrees, and respond to their points.',
    category: 'work',
  },
  {
    id: 'incident-postmortem',
    title: 'Incident postmortem',
    description:
      'Walk the team through a production outage: the timeline, the impact, the root cause, and the follow-ups.',
    category: 'work',
  },
  {
    id: 'salary-negotiation',
    title: 'Salary negotiation',
    description:
      'Negotiate your salary or rate with a manager or recruiter: make your case and handle pushback.',
    category: 'work',
  },
  {
    id: 'giving-feedback',
    title: 'Giving feedback',
    description:
      "Give a teammate honest, constructive feedback about something that isn't working, and keep it supportive.",
    category: 'work',
  },

  // --- life (15) ---
  {
    id: 'ordering-coffee',
    title: 'Ordering coffee',
    description:
      "You're at a coffee shop abroad. Order your drink, ask a few questions, and handle small talk with the barista.",
    category: 'life',
  },
  {
    id: 'restaurant-order',
    title: 'Ordering at a restaurant',
    description:
      "You're dining out abroad. Order food, ask about the menu, and sort out an issue with your meal.",
    category: 'life',
  },
  {
    id: 'hotel-checkin',
    title: 'Checking into a hotel',
    description:
      'Check into a hotel: confirm your booking, ask about the facilities, and fix a problem with your room.',
    category: 'life',
  },
  {
    id: 'asking-directions',
    title: 'Asking for directions',
    description:
      "You're lost in a new city. Ask a local for directions and confirm you understood them.",
    category: 'life',
  },
  {
    id: 'neighbor-small-talk',
    title: 'Meeting a neighbor',
    description:
      'Make small talk with a new neighbor: introduce yourself and chat about the area.',
    category: 'life',
  },
  {
    id: 'doctor-visit',
    title: 'At the doctor',
    description:
      'Describe your symptoms to a doctor and answer their questions about how you feel.',
    category: 'life',
  },
  {
    id: 'renting-apartment',
    title: 'Renting an apartment',
    description:
      'Talk to a landlord about renting a flat: ask about the price, the contract, and the neighborhood.',
    category: 'life',
  },
  {
    id: 'weekend-plans',
    title: 'Weekend plans',
    description:
      "Tell a friend about your weekend plans and ask what they're up to.",
    category: 'life',
  },
  {
    id: 'hobby-chat',
    title: 'Talking about a hobby',
    description:
      'Talk to someone about a hobby you love: how you got into it and why you enjoy it.',
    category: 'life',
  },
  {
    id: 'booking-a-trip',
    title: 'Booking a trip',
    description:
      "Book a trip with a travel agent: talk through dates, options, and what you're looking for.",
    category: 'life',
  },
  {
    id: 'movie-discussion',
    title: 'Talking about a film',
    description:
      "Discuss a film or series you recently watched with a friend: what you liked and what you didn't.",
    category: 'life',
  },
  {
    id: 'returning-a-purchase',
    title: 'Returning a purchase',
    description:
      'Return a faulty product to a shop: explain the problem and ask for a refund or a replacement.',
    category: 'life',
  },
  {
    id: 'gym-signup',
    title: 'Signing up at a gym',
    description:
      'Sign up at a gym: ask about membership, classes, and opening hours.',
    category: 'life',
  },
  {
    id: 'catching-up-friend',
    title: 'Catching up with a friend',
    description:
      "Catch up with an old friend you haven't seen in a while: share your news and ask about theirs.",
    category: 'life',
  },
  {
    id: 'cooking-recipe',
    title: 'Sharing a recipe',
    description:
      'Explain how to cook a dish you like to a friend who wants to try it: the ingredients and the steps.',
    category: 'life',
  },
]

/** Zwraca losowy element tablicy (zakłada niepustą tablicę). */
function pickRandom<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Losuje pojedynczy temat z wykluczeniem podanego id (FR-004).
 * Shim zgodny z S-02 — konsumenci (`page.tsx`, `session-start.tsx`) migrują na
 * `drawTopicSet` w Fazie 2; wtedy ta funkcja zostanie usunięta.
 */
export function drawTopic(excludeId?: string): Topic {
  const pool = TOPICS.filter((topic) => topic.id !== excludeId)
  return pickRandom(pool)
}

/**
 * Losuje zbalansowany zestaw 3 tematów: gwarantuje co najmniej jeden temat
 * z każdej kategorii (work / life), trzeci jest losowy z dowolnej kategorii,
 * a końcowa kolejność jest przetasowana (żeby pozycja karty nie zdradzała
 * kategorii). `exclude` pozwala wykluczyć poprzedni zestaw przy ponownym
 * losowaniu i przy „nowej sesji" (FR-004). Przy puli 30 (15/15) i wykluczeniu
 * max 3 tematów obie pod-pule zawsze mają dość elementów.
 */
export function drawTopicSet(exclude: readonly Topic[] = []): Topic[] {
  const excludedIds = new Set(exclude.map((topic) => topic.id))
  const available = TOPICS.filter((topic) => !excludedIds.has(topic.id))
  const work = available.filter((topic) => topic.category === 'work')
  const life = available.filter((topic) => topic.category === 'life')

  const first = pickRandom(work)
  const second = pickRandom(life)
  const chosen = new Set([first.id, second.id])
  const third = pickRandom(available.filter((topic) => !chosen.has(topic.id)))

  const set = [first, second, third]
  // Tasowanie Fisher–Yates, żeby kolejność kart nie odpowiadała kategorii.
  for (let i = set.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[set[i], set[j]] = [set[j], set[i]]
  }
  return set
}
