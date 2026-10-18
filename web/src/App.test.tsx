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

it("shows sign-in, sign-up, and the later extension sample", () => {
  render(<App />)

  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Where Worlds Connect" })).toBeInTheDocument()
  expect(screen.getByRole("heading", { name: "Save the page you already have open." })).toBeInTheDocument()
  expect(screen.getByLabelText("Sample of the future extension popup")).toBeInTheDocument()
})

it("keeps the signed-in desk free of the later extension sample", () => {
  clerk.signedIn = true
  render(<App />)

  expect(screen.queryByRole("heading", { name: "The extension saves the tab you already have open." })).not.toBeInTheDocument()
  expect(screen.getByText("Loading your session...")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Contact ways" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Manage account" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
})
