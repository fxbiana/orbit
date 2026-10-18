import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { App, TicketPanel } from "./App"
import { createTicket, getOnboarding, listTickets } from "./api"
import { OnboardingForm } from "./OnboardingForm"
import { readActiveTab } from "../tabs"

const clerk = vi.hoisted(() => ({
  signedIn: true,
  token: "session-token" as string | null,
}))

vi.mock("@clerk/chrome-extension", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  Show: ({ when, children }: { when: string; children: ReactNode }) => {
    const visible = when === "signed-in" ? clerk.signedIn : !clerk.signedIn
    return visible ? children : null
  },
  SignInButton: () => <button type="button">Sign in</button>,
  SignUpButton: () => <button type="button">Sign up</button>,
  UserButton: () => <button type="button">Account</button>,
  useAuth: () => ({
    getToken: async () => clerk.token,
  }),
}))

vi.mock("../tabs", () => ({
  readActiveTab: vi.fn(),
}))

vi.mock("./api", () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
  getOnboarding: vi.fn(),
  saveOnboarding: vi.fn(),
  sessionToken: async (getToken: () => Promise<string | null>) => {
    const token = await getToken()
    if (!token) throw new Error("No session token")
    return token
  },
}))

const tab = { title: "Docs", url: "https://example.com/docs" }

beforeEach(() => {
  clerk.signedIn = true
  clerk.token = "session-token"
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example")
  vi.mocked(readActiveTab).mockReset()
  vi.mocked(readActiveTab).mockResolvedValue(tab)
  vi.mocked(listTickets).mockReset()
  vi.mocked(listTickets).mockResolvedValue({ tickets: [] })
  vi.mocked(createTicket).mockReset()
  vi.mocked(getOnboarding).mockReset()
  vi.mocked(getOnboarding).mockResolvedValue(null)
})

it("starts on a prefilled about-you page", async () => {
  render(<OnboardingForm getToken={async () => "token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  expect(screen.getByLabelText("User name")).toHaveValue("you")
  expect(screen.getByLabelText("First name")).toHaveValue("You")
  expect(screen.getByLabelText("Age")).toHaveValue(28)
  expect(screen.queryByRole("button", { name: "Save ticket" })).not.toBeInTheDocument()
})

it("opens one section per page, then ranks people who know dance", async () => {
  render(<OnboardingForm getToken={async () => "token"} />)
  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()

  for (let i = 0; i < 5; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
  }

  expect(screen.getByRole("heading", { name: "Hobbies" })).toBeInTheDocument()
  expect(screen.getByLabelText("Hobbies you want to try")).toHaveValue("Dance")

  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  fireEvent.click(screen.getByRole("button", { name: "See people" }))

  expect(await screen.findByRole("heading", { name: "Amira" })).toBeInTheDocument()
  expect(screen.getAllByText("Knows Dance. You want to learn it.").length).toBeGreaterThan(0)
  expect(screen.getAllByText("100").length).toBeGreaterThan(0)
  const names = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)
  expect(names[0]).toBe("Amira")
})

it("loads the active tab and an empty ticket list", async () => {
  render(<TicketPanel getToken={async () => "session-token"} />)

  expect(await screen.findByText("Docs")).toBeInTheDocument()
  expect(screen.getByText("https://example.com/docs")).toBeInTheDocument()
  expect(screen.getByText("No tickets yet.")).toBeInTheDocument()
  expect(listTickets).toHaveBeenCalledWith("session-token")
})

it("shows an error when the active tab cannot be read", async () => {
  vi.mocked(readActiveTab).mockRejectedValue(new Error("No active tab"))

  render(<TicketPanel getToken={async () => "session-token"} />)

  expect(await screen.findByText("No active tab")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeDisabled()
})

it("shows sign-in and sign-up when signed out", async () => {
  clerk.signedIn = false

  render(<App />)

  expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "About you" })).not.toBeInTheDocument()
  expect(readActiveTab).not.toHaveBeenCalled()
})

it("shows an error when the session has no token", async () => {
  clerk.token = null

  render(<App />)

  expect(await screen.findByText("No session token")).toBeInTheDocument()
  expect(readActiveTab).not.toHaveBeenCalled()
})

it("saves the tab and refreshes the list", async () => {
  const saved = {
    id: "t1",
    title: "Docs",
    url: "https://example.com/docs",
    status: "open",
    created_at: "2026-05-01T00:00:00+00:00",
  }
  vi.mocked(listTickets)
    .mockResolvedValueOnce({ tickets: [] })
    .mockResolvedValueOnce({ tickets: [saved] })
  vi.mocked(createTicket).mockResolvedValue(saved)

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByRole("link", { name: "Docs" })).toHaveAttribute(
    "href",
    "https://example.com/docs",
  )
  expect(createTicket).toHaveBeenCalledWith("session-token", tab)
  expect(screen.queryByText("No tickets yet.")).not.toBeInTheDocument()
})

it("disables the button while a save is in flight", async () => {
  let finishSave: (ticket: {
    id: string
    title: string
    url: string
    status: string
    created_at: string
  }) => void = () => {}
  vi.mocked(createTicket).mockReturnValue(
    new Promise((resolve) => {
      finishSave = resolve
    }),
  )

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()

  finishSave({
    id: "t1",
    title: "Docs",
    url: "https://example.com/docs",
    status: "open",
    created_at: "2026-05-01T00:00:00+00:00",
  })
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save ticket" })).toBeEnabled()
  })
})

it("shows the save error and leaves the button ready", async () => {
  vi.mocked(createTicket).mockRejectedValue(new Error("Firestore request failed"))

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Firestore request failed")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeEnabled()
})

it("uses a generic message when a save fails with a non-error", async () => {
  vi.mocked(createTicket).mockRejectedValue("nope")

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Save failed")).toBeInTheDocument()
})
