import { TOPIC_KEYS, type OnboardingInput, type TopicKey } from "./onboarding"

export type SamplePerson = OnboardingInput & {
  id: string
}

export type SampleProfile = SamplePerson & {
  compatibility_score: number
  matched_on: string[]
}

/** Signed-out walkthrough. Seattle, wants Spanish and dance. */
export const VIEWER_PROFILE: OnboardingInput = {
  username: "you",
  first_name: "You",
  location: "Seattle",
  age: 28,
  gathering_size: "6-15",
  languages: { knows: ["English", "Hindi"], wants_to_learn: ["Spanish"] },
  locations: { knows: ["Seattle"], wants_to_learn: ["Chandigarh"] },
  hobbies: { knows: ["Cooking"], wants_to_learn: ["Dance"] },
  interests: { knows: ["Classical music"], wants_to_learn: ["Folk dance"] },
  festivals: { knows: ["Diwali"], wants_to_learn: ["Holi"] },
}

const FIRST_NAMES = [
  "Amira", "Noah", "Priya", "Leo", "Sofia", "Arjun", "Maya", "Jonah", "Leila", "Owen",
  "Anika", "Hugo", "Mei", "Samir", "Clara", "Ravi", "Nora", "Idris", "Hana", "Felix",
  "Aisha", "Mateo", "Diya", "Julian", "Ines", "Kabir", "Elena", "Soren", "Fatima", "Andre",
  "Nia", "Omar", "Yara", "Theo", "Laila", "Dev", "Iris", "Hassan", "Chloe", "Vikram",
  "Esme", "Rohan", "Amina", "Luca", "Zara", "Nikhil", "Freya", "Yusuf", "Ava", "Kiran",
  "Mila", "Adeel", "Sana", "Oscar", "Ananya", "Nico", "Noor", "Ibrahim", "Pia", "Harsh",
  "Lina", "Farid", "Tara", "Eli", "Meera", "Jonas", "Ayla", "Rafael", "Sanaa", "Kenji",
  "Dalia", "Marco", "Isha", "Anton", "Nadia", "Vivek", "Elise", "Tariq", "Willa", "Arun",
  "Greta", "Bilal", "Kiara", "Pavel", "Safia", "Neel", "Carmen", "Yash", "Helen", "Imran",
  "Ruth", "Kavi", "Nina", "Omarah", "Seth", "Anjali", "Bruno", "Leena", "Chris", "Pooja",
] as const

const CITIES = [
  "Seattle",
  "Chandigarh",
  "London",
  "Austin",
  "Toronto",
  "Delhi",
  "Vancouver",
  "Portland",
] as const

const GATHERING_SIZES = ["2-5", "6-15", "16-40", "40+"] as const

const FILLER_KNOWS: Record<TopicKey, readonly string[]> = {
  languages: ["French", "Mandarin", "Arabic", "Portuguese"],
  locations: ["London", "Austin", "Toronto", "Delhi"],
  hobbies: ["Hiking", "Photography", "Chess", "Yoga"],
  interests: ["Film", "History", "Poetry", "Design"],
  festivals: ["Christmas", "Lunar New Year", "Eid", "Carnival"],
}

const FILLER_WANTS: Record<TopicKey, readonly string[]> = {
  languages: ["Japanese", "Korean", "Italian", "German"],
  locations: ["Vancouver", "Portland", "Montreal", "Jaipur"],
  hobbies: ["Tabla", "Gardening", "Baking", "Cycling"],
  interests: ["Travel", "Food", "Architecture", "Theatre"],
  festivals: ["Thanksgiving", "Vaisakhi", "Eid", "Carnival"],
}

function emptyTopics(): Record<TopicKey, { knows: string[]; wants_to_learn: string[] }> {
  return {
    languages: { knows: [], wants_to_learn: [] },
    locations: { knows: [], wants_to_learn: [] },
    hobbies: { knows: [], wants_to_learn: [] },
    interests: { knows: [], wants_to_learn: [] },
    festivals: { knows: [], wants_to_learn: [] },
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function profileId(index: number): string {
  const next = mulberry32(0x71c4e7 + (index + 1) * 0x9e3779b1)
  const bytes = Array.from({ length: 16 }, () => Math.floor(next() * 256))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function at<T>(items: readonly T[], index: number): T {
  return items[index % items.length] as T
}

function knows(topic: TopicKey, index: number, extra?: string): string[] {
  const items = [at(FILLER_KNOWS[topic], index)]
  if (extra) items.unshift(extra)
  return items
}

function basePerson(index: number): SamplePerson {
  const name = FIRST_NAMES[index] ?? `Person ${index}`
  const close = index < 8
  return {
    id: profileId(index),
    username: `${name.toLowerCase()}${index}`,
    first_name: name,
    location: close ? "Seattle" : at(CITIES, index + 3),
    age: close ? 26 + (index % 5) : 18 + ((index * 3) % 48),
    gathering_size: close ? "6-15" : at(GATHERING_SIZES, index),
    ...emptyTopics(),
  }
}

function buildPerson(index: number): SamplePerson {
  const person = basePerson(index)

  if (index < 25) {
    const extra = index % 4
    person.hobbies = { knows: knows("hobbies", index, "Dance"), wants_to_learn: [at(FILLER_WANTS.hobbies, index)] }
    person.languages = {
      knows: knows("languages", index, extra === 1 ? "Spanish" : undefined),
      wants_to_learn: ["Japanese"],
    }
    person.locations = {
      knows: knows("locations", index, extra === 3 ? "Chandigarh" : undefined),
      wants_to_learn: ["Montreal"],
    }
    person.interests = {
      knows: knows("interests", index, extra === 0 ? "Folk dance" : undefined),
      wants_to_learn: ["Travel"],
    }
    person.festivals = {
      knows: knows("festivals", index, extra === 0 ? "Holi" : undefined),
      wants_to_learn: ["Thanksgiving"],
    }
    if (index % 3 === 0) person.hobbies.wants_to_learn = ["Cooking"]
    if (index < 8) {
      person.languages.knows = ["Spanish", "French"]
      person.locations.knows = ["Chandigarh", "London"]
      person.hobbies.knows = ["Dance", "Hiking"]
      person.interests.knows = ["Folk dance", "Film"]
      person.festivals.knows = ["Holi", "Christmas"]
    }
    return person
  }

  if (index < 45) {
    const want = at(
      [
        ["languages", "Spanish"],
        ["locations", "Chandigarh"],
        ["interests", "Folk dance"],
        ["festivals", "Holi"],
      ] as const,
      index,
    )
    person[want[0]] = {
      knows: knows(want[0], index, want[1]),
      wants_to_learn: [at(FILLER_WANTS[want[0]], index)],
    }
    for (const topic of TOPIC_KEYS) {
      if (topic === want[0]) continue
      person[topic] = {
        knows: knows(topic, index),
        wants_to_learn: [at(FILLER_WANTS[topic], index)],
      }
    }
    return person
  }

  if (index < 70) {
    const shared = at(
      [
        ["languages", "English"],
        ["hobbies", "Cooking"],
        ["interests", "Classical music"],
        ["festivals", "Diwali"],
      ] as const,
      index,
    )
    for (const topic of TOPIC_KEYS) {
      person[topic] = {
        knows: knows(topic, index),
        wants_to_learn: [topic === shared[0] ? shared[1] : at(FILLER_WANTS[topic], index)],
      }
    }
    return person
  }

  for (const topic of TOPIC_KEYS) {
    person[topic] = {
      knows: knows(topic, index),
      wants_to_learn: [at(FILLER_WANTS[topic], index + 1)],
    }
  }
  return person
}

function overlap(wanted: readonly string[], known: readonly string[]): string[] {
  const knownByKey = new Map(known.map((item) => [item.toLocaleLowerCase(), item]))
  const hits: string[] = []
  const seen = new Set<string>()
  for (const item of wanted) {
    const key = item.toLocaleLowerCase()
    if (seen.has(key)) continue
    const match = knownByKey.get(key)
    if (!match) continue
    seen.add(key)
    hits.push(match)
  }
  return hits
}

export function compatibilityWith(
  viewer: OnboardingInput,
  candidate: OnboardingInput,
): { score: number; matched_on: string[] } {
  const matchedOn: string[] = []
  let teachHits = 0
  let learnHits = 0
  const preferenceTopics = ["hobbies", "locations", "interests", "festivals"] as const

  function uniqueItems(items: readonly string[]): string[] {
    const seen = new Set<string>()
    const unique: string[] = []
    for (const item of items) {
      const key = item.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(item)
    }
    return unique
  }

  function pooled(profile: OnboardingInput, topics: readonly TopicKey[]) {
    const knows: string[] = []
    const wants: string[] = []
    for (const topic of topics) {
      knows.push(...profile[topic].knows)
      wants.push(...profile[topic].wants_to_learn)
    }
    return { knows: uniqueItems(knows), wants: uniqueItems(wants) }
  }

  for (const topics of [["languages"], preferenceTopics] as const) {
    const viewerSide = pooled(viewer, topics)
    const candidateSide = pooled(candidate, topics)
    for (const item of overlap(viewerSide.wants, candidateSide.knows)) {
      teachHits += 1
      matchedOn.push(`Knows ${item}`)
    }
    for (const item of overlap(viewerSide.knows, candidateSide.wants)) {
      learnHits += 1
      matchedOn.push(`Wants ${item}`)
    }
  }

  let score = 0
  if (teachHits > 0) score += 40 + Math.min(teachHits - 1, 3) * 10
  score += Math.min(learnHits, 2) * 6

  const viewerCity = viewer.location.toLocaleLowerCase()
  if (viewerCity && candidate.location.toLocaleLowerCase() === viewerCity) {
    score += 12
    matchedOn.push(`Lives in ${candidate.location}`)
  }
  if (viewer.gathering_size && candidate.gathering_size === viewer.gathering_size) {
    score += 8
    matchedOn.push(`Gathering ${candidate.gathering_size}`)
  }
  const ageDelta = Math.abs(viewer.age - candidate.age)
  if (ageDelta <= 5) {
    score += 10
    matchedOn.push("Similar age")
  } else if (ageDelta <= 12) {
    score += 4
  }

  return { score: Math.min(100, score), matched_on: matchedOn }
}

export const SAMPLE_PEOPLE: SamplePerson[] = Array.from({ length: 100 }, (_, index) => buildPerson(index))

export function sampleProfilesFor(viewer: OnboardingInput): SampleProfile[] {
  return SAMPLE_PEOPLE.map((person) => {
    const match = compatibilityWith(viewer, person)
    return { ...person, compatibility_score: match.score, matched_on: match.matched_on }
  }).sort((a, b) => b.compatibility_score - a.compatibility_score || a.first_name.localeCompare(b.first_name))
}

/** One hundred people, scored against {@link VIEWER_PROFILE}. Highest score first. */
export const SAMPLE_PROFILES: SampleProfile[] = sampleProfilesFor(VIEWER_PROFILE)
