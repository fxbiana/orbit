import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { listMatches, type Match } from "./api"
import { Matches } from "./Matches"
import type { OnboardingInput } from "./onboarding"

vi.mock("./api", () => ({
  sessionToken: async (getToken: () => Promise<string | null>) => {
    const token = await getToken()
    if (!token) throw new Error("No session token")
    return token
  },
  listMatches: vi.fn(),
  createConnection: vi.fn(),
}))

const viewer: OnboardingInput = {
  username: "priya",
  first_name: "Priya",
  location: "Seattle",
  age: 27,
  gathering_size: "6-15",
  languages: { knows: [], wants_to_learn: [] },
  locations: { knows: [], wants_to_learn: [] },
  hobbies: { knows: [], wants_to_learn: [] },
  interests: { knows: [], wants_to_learn: [] },
  festivals: { knows: [], wants_to_learn: [] },
}

function person(name: string, score: number): Match {
  return {
    user_id: name,
    username: name.toLowerCase(),
    first_name: name,
    location: "Seattle",
    age: 20,
    gathering_size: "6-15",
    compatibility_score: score,
    matched_on: ["Knows Dance"],
  }
}

it("shows the four closest people and pages through the rest", async () => {
  vi.mocked(listMatches).mockResolvedValue({
    matches: ["Ada", "Bo", "Cy", "Dee", "Eve", "Fay"].map((name, index) => person(name, 90 - index)),
  })

  render(<Matches viewer={viewer} getToken={async () => "session-token"} />)

  expect(await screen.findByRole("heading", { name: "Ada" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Bo" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Cy" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Dee" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Eve" })).not.toBeInTheDocument()
  expect(screen.getByText("Page 1 of 2")).toBeInTheDocument()
  expect(listMatches).toHaveBeenCalledWith("session-token", 50)

  fireEvent.click(screen.getByRole("button", { name: "Next" }))

  expect(screen.getByRole("heading", { name: "Eve" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Fay" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Ada" })).not.toBeInTheDocument()
  expect(screen.getByText("Page 2 of 2")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled()

  fireEvent.click(screen.getByRole("button", { name: "Previous" }))

  expect(screen.getByRole("heading", { name: "Ada" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Eve" })).not.toBeInTheDocument()
  expect(screen.getByText(/highest score first/)).toBeInTheDocument()
  expect(screen.getByText(/Showing 1-4 of 6/)).toBeInTheDocument()
  expect(screen.queryByText(/40 points/)).not.toBeInTheDocument()
  expect(screen.queryByText(/up to 100/)).not.toBeInTheDocument()
})

it("leads with the first Knows overlap, not a later dance match", async () => {
  vi.mocked(listMatches).mockResolvedValue({
    matches: [
      {
        ...person("Anika", 80),
        matched_on: ["Knows Hindi", "Knows Dance"],
      },
    ],
  })

  render(<Matches viewer={viewer} getToken={async () => "session-token"} />)

  expect(await screen.findByText("Knows Hindi. You want to learn it.")).toBeInTheDocument()
  expect(screen.queryByText("Knows Dance. You want to learn it.")).not.toBeInTheDocument()
  expect(screen.queryByText(/40 points/)).not.toBeInTheDocument()
})
