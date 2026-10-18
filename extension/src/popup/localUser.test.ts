import { beforeEach, expect, it, vi } from "vitest"
import { localUserId } from "./localUser"

const store = new Map<string, unknown>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) store.set(key, value)
        },
      },
    },
  })
})

it("creates a local user id and keeps it", async () => {
  const first = await localUserId()
  const second = await localUserId()

  expect(first).toMatch(/^local_[A-Za-z0-9-]+$/)
  expect(second).toBe(first)
})

it("replaces a stored id the API would reject", async () => {
  store.set("localUserId", "../other")

  const created = await localUserId()

  expect(created).toMatch(/^local_[A-Za-z0-9-]+$/)
  expect(created).not.toBe("../other")
})
