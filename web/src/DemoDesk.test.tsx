import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it } from "vitest"
import { DEMO_EVENTS, DemoDesk, demoReason, personForEvent } from "./DemoDesk"
import { sampleProfilesFor, VIEWER_PROFILE } from "./sampleProfiles"

it("leads with the first Knows line, then the first Wants line", () => {
  expect(demoReason(["Lives in Seattle", "Wants Cooking", "Knows Dance"])).toBe(
    "Knows Dance. You want to learn it.",
  )
  expect(demoReason(["Wants Dance", "Knows Hiking"])).toBe("Knows Hiking. You want to learn it.")
  expect(demoReason(["Gathering 6-15", "Wants Tabla"])).toBe("Wants Tabla. You already know it.")
  expect(demoReason(["Lives in Seattle"])).toBeNull()
})

it("loads the closest sample people after trying the Seattle profile", () => {
  const shown = sampleProfilesFor(VIEWER_PROFILE).slice(0, 4)
  const top = shown[0]
  const rest = shown.slice(1)

  render(<DemoDesk />)

  expect(screen.queryByText("Handles stay hidden until both people accept.")).not.toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: top?.first_name ?? "" })).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Try a Seattle profile" }))

  expect(screen.getByText("Handles stay hidden until both people accept.")).toBeInTheDocument()
  expect(screen.getByText("Your closest match")).toBeInTheDocument()
  expect(screen.queryByText(/40 points/)).not.toBeInTheDocument()
  expect(screen.queryByText(/instagram/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/discord/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/snapchat/i)).not.toBeInTheDocument()

  const closest = screen.getByText("Your closest match").closest("div")
  expect(closest).not.toBeNull()
  expect(within(closest as HTMLElement).getByRole("heading", { name: top?.first_name })).toBeInTheDocument()

  for (const person of shown) {
    expect(screen.getByRole("heading", { name: person.first_name })).toBeInTheDocument()
    const reason = demoReason(person.matched_on)
    if (reason) expect(screen.getAllByText(reason).length).toBeGreaterThan(0)
  }

  const scoreCounts = new Map<number, number>()
  for (const person of shown) scoreCounts.set(person.compatibility_score, (scoreCounts.get(person.compatibility_score) ?? 0) + 1)
  for (const [score, count] of scoreCounts) {
    expect(screen.getAllByLabelText(`Score ${score}`)).toHaveLength(count)
  }
  expect(screen.queryByRole("heading", { name: sampleProfilesFor(VIEWER_PROFILE)[4]?.first_name ?? "" })).not.toBeInTheDocument()
  expect(rest).toHaveLength(3)
})

it("walks a show, a plan link, and a handle that appears only after accept", () => {
  const people = sampleProfilesFor(VIEWER_PROFILE)
  const dance = DEMO_EVENTS[0]
  const guest = personForEvent(dance.title, people)
  const requester = people[1]

  render(<DemoDesk />)
  fireEvent.click(screen.getByRole("button", { name: "Try a Seattle profile" }))

  expect(screen.getByRole("heading", { name: "Events near you" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Dance show" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Live music gathering" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Diwali dance night" })).toBeInTheDocument()
  expect(screen.getByDisplayValue(`${window.location.origin}/?plan=demo-diwali`)).toBeInTheDocument()
  expect(screen.queryByText(/instagram/i)).not.toBeInTheDocument()
  expect(screen.getByRole("heading", { name: `${requester?.first_name} asked to connect` })).toBeInTheDocument()

  const danceItem = screen.getByRole("heading", { name: "Dance show" }).closest("li")
  expect(danceItem).not.toBeNull()
  fireEvent.click(within(danceItem as HTMLElement).getByRole("button", { name: `Ask ${guest?.first_name} to come` }))

  expect(within(danceItem as HTMLElement).getByText("Plan posted")).toBeInTheDocument()
  expect(screen.getByDisplayValue(`${window.location.origin}/?plan=${dance.id}`)).toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", { name: "Accept" }))
  expect(screen.getByText(`Connected. Instagram @${requester?.username}`)).toBeInTheDocument()
})
