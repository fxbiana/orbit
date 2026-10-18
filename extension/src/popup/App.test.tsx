import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { App } from "./App"
import { createTicket, getOnboarding, listTickets } from "./api"
import { localUserId } from "./localUser"
import { readActiveTab } from "../tabs"

vi.mock("../tabs", () => ({
  readActiveTab: vi.fn(),
}))

vi.mock("./localUser", () => ({
  localUserId: vi.fn(),
}))

vi.mock("./api", () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
  getOnboarding: vi.fn(),
  saveOnboarding: vi.fn(),
}))

const tab = { title: "Docs", url: "https://example.com/docs" }

beforeEach(() => {
  vi.mocked(localUserId).mockReset()
  vi.mocked(localUserId).mockResolvedValue("local_user")
  vi.mocked(readActiveTab).mockReset()
  vi.mocked(readActiveTab).mockResolvedValue(tab)
  vi.mocked(listTickets).mockReset()
  vi.mocked(listTickets).mockResolvedValue({ tickets: [] })
  vi.mocked(createTicket).mockReset()
  vi.mocked(getOnboarding).mockReset()
  vi.mocked(getOnboarding).mockResolvedValue(null)
})

it("loads the active tab and an empty ticket list", async () => {
  render(<App />)

  expect(await screen.findByText("Docs")).toBeInTheDocument()
  expect(screen.getByText("https://example.com/docs")).toBeInTheDocument()
  expect(screen.getByText("No tickets yet.")).toBeInTheDocument()
  expect(listTickets).toHaveBeenCalledWith("local_user")
})

it("shows an error when the active tab cannot be read", async () => {
  vi.mocked(readActiveTab).mockRejectedValue(new Error("No active tab"))

  render(<App />)

  expect(await screen.findByText("No active tab")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeDisabled()
})

it("shows an error when the local user cannot be loaded", async () => {
  vi.mocked(localUserId).mockRejectedValue(new Error("Storage failed"))

  render(<App />)

  expect(await screen.findByText("Storage failed")).toBeInTheDocument()
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

  render(<App />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByRole("link", { name: "Docs" })).toHaveAttribute(
    "href",
    "https://example.com/docs",
  )
  expect(createTicket).toHaveBeenCalledWith("local_user", tab)
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

  render(<App />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Firestore request failed")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save ticket" })).toBeEnabled()
})

it("uses a generic message when a save fails with a non-error", async () => {
  vi.mocked(createTicket).mockRejectedValue("nope")

  render(<App />)
  expect(await screen.findByText("Docs")).toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Save ticket" }))

  expect(await screen.findByText("Save failed")).toBeInTheDocument()
})
