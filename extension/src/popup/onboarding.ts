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
}[] = [
  {
    key: "languages",
    title: "Languages",
    knows: "Languages you speak",
    wants: "Languages you want to learn",
  },
  {
    key: "locations",
    title: "Places",
    knows: "Places you know",
    wants: "Places you want to learn about",
  },
  {
    key: "hobbies",
    title: "Hobbies",
    knows: "Hobbies you do",
    wants: "Hobbies you want to try",
  },
  {
    key: "interests",
    title: "Interests",
    knows: "Interests you have",
    wants: "Interests you want to explore",
  },
  {
    key: "festivals",
    title: "Festivals",
    knows: "Festivals you know",
    wants: "Festivals you want to learn about",
  },
]

export const FLOW_STEPS: { id: FlowStepId; title: string }[] = [
  { id: "you", title: "About you" },
  { id: "where", title: "Where you are" },
  { id: "gathering", title: "Gathering size" },
  ...PROFILE_FIELDS.map((field) => ({ id: field.key, title: field.title })),
]

export type FlowStepId = "you" | "where" | "gathering" | TopicKey

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

export function validateOnboarding(input: OnboardingInput): string | null {
  const username = cleanText(input.username)
  const firstName = cleanText(input.first_name)
  if (!username) return "Enter a user name."
  if (username.length > ONBOARDING_LIMITS.username) return "User name can be at most 40 characters."
  if (!firstName) return "Enter a first name."
  if (firstName.length > ONBOARDING_LIMITS.first_name) {
    return "First name can be at most 80 characters."
  }
  const location = cleanText(input.location)
  if (!location) return "Enter a location."
  if (location.length > ONBOARDING_LIMITS.location) {
    return "Location can be at most 80 characters."
  }
  if (!Number.isInteger(input.age)) return "Enter your age."
  if (input.age < ONBOARDING_LIMITS.ageMin || input.age > ONBOARDING_LIMITS.ageMax) {
    return "Age must be from 13 to 120."
  }
  if (!GATHERING_SIZES.some((size) => size.value === input.gathering_size)) {
    return "Choose a gathering size."
  }

  for (const field of PROFILE_FIELDS) {
    const topic = input[field.key]
    const sides = [
      ["knows", field.knows],
      ["wants_to_learn", field.wants],
    ] as const
    for (const [side, label] of sides) {
      const items = topic[side]
      if (items.length > ONBOARDING_LIMITS.list) {
        return `${label} can list at most ${ONBOARDING_LIMITS.list} items.`
      }
      for (const item of items) {
        if (item.length > ONBOARDING_LIMITS.item) {
          return `${label} has an item longer than ${ONBOARDING_LIMITS.item} characters.`
        }
      }
    }
  }
  return null
}

export function validateFlowStep(step: FlowStepId, input: OnboardingInput): string | null {
  if (step === "you") {
    const username = cleanText(input.username)
    const firstName = cleanText(input.first_name)
    if (!username) return "Enter a user name."
    if (username.length > ONBOARDING_LIMITS.username) return "User name can be at most 40 characters."
    if (!firstName) return "Enter a first name."
    if (firstName.length > ONBOARDING_LIMITS.first_name) {
      return "First name can be at most 80 characters."
    }
    if (!Number.isInteger(input.age)) return "Enter your age."
    if (input.age < ONBOARDING_LIMITS.ageMin || input.age > ONBOARDING_LIMITS.ageMax) {
      return "Age must be from 13 to 120."
    }
    return null
  }

  if (step === "where") {
    const location = cleanText(input.location)
    if (!location) return "Enter a location."
    if (location.length > ONBOARDING_LIMITS.location) {
      return "Location can be at most 80 characters."
    }
    return null
  }

  if (step === "gathering") {
    if (!GATHERING_SIZES.some((size) => size.value === input.gathering_size)) {
      return "Choose a gathering size."
    }
    return null
  }

  const field = PROFILE_FIELDS.find((item) => item.key === step)
  if (!field) return null
  const topic = input[field.key]
  const sides = [
    ["knows", field.knows],
    ["wants_to_learn", field.wants],
  ] as const
  for (const [side, label] of sides) {
    const items = topic[side]
    if (items.length > ONBOARDING_LIMITS.list) {
      return `${label} can list at most ${ONBOARDING_LIMITS.list} items.`
    }
    for (const item of items) {
      if (item.length > ONBOARDING_LIMITS.item) {
        return `${label} has an item longer than ${ONBOARDING_LIMITS.item} characters.`
      }
    }
  }
  return null
}
