/** Shown when Chrome cannot read the open tab, so a demo can still save a page. */
export const DEMO_TAB = {
  title: "Dance show",
  url: "https://www.ticketmaster.com/dance-show-seattle",
}

export function readActiveTab(): Promise<{ title: string; url: string }> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return Promise.reject(new Error("No active tab"))
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      const tab = tabs[0]
      if (!tab?.url) {
        reject(new Error("No active tab"))
        return
      }
      resolve({ title: tab.title || tab.url, url: tab.url })
    })
  })
}

export async function readTabForSave(): Promise<{ title: string; url: string; sample: boolean }> {
  try {
    const tab = await readActiveTab()
    return { ...tab, sample: false }
  } catch {
    return { ...DEMO_TAB, sample: true }
  }
}
