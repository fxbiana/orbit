const STORAGE_KEY = "localUserId"
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export async function localUserId(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return "local_preview"

  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const existing = stored[STORAGE_KEY]
  if (typeof existing === "string" && USER_ID.test(existing)) return existing

  const created = `local_${crypto.randomUUID()}`
  await chrome.storage.local.set({ [STORAGE_KEY]: created })
  return created
}
