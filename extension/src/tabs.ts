export function readActiveTab(): Promise<{ title: string; url: string }> {
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
