import { afterEach, expect, it, vi } from "vitest"
import { DEMO_TAB, readActiveTab, readTabForSave } from "./tabs"

afterEach(() => {
  vi.unstubAllGlobals()
})

function installChrome(
  query: (
    queryInfo: chrome.tabs.QueryInfo,
    callback: (tabs: chrome.tabs.Tab[]) => void,
  ) => void,
) {
  const chromeStub = {
    runtime: {
      lastError: undefined as { message?: string } | undefined,
    },
    tabs: { query: vi.fn(query) },
  }
  vi.stubGlobal("chrome", chromeStub)
  return chromeStub
}

it("returns the active tab title and url", async () => {
  installChrome((_query, callback) => {
    callback([{ title: "Docs", url: "https://example.com/docs" } as chrome.tabs.Tab])
  })

  await expect(readActiveTab()).resolves.toEqual({
    title: "Docs",
    url: "https://example.com/docs",
  })
})

it("uses the url when the tab has no title", async () => {
  installChrome((_query, callback) => {
    callback([{ url: "https://example.com/docs" } as chrome.tabs.Tab])
  })

  await expect(readActiveTab()).resolves.toEqual({
    title: "https://example.com/docs",
    url: "https://example.com/docs",
  })
})

it("rejects when the active tab has no url", async () => {
  installChrome((_query, callback) => {
    callback([{} as chrome.tabs.Tab])
  })

  await expect(readActiveTab()).rejects.toThrow("No active tab")
})

it("uses the sample event page when the active tab cannot be read", async () => {
  vi.stubGlobal("chrome", undefined)

  await expect(readTabForSave()).resolves.toEqual({ ...DEMO_TAB, sample: true })
})

it("marks a readable tab as the real page", async () => {
  installChrome((_query, callback) => {
    callback([{ title: "Docs", url: "https://example.com/docs" } as chrome.tabs.Tab])
  })

  await expect(readTabForSave()).resolves.toEqual({
    title: "Docs",
    url: "https://example.com/docs",
    sample: false,
  })
})

it("rejects when there is no active tab", async () => {
  installChrome((_query, callback) => {
    callback([])
  })

  await expect(readActiveTab()).rejects.toThrow("No active tab")
})

it("rejects with the chrome runtime error", async () => {
  const chromeStub = installChrome((_query, callback) => {
    chromeStub.runtime.lastError = { message: "Tabs permission missing" }
    callback([])
  })

  await expect(readActiveTab()).rejects.toThrow("Tabs permission missing")
})
