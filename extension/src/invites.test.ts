import { describe, expect, it } from "vitest"
import {
  dismissInviteId,
  dismissedIdsFromStorage,
  inviteBannerText,
  newestPendingInvite,
  shapeInviteSummaries,
  type InviteSummary,
} from "./invites"

function invite(overrides: Partial<InviteSummary> = {}): InviteSummary {
  return {
    id: "inv-1",
    plan_id: "plan-1",
    plan_title: "Friday market",
    from_user_id: "user-a",
    to_user_id: "user-b",
    from_first_name: "Mina",
    status: "pending",
    note: "come through",
    created_at: "2026-10-18T15:00:00Z",
    ...overrides,
  }
}

describe("newest pending invite", () => {
  it("returns the newest pending invite on instagram hostnames", () => {
    const older = invite({ id: "old", created_at: "2026-10-17T15:00:00Z" })
    const newer = invite({
      id: "new",
      plan_title: "Night market",
      created_at: "2026-10-18T18:00:00Z",
    })
    const accepted = invite({
      id: "accepted",
      status: "accepted",
      created_at: "2026-10-19T18:00:00Z",
    })

    expect(newestPendingInvite([older, accepted, newer], "www.instagram.com")).toEqual(newer)
    expect(newestPendingInvite([older, newer], "instagram.com")).toEqual(newer)
    expect(newestPendingInvite([older, newer], "INSTAGRAM.com")).toEqual(newer)
  })

  it("returns null for any other hostname", () => {
    const pending = invite()
    expect(newestPendingInvite([pending], "m.instagram.com")).toBeNull()
    expect(newestPendingInvite([pending], "example.com")).toBeNull()
    expect(newestPendingInvite([pending], "")).toBeNull()
  })

  it("returns null when nothing is pending", () => {
    expect(
      newestPendingInvite([invite({ status: "accepted" }), invite({ id: "no", status: "" })], "instagram.com"),
    ).toBeNull()
    expect(newestPendingInvite([], "www.instagram.com")).toBeNull()
  })

  it("skips invites dismissed for this session and keeps the next newest", () => {
    const older = invite({ id: "old", created_at: "2026-10-17T15:00:00Z" })
    const newer = invite({ id: "new", created_at: "2026-10-18T18:00:00Z" })
    expect(newestPendingInvite([older, newer], "instagram.com", ["new"])).toEqual(older)
    expect(newestPendingInvite([newer], "www.instagram.com", ["new"])).toBeNull()
  })
})

describe("invite cache shaping", () => {
  it("keeps contract fields and drops anything else", () => {
    const shaped = shapeInviteSummaries({
      invites: [
        {
          ...invite(),
          token: "secret-token",
          email: "mina@example.com",
          instagram_username: "mina",
        },
      ],
    })

    expect(shaped).toEqual([invite()])
    expect(shaped[0]).not.toHaveProperty("token")
    expect(shaped[0]).not.toHaveProperty("email")
    expect(shaped[0]).not.toHaveProperty("instagram_username")
  })

  it("drops rows that are not complete string summaries", () => {
    expect(
      shapeInviteSummaries({
        invites: [invite(), { id: "partial", status: "pending" }, null, "nope", invite({ id: "" })],
      }),
    ).toEqual([invite()])
  })

  it("returns an empty cache when the body is not an invite list", () => {
    expect(shapeInviteSummaries(null)).toEqual([])
    expect(shapeInviteSummaries({ invites: { id: "inv-1" } })).toEqual([])
    expect(shapeInviteSummaries({})).toEqual([])
  })

  it("shapes a stored array the same way as an API body", () => {
    expect(shapeInviteSummaries([invite({ token: "nope" } as InviteSummary & { token: string })])).toEqual([
      invite(),
    ])
  })

  it("tracks dismissed invite ids without duplicates", () => {
    expect(dismissedIdsFromStorage(["inv-1", "", 2, "inv-1"])).toEqual(["inv-1"])
    expect(dismissedIdsFromStorage(null)).toEqual([])
    expect(dismissInviteId(["inv-1"], "inv-2")).toEqual(["inv-1", "inv-2"])
    expect(dismissInviteId(["inv-1"], "inv-1")).toEqual(["inv-1"])
    expect(dismissInviteId(["inv-1"], "")).toEqual(["inv-1"])
  })
})

describe("invite banner text", () => {
  it("names the inviter and the plan", () => {
    expect(inviteBannerText(invite())).toBe("Mina invited you to Friday market on Orbit.")
  })

  it("uses Someone when the first name is blank", () => {
    expect(inviteBannerText(invite({ from_first_name: "" }))).toBe(
      "Someone invited you to Friday market on Orbit.",
    )
    expect(inviteBannerText(invite({ from_first_name: "   " }))).toBe(
      "Someone invited you to Friday market on Orbit.",
    )
  })
})
