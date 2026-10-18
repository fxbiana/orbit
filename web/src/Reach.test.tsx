import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { Reach } from "./Reach"
import { getContact, listConnections, listMessages, type Contact } from "./api"

vi.mock("./api", () => ({
  sessionToken: async (getToken: () => Promise<string | null>) => {
    const token = await getToken()
    if (!token) throw new Error("No session token")
    return token
  },
  getContact: vi.fn(),
  saveContact: vi.fn(),
  listConnections: vi.fn(),
  acceptConnection: vi.fn(),
  rejectConnection: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}))

const emptyContact: Contact = {
  instagram: "",
  discord: "",
  snapchat: "",
  facebook: "",
  preferred: "",
  reach_note: "",
  updated_at: null,
}

it("shows social links only after a connection is accepted", async () => {
  vi.mocked(getContact).mockResolvedValue(emptyContact)
  vi.mocked(listMessages).mockResolvedValue({
    messages: [
      {
        id: "m1",
        author_id: "user_luis",
        text: "Thursday at the library?",
        created_at: "2026-10-18T00:00:00Z",
        mine: false,
      },
    ],
  })
  vi.mocked(listConnections).mockImplementation(async (_token, box) => {
    if (box === "friends") {
      return {
        connections: [
          {
            id: "c-friend",
            from_user_id: "user_me",
            to_user_id: "user_luis",
            status: "accepted",
            intro: "Want to learn tabla?",
            other: { user_id: "user_luis", first_name: "Luis", username: "luis" },
            contact: {
              instagram: "luis.plays",
              discord: "",
              snapchat: "",
              facebook: "",
              preferred: "instagram",
              reach_note: "I answer Instagram at night.",
            },
            created_at: null,
            updated_at: null,
            responded_at: null,
          },
        ],
      }
    }
    if (box === "inbox") {
      return {
        connections: [
          {
            id: "c-wait",
            from_user_id: "user_nora",
            to_user_id: "user_me",
            status: "pending",
            intro: "Want to learn tabla?",
            other: { user_id: "user_nora", first_name: "Nora", username: "nora" },
            contact: null,
            created_at: null,
            updated_at: null,
            responded_at: null,
          },
        ],
      }
    }
    return { connections: [] }
  })

  render(<Reach getToken={async () => "session-token"} />)

  expect(await screen.findByRole("link", { name: "Instagram · luis.plays" })).toHaveAttribute(
    "href",
    "https://instagram.com/luis.plays",
  )
  expect(screen.getByText("Luis prefers Instagram.")).toBeInTheDocument()
  expect(screen.getByText("I answer Instagram at night.")).toBeInTheDocument()
  expect(await screen.findByText("Thursday at the library?")).toBeInTheDocument()
  expect(screen.getByText("Want to learn tabla?")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument()
  expect(screen.getAllByRole("link")).toHaveLength(1)
})
