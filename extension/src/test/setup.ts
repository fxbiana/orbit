import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})

const chromeStub = {
  runtime: {
    lastError: undefined as { message?: string } | undefined,
    getURL: (path: string) => `chrome-extension://gpnknnpdogpdgeejedabdihnacblhmmj/${path}`,
  },
  tabs: {
    query: (
      _queryInfo: chrome.tabs.QueryInfo,
      callback: (tabs: chrome.tabs.Tab[]) => void,
    ) => {
      callback([])
    },
  },
}

Object.assign(globalThis, { chrome: chromeStub })
