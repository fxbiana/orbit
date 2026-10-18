import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { OnboardingForm } from "./OnboardingForm"
import { getContact, getOnboarding, listMatches, saveContact, saveOnboarding, type Contact } from "./api"
import type { OnboardingProfile } from "./onboarding"

function contact(partial: Partial<Contact> & { facebook?: string } = {}): Contact {
  return {
    instagram: "",
    discord: "",
    snapchat: "",
    facebook: "",
    preferred: "",
    reach_note: "",
    updated_at: null,
    ...partial,
  } as Contact
}

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isLoaded: true, user: null }),
}))

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
  listNearbyEvents: vi.fn(async () => ({ city: "Seattle", preferences: ["Jazz"], events: [] })),
  createPlan: vi.fn(),
  joinPlan: vi.fn(),
  getContact: vi.fn(async () => ({
    instagram: "",
    discord: "",
    snapchat: "",
    facebook: "",
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
  vi.unstubAllGlobals()
  vi.mocked(getOnboarding).mockReset()
  vi.mocked(getContact).mockReset()
  vi.mocked(saveContact).mockReset()
  vi.mocked(saveOnboarding).mockReset()
  vi.mocked(getContact).mockResolvedValue(contact())
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
  expect(screen.queryByRole("heading", { name: "Contact ways" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Ask to connect" })).toBeInTheDocument()
})

it("asks about you first, then reach, then preferences", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(saved)
  vi.mocked(getContact).mockResolvedValue(
    contact({
      instagram: "priya.learns",
      preferred: "instagram",
      reach_note: "Evenings",
    }),
  )
  render(<OnboardingForm getToken={async () => "session-token"} profileOpen />)

  expect(await screen.findByRole("dialog", { name: "Contact ways" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Edit profile" }))
  expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument()
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()
  expect(screen.getByText(/does not pull your name or city/)).toBeInTheDocument()
  expect(screen.getByLabelText("City")).toHaveValue("Seattle")
  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  expect(screen.getByRole("heading", { name: "How you want to be reached" })).toBeInTheDocument()
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument()
  expect(screen.getByText(/Usernames are optional/)).toBeInTheDocument()
  expect(screen.getByText(/Spotify and Meta suggestions come next/)).toBeInTheDocument()

  const instagram = screen.getByRole("textbox", { name: "Instagram" })
  expect(instagram).toHaveValue("priya.learns")
  fireEvent.change(instagram, { target: { value: "priya.new" } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  expect(screen.getByRole("heading", { name: "Your preferences" })).toBeInTheDocument()
  expect(screen.getByText("Step 3 of 3")).toBeInTheDocument()
  expect(screen.getByLabelText("Languages you speak")).toHaveValue("English")
  expect(screen.getByLabelText("Preferences you already have")).toHaveValue("Cooking, Seattle, Diwali")
  expect(screen.getByLabelText("Preferences you want")).toHaveValue("Dance")
  expect(screen.queryByLabelText("City")).not.toBeInTheDocument()
  expect(screen.queryByLabelText("Hobbies you do")).not.toBeInTheDocument()
  expect(screen.queryByText(/hobbies, places, interests, and festivals/i)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Find your people" }))

  expect(await screen.findByRole("heading", { name: "Priya, people near you" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Contact ways" })).not.toBeInTheDocument()
  expect(saveContact).toHaveBeenCalledWith("session-token", {
    instagram: "priya.new",
    discord: "",
    snapchat: "",
    facebook: "",
    preferred: "instagram",
    reach_note: "Evenings",
  })
  expect(saveOnboarding).toHaveBeenCalledWith(
    "session-token",
    expect.objectContaining({
      location: "Seattle",
      languages: { knows: ["English"], wants_to_learn: [] },
      interests: { knows: ["Cooking", "Seattle", "Diwali"], wants_to_learn: ["Dance"] },
      hobbies: { knows: [], wants_to_learn: [] },
      locations: { knows: [], wants_to_learn: [] },
      festivals: { knows: [], wants_to_learn: [] },
    }),
  )
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

function fillAbout() {
  fireEvent.change(screen.getByLabelText("User name"), { target: { value: "priya" } })
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Priya" } })
  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "27" } })
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Portland" } })
  fireEvent.click(screen.getByRole("radio", { name: "6-15 people" }))
}

it("starts a blank form when this account has no profile", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument()
  expect(screen.getByText(/does not pull your name or city/)).toBeInTheDocument()
  expect(screen.getByLabelText("User name")).toHaveValue("")
  expect(screen.getByLabelText("First name")).toHaveValue("")
  expect(screen.getByLabelText("Age")).toHaveValue(null)
  expect(screen.getByLabelText("City")).toHaveValue("")
  fireEvent.change(screen.getByLabelText("User name"), { target: { value: "priya" } })
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Priya" } })
  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "27" } })
  fireEvent.click(screen.getByRole("radio", { name: "6-15 people" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument()
  expect(screen.getByText("Choose a city.")).toBeInTheDocument()

  fireEvent.change(screen.getByLabelText("City"), { target: { value: "Portland" } })
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  expect(screen.getByRole("heading", { name: "How you want to be reached" })).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  expect(screen.getByRole("heading", { name: "Your preferences" })).toBeInTheDocument()
})

it("merges Spotify suggestions into grouped preferences and leaves about fields alone", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        genres: ["jazz", "indie"],
        suggestions: { knows: ["Jazz", "cooking"], wants_to_learn: ["Tabla"] },
        location: "Seattle",
        username: "hacked",
        first_name: "Nope",
        age: 40,
      }),
    })),
  )
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  fillAbout()
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.change(screen.getByLabelText("Preferences you already have"), {
    target: { value: "Cooking, Diwali" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Suggest from Spotify" }))

  expect(await screen.findByText("Spotify suggested: jazz, indie")).toBeInTheDocument()
  expect(screen.getByLabelText("Preferences you already have")).toHaveValue("Cooking, Diwali, Jazz")
  expect(screen.getByLabelText("Preferences you want")).toHaveValue("Tabla")
  expect(screen.getByRole("button", { name: "Suggest from Spotify" })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith(
    "http://localhost:5000/api/spotify/import",
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer session-token" }),
    }),
  )

  fireEvent.click(screen.getByRole("button", { name: "Back" }))
  fireEvent.click(screen.getByRole("button", { name: "Back" }))
  expect(screen.getByLabelText("User name")).toHaveValue("priya")
  expect(screen.getByLabelText("First name")).toHaveValue("Priya")
  expect(screen.getByLabelText("City")).toHaveValue("Portland")
  expect(screen.getByLabelText("Age")).toHaveValue(27)
})

it("keeps a comma inside a Spotify artist name", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        genres: ["Tyler, The Creator", "Steve Lacy"],
        suggestions: { knows: ["Tyler, The Creator", "Steve Lacy"], wants_to_learn: [] },
      }),
    })),
  )
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  fillAbout()
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "Basketball" }))
  fireEvent.click(screen.getByRole("button", { name: "Suggest from Spotify" }))

  expect(await screen.findByText("Spotify suggested: Tyler, The Creator, Steve Lacy")).toBeInTheDocument()
  expect(screen.getByLabelText("Preferences you already have")).toHaveValue(
    "Basketball, Tyler, The Creator, Steve Lacy",
  )
})

it("keeps typed preferences when Spotify import fails", async () => {
  vi.mocked(getOnboarding).mockResolvedValue(null)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Connect Spotify first" }),
    })),
  )
  render(<OnboardingForm getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  fillAbout()
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.change(screen.getByLabelText("Preferences you already have"), {
    target: { value: "Cooking" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Suggest from Spotify" }))

  expect(await screen.findByText("Connect Spotify first")).toBeInTheDocument()
  expect(screen.getByLabelText("Preferences you already have")).toHaveValue("Cooking")
  expect(screen.getByLabelText("Preferences you already have")).toBeEnabled()
})
