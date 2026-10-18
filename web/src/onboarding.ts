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
] as const

export const GATHERING_SIZES = [
  { value: "2-5", label: "2-5 people" },
  { value: "6-15", label: "6-15 people" },
  { value: "16-40", label: "16-40 people" },
  { value: "40+", label: "40 or more" },
] as const

export const PROFILE_FIELDS: {
  key: TopicKey
  title: string
  knows: string
  wants: string
  knowsHint: string
  wantsHint: string
}[] = [
  {
    key: "languages",
    title: "Languages",
    knows: "Languages you speak",
    wants: "Languages you want to learn",
    knowsHint: "Hindi, English",
    wantsHint: "Punjabi",
  },
  {
    key: "locations",
    title: "Places",
    knows: "Places you know",
    wants: "Places you want to learn about",
    knowsHint: "Chandigarh",
    wantsHint: "Seattle",
  },
  {
    key: "hobbies",
    title: "Hobbies",
    knows: "Hobbies you do",
    wants: "Hobbies you want to try",
    knowsHint: "Cooking",
    wantsHint: "Tabla",
  },
  {
    key: "interests",
    title: "Interests",
    knows: "Interests you have",
    wants: "Interests you want to explore",
    knowsHint: "Classical music",
    wantsHint: "Folk dance",
  },
  {
    key: "festivals",
    title: "Festivals",
    knows: "Festivals you know",
    wants: "Festivals you want to learn about",
    knowsHint: "Diwali",
    wantsHint: "Holi",
  },
]

export const GROUPED_TOPIC_KEYS = ["hobbies", "locations", "interests", "festivals"] as const

export const PREFERENCE_GROUP_LABELS = {
  knows: "Preferences you already have",
  wants: "Preferences you want",
} as const

export const FLOW_STEPS: { id: FlowStepId; title: string }[] = [
  { id: "about", title: "About you" },
  { id: "reach", title: "How you want to be reached" },
  { id: "preferences", title: "Your preferences" },
]

export type FlowStepId = "about" | "reach" | "preferences"

export function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

export function parseList(value: string): string[] {
  const seen = new Set<string>()
  const items: string[] = []
  for (const part of value.split(",")) {
    const text = cleanText(part)
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
  if (step === "reach") return null
  if (step === "about") return aboutProblem(input)

  const languages = PROFILE_FIELDS.find((field) => field.key === "languages")
  if (!languages) return null
  const languageProblem = topicProblem(input.languages, languages.knows, languages.wants)
  if (languageProblem) return languageProblem
  return topicProblem(
    input.interests,
    PREFERENCE_GROUP_LABELS.knows,
    PREFERENCE_GROUP_LABELS.wants,
  )
}
