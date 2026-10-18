import { afterEach, describe, expect, it, vi } from "vitest"
import { createTicket, listInboxInvites, listTickets } from "./api"

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

    await listTickets("local_user")

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/tickets", {
      headers: {
        Authorization: "Bearer local_user",
        "Content-Type": "application/json",
      },
    })
  })

  it("strips a trailing slash from the base url", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/")
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ tickets: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await listTickets("local_user")

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
      createTicket("local_user", {
        title: "Docs",
        url: "https://example.com/docs",
      }),
    ).resolves.toEqual(created)

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/tickets", {
      method: "POST",
      body: JSON.stringify({ title: "Docs", url: "https://example.com/docs" }),
      headers: {
        Authorization: "Bearer local_user",
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
        json: async () => ({ error: "title and url are required" }),
      }),
    )

    await expect(listTickets("local_user")).rejects.toThrow("title and url are required")
  })

  it("loads inbox invites with the session bearer token", async () => {
    const body = {
      invites: [
        {
          id: "inv-1",
          plan_id: "plan-1",
          plan_title: "Friday market",
          from_user_id: "user-a",
          to_user_id: "user-b",
          from_first_name: "Mina",
          status: "pending",
          note: "",
          created_at: "2026-10-18T15:00:00Z",
          token: "do-not-cache",
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
    vi.stubGlobal("fetch", fetchMock)

    await expect(listInboxInvites("session-token")).resolves.toEqual([
      {
        id: "inv-1",
        plan_id: "plan-1",
        plan_title: "Friday market",
        from_user_id: "user-a",
        to_user_id: "user-b",
        from_first_name: "Mina",
        status: "pending",
        note: "",
        created_at: "2026-10-18T15:00:00Z",
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/api/invites?box=inbox", {
      headers: {
        Authorization: "Bearer session-token",
        "Content-Type": "application/json",
      },
    })
  })

  it("returns no invites on 404 or a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "missing" }, 404)))
    await expect(listInboxInvites("session-token")).resolves.toEqual([])

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await expect(listInboxInvites("session-token")).resolves.toEqual([])
  })

  it("throws the status code when the error body is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => {
          throw new Error("not json")
        },
      }),
    )

    await expect(listTickets("local_user")).rejects.toThrow("503")
  })
})
