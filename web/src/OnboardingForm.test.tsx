import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { OnboardingForm } from "./OnboardingForm"
import { getOnboarding } from "./api"
import type { OnboardingProfile } from "./onboarding"

vi.mock("./api", () => ({
  sessionToken: async (getToken: () => Promise<string | null>) => {
    const token = await getToken()
    if (!token) throw new Error("No session token")
    return token
  },
  getOnboarding: vi.fn(),
  saveOnboarding: vi.fn(),
  listMatches: vi.fn(async () => ({ matches: [] })),
  listPlans: vi.fn(async () => ({ plans: [] })),
  createPlan: vi.fn(),
  joinPlan: vi.fn(),
  ACTIVITY_TYPES: ["coffee", "study", "workshop", "other"],
}))

const saved: OnboardingProfile = {
  user_id: "user_saved",
  username: "priya",
  first_name: "Priya",
  location: "Seattle",
  age: 27,
  gathering_size: "6-15",
  languages: { knows: ["English"], wants_to_learn: [] },
  locations: { knows: ["Seattle"], wants_to_learn: [] },
  hobbies: { knows: ["Cooking"], wants_to_learn: ["Dance"] },
  interests: { knows: [], wants_to_learn: [] },
  festivals: { knows: ["Diwali"], wants_to_learn: [] },
  created_at: "2026-10-18T00:00:00Z",
  updated_at: "2026-10-18T00:00:00Z",
}

beforeEach(() => {
  vi.mocked(getOnboarding).mockReset()
})

it("opens the saved profile instead of the sample form", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(saved)
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("button", { name: "Edit answers" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Who you are" })).not.toBeInTheDocument()
})

it("starts the form when this account has no profile", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "Who you are" })).toBeInTheDocument()
})
