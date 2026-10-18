import { afterEach, expect, it, vi } from "vitest"
import { mountInviteBanner } from "./instagram"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.getElementById("orbit-invite-banner-host")?.remove()
})

it("shows the invite copy and opens the Orbit site", () => {
  vi.stubEnv("VITE_WEB_APP_URL", "http://localhost:5174")
  const open = vi.spyOn(window, "open").mockImplementation(() => null)
  const host = mountInviteBanner({
    id: "inv-1",
    from_first_name: " ",
    plan_title: "Friday market",
  })

  expect(host.shadowRoot?.textContent).toContain("Someone invited you to Friday market on Orbit.")
  const openButton = host.shadowRoot?.querySelector("button.open")
  if (!(openButton instanceof HTMLButtonElement)) throw new Error("missing open button")
  openButton.click()
  expect(open).toHaveBeenCalledWith("http://localhost:5174", "_blank", "noopener,noreferrer")
  open.mockRestore()
})

it("dismisses the invite through the extension and hides the banner", async () => {
  const sendMessage = vi.fn().mockResolvedValue({ invite: null })
  vi.stubGlobal("chrome", { runtime: { sendMessage } })
  const host = mountInviteBanner({
    id: "inv-9",
    from_first_name: "Mina",
    plan_title: "Night market",
  })
  const dismiss = host.shadowRoot?.querySelector("button.dismiss")
  if (!(dismiss instanceof HTMLButtonElement)) throw new Error("missing dismiss button")
  dismiss.click()

  await vi.waitFor(() => {
    expect(document.getElementById("orbit-invite-banner-host")).toBeNull()
  })
  expect(sendMessage).toHaveBeenCalledWith({ type: "orbit-invite-dismiss", id: "inv-9" })
  expect(sendMessage).toHaveBeenCalledWith({ type: "orbit-invite-banner" })
})
