import { dismissInviteForSession, readInviteSession } from "../inviteSession"
import { hostnameFromUrl, newestPendingInvite } from "../invites"

const BANNER_MESSAGE = "orbit-invite-banner"
const DISMISS_MESSAGE = "orbit-invite-dismiss"

chrome.runtime.onInstalled.addListener(() => {
  console.info("Orbit extension installed")
})

async function bannerPayload(sender: chrome.runtime.MessageSender) {
  const hostname = hostnameFromUrl(sender.tab?.url)
  if (!hostname) return { invite: null }
  const { summaries, dismissedIds } = await readInviteSession()
  const invite = newestPendingInvite(summaries, hostname, dismissedIds)
  if (!invite) return { invite: null }
  return {
    invite: {
      id: invite.id,
      from_first_name: invite.from_first_name,
      plan_title: invite.plan_title,
    },
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === BANNER_MESSAGE) {
    void bannerPayload(sender).then(sendResponse)
    return true
  }
  if (message?.type === DISMISS_MESSAGE && typeof message.id === "string") {
    void dismissInviteForSession(message.id).then(() => sendResponse({ ok: true }))
    return true
  }
  return undefined
})
