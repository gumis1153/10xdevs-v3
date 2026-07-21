export type Topic = {
  id: string
  title: string
  description: string
}

export const TOPICS: readonly Topic[] = [
  {
    id: 'daily-standup',
    title: 'Daily standup',
    description:
      "Tell your team what you did yesterday, what you're working on today, and what's blocking you.",
  },
  {
    id: 'job-interview',
    title: 'Job interview',
    description:
      "You're interviewing for a developer role. Talk about your experience, your strengths, and why you want this job.",
  },
  {
    id: 'code-review',
    title: 'Code review discussion',
    description:
      'Discuss a pull request with a colleague: explain your feedback and defend your implementation choices.',
  },
  {
    id: 'ordering-coffee',
    title: 'Ordering coffee',
    description:
      "You're at a coffee shop abroad. Order your drink, ask a few questions, and handle small talk with the barista.",
  },
  {
    id: 'explaining-a-bug',
    title: 'Explaining a bug',
    description:
      'Walk a colleague through a bug you found: what happens, how to reproduce it, and what you think causes it.',
  },
  {
    id: 'sprint-planning',
    title: 'Sprint planning',
    description:
      'Discuss upcoming tasks with your team: estimate effort, raise concerns, and agree on priorities.',
  },
  {
    id: 'explaining-your-project',
    title: 'Explaining your project',
    description:
      "A new teammate just joined. Describe what your project does, how it's built, and where they should start.",
  },
  {
    id: 'client-update',
    title: 'Client progress update',
    description:
      "Give a client a status update: what's done, what's delayed, and what happens next.",
  },
  {
    id: 'conference-networking',
    title: 'Conference networking',
    description:
      'You meet another developer at a tech conference. Introduce yourself and chat about what you both work on.',
  },
  {
    id: 'asking-for-help',
    title: 'Asking for help',
    description:
      "You're stuck on a task. Ask a colleague for help: describe the problem and what you've already tried.",
  },
]

/**
 * Losuje temat z TOPICS; excludeId gwarantuje, że ponowne losowanie
 * nigdy nie zwróci aktualnie wyświetlanego tematu (FR-004).
 */
export function drawTopic(excludeId?: string): Topic {
  const pool = TOPICS.filter((topic) => topic.id !== excludeId)
  return pool[Math.floor(Math.random() * pool.length)]
}
