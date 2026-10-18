import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { OnboardingForm } from "./OnboardingForm"
import { getOnboarding, listMatches } from "./api"
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
  getContact: vi.fn(async () => ({
    instagram: "",
    discord: "",
    snapchat: "",
    preferred: "",
    reach_note: "",
    updated_at: null,
  })),
  saveContact: vi.fn(),
  listConnections: vi.fn(async () => ({ connections: [] })),
  createConnection: vi.fn(),
  acceptConnection: vi.fn(),
  rejectConnection: vi.fn(),
  listMessages: vi.fn(async () => ({ messages: [] })),
  sendMessage: vi.fn(),
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
  vi.mocked(listMatches).mockReset()
  vi.mocked(listMatches).mockResolvedValue({ matches: [] })
})

it("opens the saved profile and lists people from the match API", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(saved)
  vi.mocked(listMatches).mockResolvedValue({
    matches: [
      {
        user_id: "user_ada",
        username: "ada",
        first_name: "Ada",
        location: "Seattle",
        age: 29,
        gathering_size: "6-15",
        compatibility_score: 72,
        matched_on: ["Knows Dance"],
      },
    ],
  })
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Priya, people near you" })).toBeInTheDocument()
  expect(screen.queryByText("Showing sample people")).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Edit answers" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Ask to connect" })).toBeInTheDocument()
  expect(await screen.findByRole("heading", { name: "How you want to be reached" })).toBeInTheDocument()
})

it("leaves the match list empty when the API has no other profiles", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(saved)
  vi.mocked(listMatches).mockResolvedValue({ matches: [] })
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByText(/No one else has a profile yet/)).toBeInTheDocument()
  expect(screen.queryByText("Showing sample people")).not.toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Amira" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Ask to connect" })).not.toBeInTheDocument()
})

it("starts a blank form when this account has no profile", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "Who you are" })).toBeInTheDocument()
  expect(screen.getByLabelText("User name")).toHaveValue("")
  expect(screen.getByLabelText("First name")).toHaveValue("")
  expect(screen.getByLabelText("Age")).toHaveValue(null)
})
