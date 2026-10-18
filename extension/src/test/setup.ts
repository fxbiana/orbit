import { cleanup } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
  for (const key of Object.keys(sessionData)) delete sessionData[key]
})

const sessionData: Record<string, unknown> = {}

function sessionKeys(keys?: string | string[] | Record<string, unknown> | null): string[] | null {
  if (keys == null) return null
  if (typeof keys === "string") return [keys]
  if (Array.isArray(keys)) return keys
  return Object.keys(keys)
}

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
  storage: {
    session: {
      get: async (keys?: string | string[] | Record<string, unknown> | null) => {
        const names = sessionKeys(keys)
        if (!names) return { ...sessionData }
        const result: Record<string, unknown> = {}
        for (const key of names) {
          if (Object.prototype.hasOwnProperty.call(sessionData, key)) result[key] = sessionData[key]
        }
        return result
      },
      set: async (items: Record<string, unknown>) => {
        Object.assign(sessionData, items)
      },
    },
  },
}

Object.assign(globalThis, { chrome: chromeStub })
