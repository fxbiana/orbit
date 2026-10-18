/** Non-secret plan-invite fields safe to keep in chrome.storage.session. */
export type InviteSummary = {
  id: string
  plan_id: string
  plan_title: string
  from_user_id: string
  to_user_id: string
  from_first_name: string
  status: string
  note: string
  created_at: string
}

export const INVITE_SUMMARY_STORAGE_KEY = "orbitInviteSummaries"
export const DISMISSED_INVITE_STORAGE_KEY = "orbitDismissedInviteIds"

const SUMMARY_FIELDS = [
  "id",
  "plan_id",
  "plan_title",
  "from_user_id",
  "to_user_id",
  "from_first_name",
  "status",
  "note",
  "created_at",
] as const

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function summaryFrom(value: unknown): InviteSummary | null {
  if (!isRecord(value)) return null
  const summary = {} as InviteSummary
  for (const field of SUMMARY_FIELDS) {
    const item = value[field]
    if (typeof item !== "string") return null
    summary[field] = item
  }
  if (!summary.id) return null
  return summary
}

/** Keep only the invite contract fields. Extra properties, including tokens, are dropped. */
export function shapeInviteSummaries(body: unknown): InviteSummary[] {
  const invites = isRecord(body) ? body.invites : body
  if (!Array.isArray(invites)) return []
  const summaries: InviteSummary[] = []
  for (const item of invites) {
    const summary = summaryFrom(item)
    if (summary) summaries.push(summary)
  }
  return summaries
}

export function dismissedIdsFromStorage(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

export function dismissInviteId(dismissedIds: readonly string[], id: string): string[] {
  if (!id || dismissedIds.includes(id)) return [...dismissedIds]
  return [...dismissedIds, id]
}

function createdAtMillis(createdAt: string): number {
  const parsed = Date.parse(createdAt)
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

/** Newest pending invite, and only on instagram.com or www.instagram.com. */
export function newestPendingInvite(
  invites: readonly InviteSummary[],
  hostname: string,
  dismissedIds: readonly string[] = [],
): InviteSummary | null {
  if (!INSTAGRAM_HOSTS.has(hostname.trim().toLowerCase())) return null
  const dismissed = new Set(dismissedIds)
  const pending = invites.filter(
    (invite) => invite.status === "pending" && invite.id.length > 0 && !dismissed.has(invite.id),
  )
  if (pending.length === 0) return null
  return [...pending].sort(
    (left, right) => createdAtMillis(right.created_at) - createdAtMillis(left.created_at),
  )[0]
}

export function inviteBannerText(invite: Pick<InviteSummary, "from_first_name" | "plan_title">): string {
  const name = invite.from_first_name.trim() || "Someone"
  return `${name} invited you to ${invite.plan_title} on Orbit.`
}

export function hostnameFromUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}
