export const TOPIC_KEYS = [
  "languages",
  "locations",
  "hobbies",
  "interests",
  "festivals",
] as const

export type TopicKey = (typeof TOPIC_KEYS)[number]
export type TopicSide = "knows" | "wants_to_learn"

export type Knowledge = {
  knows: string[]
  wants_to_learn: string[]
}

export type OnboardingInput = {
  username: string
  first_name: string
  location: string
  age: number
  gathering_size: string
} & Record<TopicKey, Knowledge>

export type OnboardingProfile = OnboardingInput & {
  user_id: string
  created_at: string | null
  updated_at: string | null
}

export const ONBOARDING_LIMITS = {
  username: 40,
  first_name: 80,
  location: 80,
  ageMin: 13,
  ageMax: 120,
  item: 80,
  list: 20,
}

export const CITIES = [
  "Seattle",
  "Portland",
  "San Francisco",
  "Los Angeles",
  "Austin",
  "Denver",
  "Chicago",
  "New York",
  "Boston",
  "Toronto",
  "Vancouver",
  "London",
  "Delhi",
  "Chandigarh",
] as const

export const GATHERING_SIZES = [
  { value: "2-5", label: "2-5 people" },
  { value: "6-15", label: "6-15 people" },
  { value: "16-40", label: "16-40 people" },
  { value: "40+", label: "40 or more" },
] as const

export const PROFILE_FIELDS: {
  key: TopicKey
  knows: string
  wants: string
}[] = [
  {
    key: "languages",
    knows: "Languages you speak",
    wants: "Languages you want to learn",
  },
  {
    key: "locations",
    knows: "Places you know",
    wants: "Places you want to learn about",
  },
  {
    key: "hobbies",
    knows: "Hobbies you do",
    wants: "Hobbies you want to try",
  },
  {
    key: "interests",
    knows: "Interests you have",
    wants: "Interests you want to explore",
  },
  {
    key: "festivals",
    knows: "Festivals you know",
    wants: "Festivals you want to learn about",
  },
]

export const GROUPED_TOPIC_KEYS = ["hobbies", "locations", "interests", "festivals"] as const

export const PREFERENCE_GROUP_LABELS = {
  knows: "Preferences you already have",
  wants: "Preferences you want",
} as const

/** One-tap interests outside music. Spotify only fills the music side. */
export const INTEREST_STARTERS = ["Basketball", "Soccer", "Hiking", "Cooking", "Art", "Games"] as const

export const FLOW_STEPS: { id: FlowStepId; title: string; label: string }[] = [
  { id: "spotify", title: "Start from Spotify", label: "Spotify" },
  { id: "about", title: "About you", label: "You" },
  { id: "reach", title: "How you want to be reached", label: "Reach" },
  { id: "preferences", title: "Your preferences", label: "Preferences" },
]

export type FlowStepId = "spotify" | "about" | "reach" | "preferences"

export function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function parseList(value: string): string[] {
  return parseListPreserving(value, [])
}

/** Split a comma list, keeping phrases such as "Tyler, The Creator" intact. */
export function parseListPreserving(value: string, keep: readonly string[]): string[] {
  const ranked = [...keep]
    .map((item) => cleanText(item))
    .filter((item) => item.includes(","))
    .sort((left, right) => right.length - left.length)

  let working = value
  const slots: string[] = []
  for (const item of ranked) {
    const needle = item.toLocaleLowerCase()
    let cursor = 0
    while (cursor <= working.length) {
      const found = working.toLocaleLowerCase().indexOf(needle, cursor)
      if (found === -1) break
      const token = `\u0000${slots.length}\u0000`
      slots.push(cleanText(working.slice(found, found + item.length)))
      working = `${working.slice(0, found)}${token}${working.slice(found + item.length)}`
      cursor = found + token.length
    }
  }

  const seen = new Set<string>()
  const items: string[] = []
  for (const part of working.split(",")) {
    const token = part.match(/^\s*\u0000(\d+)\u0000\s*$/)
    const text = token ? slots[Number(token[1])] : cleanText(part)
    if (!text) continue
    const key = text.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(text)
  }
  return items
}

export function formatList(items: string[]): string {
  return items.join(", ")
}

export function unionGrouped(
  source: Pick<OnboardingInput, (typeof GROUPED_TOPIC_KEYS)[number]>,
  side: TopicSide,
): string[] {
  const seen = new Set<string>()
  const items: string[] = []
  for (const key of GROUPED_TOPIC_KEYS) {
    for (const raw of source[key][side]) {
      const text = cleanText(raw)
      if (!text) continue
      const id = text.toLocaleLowerCase()
      if (seen.has(id)) continue
      seen.add(id)
      items.push(text)
    }
  }
  return items
}

function listProblem(items: string[], label: string): string | null {
  if (items.length > ONBOARDING_LIMITS.list) {
    return `${label} can list at most ${ONBOARDING_LIMITS.list} items.`
  }
  for (const item of items) {
    if (item.length > ONBOARDING_LIMITS.item) {
      return `${label} has an item longer than ${ONBOARDING_LIMITS.item} characters.`
    }
  }
  return null
}

function topicProblem(topic: Knowledge, knowsLabel: string, wantsLabel: string): string | null {
  return listProblem(topic.knows, knowsLabel) ?? listProblem(topic.wants_to_learn, wantsLabel)
}

function aboutProblem(input: OnboardingInput): string | null {
  const username = cleanText(input.username)
  const firstName = cleanText(input.first_name)
  if (!username) return "Enter a user name."
  if (username.length > ONBOARDING_LIMITS.username) return "User name can be at most 40 characters."
  if (!firstName) return "Enter a first name."
  if (firstName.length > ONBOARDING_LIMITS.first_name) {
    return "First name can be at most 80 characters."
  }
  const location = cleanText(input.location)
  if (!CITIES.some((city) => city.toLocaleLowerCase() === location.toLocaleLowerCase())) {
    return "Choose a city."
  }
  if (!Number.isInteger(input.age)) return "Enter your age."
  if (input.age < ONBOARDING_LIMITS.ageMin || input.age > ONBOARDING_LIMITS.ageMax) {
    return "Age must be from 13 to 120."
  }
  if (!GATHERING_SIZES.some((size) => size.value === input.gathering_size)) {
    return "Choose a gathering size."
  }
  return null
}

export function validateOnboarding(input: OnboardingInput): string | null {
  const about = aboutProblem(input)
  if (about) return about

  for (const field of PROFILE_FIELDS) {
    const problem = topicProblem(input[field.key], field.knows, field.wants)
    if (problem) return problem
  }
  return null
}

export function validateFlowStep(step: FlowStepId, input: OnboardingInput): string | null {
  if (step === "spotify" || step === "reach") return null
  if (step === "about") return aboutProblem(input)

  for (const field of PROFILE_FIELDS) {
    const problem = topicProblem(input[field.key], field.knows, field.wants)
    if (problem) return problem
  }
  return null
}
