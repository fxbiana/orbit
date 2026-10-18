import { listInboxInvites } from "./popup/api"
import {
  DISMISSED_INVITE_STORAGE_KEY,
  dismissInviteId,
  dismissedIdsFromStorage,
  INVITE_SUMMARY_STORAGE_KEY,
  shapeInviteSummaries,
  type InviteSummary,
} from "./invites"

export async function writeInviteSummaries(summaries: readonly InviteSummary[]): Promise<void> {
  await chrome.storage.session.set({
    [INVITE_SUMMARY_STORAGE_KEY]: shapeInviteSummaries(summaries),
  })
}

/** Refresh non-secret inbox summaries. The token is used for this request only. */
export async function cacheInboxInvites(token: string): Promise<void> {
  const summaries = await listInboxInvites(token)
  await writeInviteSummaries(summaries)
}

export async function readInviteSession(): Promise<{
  summaries: InviteSummary[]
  dismissedIds: string[]
}> {
  const stored = await chrome.storage.session.get([
    INVITE_SUMMARY_STORAGE_KEY,
    DISMISSED_INVITE_STORAGE_KEY,
  ])
  return {
    summaries: shapeInviteSummaries(stored[INVITE_SUMMARY_STORAGE_KEY]),
    dismissedIds: dismissedIdsFromStorage(stored[DISMISSED_INVITE_STORAGE_KEY]),
  }
}

export async function dismissInviteForSession(id: string): Promise<void> {
  const { dismissedIds } = await readInviteSession()
  await chrome.storage.session.set({
    [DISMISSED_INVITE_STORAGE_KEY]: dismissInviteId(dismissedIds, id),
  })
}
