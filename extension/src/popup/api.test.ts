import { afterEach, describe, expect, it, vi } from "vitest"
import { createTicket, listTickets } from "./api"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe("api", () => {
  it("calls the local API when no base url is set", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "")
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tickets: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await listTickets("session-token")

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/tickets", {
      headers: {
        Authorization: "Bearer session-token",
        "Content-Type": "application/json",
      },
    })
  })

  it("strips a trailing slash from the base url", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/")
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tickets: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await listTickets("session-token")

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/tickets",
      expect.any(Object),
    )
  })

  it("posts a ticket as json", async () => {
    const created = {
      id: "t1",
      title: "Docs",
      url: "https://example.com/docs",
      status: "open",
      created_at: "2026-05-01T00:00:00+00:00",
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(created, 201))
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      createTicket("session-token", {
        title: "Docs",
        url: "https://example.com/docs",
      }),
    ).resolves.toEqual(created)

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title: "Docs", url: "https://example.com/docs" }),
      headers: {
        Authorization: "Bearer session-token",
        "Content-Type": "application/json",
      },
    })
  })

  it("throws the response body when the API rejects the call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "title and url are required",
      }),
    )

    await expect(listTickets("session-token")).rejects.toThrow("title and url are required")
  })

  it("throws the status code when the error body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "",
      }),
    )

    await expect(listTickets("session-token")).rejects.toThrow("503")
  })
})
