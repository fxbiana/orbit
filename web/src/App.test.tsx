import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { App } from "./App"

const clerk = vi.hoisted(() => ({ signedIn: false }))

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  Show: ({ when, children }: { when: string; children: ReactNode }) => {
    const visible = when === "signed-in" ? clerk.signedIn : !clerk.signedIn
    return visible ? children : null
  },
  SignInButton: () => <button type="button">Sign in</button>,
  SignUpButton: () => <button type="button">Sign up</button>,
  UserButton: Object.assign(
    ({ children }: { children?: ReactNode }) => (
      <div>
        {children}
        <button type="button">Account</button>
      </div>
    ),
    {
      MenuItems: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Action: ({ label, onClick }: { label: string; onClick?: () => void }) => (
        <button type="button" onClick={onClick}>
          {label === "manageAccount" ? "Manage account" : label === "signOut" ? "Sign out" : label}
        </button>
      ),
    },
  ),
  useAuth: () => ({ getToken: async () => "session-token" }),
}))

beforeEach(() => {
  clerk.signedIn = false
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example")
})

it("shows sign-in, sign-up, and a way to try a Seattle profile", () => {
  render(<App />)

  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Where Worlds Connect" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Try a Seattle profile" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: "Save the page you already have open." })).not.toBeInTheDocument()
  expect(screen.queryByLabelText("Sample of the future extension popup")).not.toBeInTheDocument()
})

it("still offers the Seattle demo when the Clerk key is missing", () => {
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "")
  render(<App />)

  expect(screen.getByRole("heading", { name: "Add the Clerk publishable key to web/.env, then restart the site." })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Where Worlds Connect" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Try a Seattle profile" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument()
})

it("keeps the signed-in desk free of the later extension sample", () => {
  clerk.signedIn = true
  render(<App />)

  expect(screen.queryByRole("heading", { name: "The extension saves the tab you already have open." })).not.toBeInTheDocument()
  expect(screen.getByText("Loading your session...")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Contact ways" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Manage account" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: "Try a Seattle profile" })).not.toBeInTheDocument()
})
