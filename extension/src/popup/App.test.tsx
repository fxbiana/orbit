import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { App } from "./App"
import { createTicket, listTickets } from "./api"
import { readActiveTab } from "../tabs"

vi.mock("@clerk/chrome-extension", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  Show: ({ when, children }: { when: string; children: React.ReactNode }) => {
    const visible =
      (when === "signed-in" && auth.signedIn) || (when === "signed-out" && !auth.signedIn)
    return visible ? children : null
  },
  SignInButton: () => <button type="button">Sign in</button>,
  UserButton: () => <button type="button">Account</button>,
  useAuth: () => ({ getToken: auth.getToken }),
}))

vi.mock("../tabs", () => ({
  readActiveTab: vi.fn(),
}))

vi.mock("./api", () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
}))

const auth = vi.hoisted(() => ({
  signedIn: true,
  getToken: vi.fn(),
}))

const tab = { title: "Docs", url: "https://example.com/docs" }

beforeEach(() => {
  auth.signedIn = true
  auth.getToken.mockReset()
  auth.getToken.mockResolvedValue("session-token")
  vi.mocked(readActiveTab).mockReset()
  vi.mocked(readActiveTab).mockResolvedValue(tab)
  vi.mocked(listTickets).mockReset()
  vi.mocked(listTickets).mockResolvedValue({ tickets: [] })
  vi.mocked(createTicket).mockReset()
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example")
})

it("asks for a publishable key before mounting Clerk", () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "")

  render(<App />)

  expect(screen.getByText(/Set VITE_CLERK_PUBLISHABLE_KEY/)).toBeInTheDocument()
  expect(readActiveTab).not.toHaveBeenCalled()
})

it("shows the sign-in prompt when the session is signed out", () => {
  auth.signedIn = false

  render(<App />)

  expect(screen.getByText("Sign in to save the page you are on.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  expect(readActiveTab).not.toHaveBeenCalled()
})

it("loads the active tab and an empty ticket list", async () => {
  render(<App />)

  expect(await screen.findByText("Docs")).toBeInTheDocument()
  expect(screen.getByText("https://example.com/docs")).toBeInTheDocument()
  expect(screen.getByText("No tickets yet.")).toBeInTheDocument()
  expect(listTickets).toHaveBeenCalledWith("session-token")
})

it("shows an error when the active tab cannot be read", async () => {
  vi.mocked(readActiveTab).mockRejectedValue(new Error("No active tab"))

  render(<App />)

  expect(await screen.findByText("No active tab")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeDisabled()
})

it("shows an error when the session token is missing", async () => {
  auth.getToken.mockResolvedValue(null)

  render(<App />)

  expect(await screen.findByText("No session token")).toBeInTheDocument()
  expect(listTickets).not.toHaveBeenCalled()
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

  render(<App />)
  fireEvent.click(await screen.findByRole("button", { name: "Save ticket" }))

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

  render(<App />)
  fireEvent.click(await screen.findByRole("button", { name: "Save ticket" }))

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

  render(<App />)
  fireEvent.click(await screen.findByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Firestore request failed")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeEnabled()
})

it("uses a generic message when a save fails with a non-error", async () => {
  vi.mocked(createTicket).mockRejectedValue("nope")

  render(<App />)
  fireEvent.click(await screen.findByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Save failed")).toBeInTheDocument()
})

it("does not save when the session token disappears", async () => {
  auth.getToken.mockResolvedValueOnce("session-token").mockResolvedValueOnce(null)

  render(<App />)
  fireEvent.click(await screen.findByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("No session token")).toBeInTheDocument()
  expect(createTicket).not.toHaveBeenCalled()
})
