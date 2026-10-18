import { webAppUrl } from "../popup/api"
import { inviteBannerText } from "../invites"

const HOST_ID = "orbit-invite-banner-host"
const BANNER_MESSAGE = "orbit-invite-banner"
const DISMISS_MESSAGE = "orbit-invite-dismiss"

type BannerInvite = {
  id: string
  from_first_name: string
  plan_title: string
}

/**
 * Instagram page content is never read. The banner exists only from an invite
 * summary the extension already cached after the popup signed in.
 */
export function mountInviteBanner(invite: BannerInvite, documentRef: Document = document): HTMLElement {
  documentRef.getElementById(HOST_ID)?.remove()

  const host = documentRef.createElement("div")
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: "open" })
  const style = documentRef.createElement("style")
  style.textContent = `
    :host { all: initial; }
    .banner {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 2147483647;
      display: flex;
      gap: 8px;
      align-items: center;
      max-width: 340px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #141821;
      color: #f4f1ea;
      font: 13px/1.4 "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }
    p { margin: 0; flex: 1; }
    button {
      font: inherit;
      border: 0;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .open { background: #efe6d6; color: #1b1712; }
    .dismiss { background: transparent; color: #f4f1ea; }
  `
  const banner = documentRef.createElement("div")
  banner.className = "banner"
  const text = documentRef.createElement("p")
  text.textContent = inviteBannerText(invite)
  const open = documentRef.createElement("button")
  open.type = "button"
  open.className = "open"
  open.textContent = "Open Orbit"
  open.addEventListener("click", () => {
    window.open(webAppUrl(), "_blank", "noopener,noreferrer")
  })
  const dismiss = documentRef.createElement("button")
  dismiss.type = "button"
  dismiss.className = "dismiss"
  dismiss.textContent = "Dismiss"
  dismiss.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: DISMISS_MESSAGE, id: invite.id }).then(() => {
      void showInviteBanner(documentRef)
    })
  })
  banner.append(text, open, dismiss)
  shadow.append(style, banner)
  ;(documentRef.body ?? documentRef.documentElement).append(host)
  return host
}

export async function showInviteBanner(documentRef: Document = document): Promise<void> {
  let invite: BannerInvite | null = null
  try {
    const response = (await chrome.runtime.sendMessage({ type: BANNER_MESSAGE })) as
      | { invite?: BannerInvite | null }
      | undefined
    if (response?.invite?.id) invite = response.invite
  } catch {
    invite = null
  }
  if (!invite) {
    documentRef.getElementById(HOST_ID)?.remove()
    return
  }
  mountInviteBanner(invite, documentRef)
}

if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  void showInviteBanner()
}
