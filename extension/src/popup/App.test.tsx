import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, expect, it, vi } from "vitest"
import { App, TicketPanel } from "./App"
import { createTicket } from "./api"
import { OnboardingForm } from "./OnboardingForm"
import { readTabForSave } from "../tabs"

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
  readTabForSave: vi.fn(),
}))

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api")
  return {
    ...actual,
    listTickets: vi.fn(),
    createTicket: vi.fn(),
    getOnboarding: vi.fn(),
    saveOnboarding: vi.fn(),
    sessionToken: async (getToken: () => Promise<string | null>) => {
      const token = await getToken()
      if (!token) throw new Error("No session token")
      return token
    },
  }
})

const tab = { title: "Docs", url: "https://example.com/docs" }

beforeEach(() => {
  clerk.signedIn = true
  clerk.token = "session-token"
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example")
  vi.stubEnv("VITE_WEB_APP_URL", "http://localhost:5174")
  vi.mocked(readTabForSave).mockReset()
  vi.mocked(readTabForSave).mockResolvedValue({ ...tab, sample: false })
  vi.mocked(createTicket).mockReset()
})

it("starts on a prefilled about-you page", async () => {
  render(<OnboardingForm getToken={async () => "token"} />)

  expect(await screen.findByRole("heading", { name: "About you" })).toBeInTheDocument()
  expect(screen.getByLabelText("User name")).toHaveValue("you")
  expect(screen.getByLabelText("First name")).toHaveValue("You")
  expect(screen.getByLabelText("Age")).toHaveValue(28)
  expect(screen.queryByRole("button", { name: "Save to Orbit" })).not.toBeInTheDocument()
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

it("loads the active tab title and url", async () => {
  render(<TicketPanel getToken={async () => "session-token"} />)

  expect(await screen.findByText("Docs")).toBeInTheDocument()
  expect(screen.getByText("https://example.com/docs")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save to Orbit" })).toBeEnabled()
  expect(screen.queryByRole("link", { name: "Find people on Orbit" })).not.toBeInTheDocument()
})

it("shows a sample event page when the active tab cannot be read", async () => {
  const sample = {
    title: "Dance show",
    url: "https://www.ticketmaster.com/dance-show-seattle",
  }
  vi.mocked(readTabForSave).mockResolvedValue({ ...sample, sample: true })

  render(<TicketPanel getToken={async () => "session-token"} />)

  expect(await screen.findByText(sample.title)).toBeInTheDocument()
  expect(screen.getByText(sample.url)).toBeInTheDocument()
  expect(screen.getByText(/sample event page/)).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save to Orbit" })).toBeEnabled()
})

it("shows sign-in and sign-up when signed out", async () => {
  clerk.signedIn = false

  render(<App />)

  expect(await screen.findByRole("heading", { name: "Orbit" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument()
  expect(readTabForSave).not.toHaveBeenCalled()
})

it("shows an error when the session has no token", async () => {
  clerk.token = null

  render(<App />)

  expect(await screen.findByText("No session token")).toBeInTheDocument()
  expect(readTabForSave).not.toHaveBeenCalled()
})

it("saves the tab and offers Find people on Orbit", async () => {
  const saved = {
    id: "t1",
    title: "Docs",
    url: "https://example.com/docs",
    status: "open",
    created_at: "2026-05-01T00:00:00+00:00",
  }
  vi.mocked(createTicket).mockResolvedValue(saved)

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save to Orbit" }))

  expect(await screen.findByText("Saved to Orbit.")).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Find people on Orbit" })).toHaveAttribute(
    "href",
    "http://localhost:5174",
  )
  expect(createTicket).toHaveBeenCalledWith("session-token", tab)
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
  fireEvent.click(screen.getByRole("button", { name: "Save to Orbit" }))

  expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled()

  finishSave({
    id: "t1",
    title: "Docs",
    url: "https://example.com/docs",
    status: "open",
    created_at: "2026-05-01T00:00:00+00:00",
  })
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Save to Orbit" })).toBeEnabled()
  })
  expect(screen.getByRole("link", { name: "Find people on Orbit" })).toBeInTheDocument()
})

it("shows the save error and leaves the button ready", async () => {
  vi.mocked(createTicket).mockRejectedValue(new Error("Firestore request failed"))

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save to Orbit" }))

  expect(await screen.findByText("Firestore request failed")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save to Orbit" })).toBeEnabled()
  expect(screen.queryByRole("link", { name: "Find people on Orbit" })).not.toBeInTheDocument()
})

it("uses a generic message when a save fails with a non-error", async () => {
  vi.mocked(createTicket).mockRejectedValue("nope")

  render(<TicketPanel getToken={async () => "session-token"} />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save to Orbit" }))

  expect(await screen.findByText("Save failed")).toBeInTheDocument()
})

it("falls back to copy URL when Clerk is not configured", async () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "")
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })

  render(<App />)

  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Copy URL" }))
  expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument()
  expect(writeText).toHaveBeenCalledWith("https://example.com/docs")
  expect(screen.getByRole("link", { name: "Open Orbit" })).toHaveAttribute(
    "href",
    "http://localhost:5174",
  )
})
