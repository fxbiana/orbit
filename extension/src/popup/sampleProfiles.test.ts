import { expect, it } from "vitest"
import { validateOnboarding } from "./onboarding"
import { SAMPLE_PROFILES, VIEWER_PROFILE, compatibilityWith } from "./sampleProfiles"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

it("builds 100 people with their own ids and scores", () => {
  expect(SAMPLE_PROFILES).toHaveLength(100)

  const ids = new Set(SAMPLE_PROFILES.map((profile) => profile.id))
  expect(ids.size).toBe(100)
  for (const profile of SAMPLE_PROFILES) {
    expect(profile.id).toMatch(UUID)
    expect(profile.compatibility_score).toBeGreaterThanOrEqual(0)
    expect(profile.compatibility_score).toBeLessThanOrEqual(100)
    expect(Number.isInteger(profile.compatibility_score)).toBe(true)
    expect(validateOnboarding(profile)).toBeNull()
  }

  const usernames = new Set(SAMPLE_PROFILES.map((profile) => profile.username))
  expect(usernames.size).toBe(100)
})

it("ranks people who know dance above people with nothing in common", () => {
  const scores = SAMPLE_PROFILES.map((profile) => profile.compatibility_score)
  const sorted = [...scores].sort((a, b) => b - a)
  expect(scores).toEqual(sorted)

  const dance = SAMPLE_PROFILES.filter((profile) => profile.matched_on.includes("Knows Dance"))
  const unrelated = SAMPLE_PROFILES.filter(
    (profile) => !profile.matched_on.some((reason) => reason.startsWith("Knows ") || reason.startsWith("Wants ")),
  )

  expect(dance.length).toBeGreaterThan(10)
  expect(unrelated.length).toBeGreaterThan(10)
  expect(Math.min(...dance.map((profile) => profile.compatibility_score))).toBeGreaterThan(
    Math.max(...unrelated.map((profile) => profile.compatibility_score)),
  )
  expect(SAMPLE_PROFILES[0]?.compatibility_score).toBe(100)
  expect(SAMPLE_PROFILES[0]?.matched_on).toContain("Knows Dance")
})

it("scores a dance teacher against someone who wants to learn dance", () => {
  const match = compatibilityWith(VIEWER_PROFILE, {
    ...VIEWER_PROFILE,
    username: "teacher",
    first_name: "Teacher",
    location: "London",
    age: 50,
    gathering_size: "40+",
    hobbies: { knows: ["Dance"], wants_to_learn: [] },
    languages: { knows: [], wants_to_learn: [] },
    locations: { knows: [], wants_to_learn: [] },
    interests: { knows: [], wants_to_learn: [] },
    festivals: { knows: [], wants_to_learn: [] },
  })

  expect(match.score).toBe(40)
  expect(match.matched_on).toEqual(["Knows Dance"])
})
