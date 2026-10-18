import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { EXTENSION_DEMO_TABS, FutureExtension } from "./FutureExtension"

it("saves the open demo page and points back to the Seattle walkthrough", () => {
  render(<FutureExtension />)

  const [first, second] = EXTENSION_DEMO_TABS
  expect(screen.getAllByText(first.title).length).toBeGreaterThan(0)
  expect(screen.getByText(first.url)).toBeInTheDocument()
  expect(screen.queryByText("Saved to Orbit.")).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Save to Orbit" }))

  expect(screen.getByText(/Saved to Orbit/)).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Find people on Orbit" })).toHaveAttribute(
    "href",
    "#try-seattle",
  )
  expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled()

  fireEvent.click(screen.getByRole("tab", { name: second.title }))

  expect(screen.getByText(second.url)).toBeInTheDocument()
  expect(screen.queryByText(/Saved to Orbit/)).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Save to Orbit" })).toBeEnabled()
})
