import {
  getContact,
  listConnections,
  listMatches,
  listMessages,
  listNearbyEvents,
  listPlanMatches,
  listPlans,
  listTickets,
  sessionToken,
  type Connection,
  type Plan,
} from "./api"

/** Session cache for navigation panels. Values stay until the tab closes. */
const store = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

export const PANEL_KEYS = {
  matches: "matches:50",
  plans: "plans",
  events: "events",
  tickets: "tickets",
  contact: "contact",
  inbox: "connections:inbox",
  outbox: "connections:outbox",
  friends: "connections:friends",
  planMatches: (planId: string) => `plan-matches:${planId}`,
  messages: (connectionId: string) => `messages:${connectionId}`,
} as const

const CONNECTION_KEYS = [PANEL_KEYS.inbox, PANEL_KEYS.outbox, PANEL_KEYS.friends] as const

export function readCache<T>(key: string): T | undefined {
  if (!store.has(key)) return undefined
  return store.get(key) as T
}

export function writeCache<T>(key: string, value: T): void {
  store.set(key, value)
}

export function invalidatePanels(keys: readonly string[]): void {
  for (const key of keys) {
    store.delete(key)
    inflight.delete(key)
  }
}

export function clearPanelCache(): void {
  store.clear()
  inflight.clear()
}

/** Return a stored value, or run loader once and store it. Later reads skip the network. */
export function loadCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (store.has(key)) return Promise.resolve(store.get(key) as T)
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>
  let promise!: Promise<T>
  promise = loader()
    .then((value) => {
      if (inflight.get(key) === promise) {
        store.set(key, value)
        inflight.delete(key)
      }
      return value
    })
    .catch((err: unknown) => {
      if (inflight.get(key) === promise) inflight.delete(key)
      throw err
    })
  inflight.set(key, promise)
  return promise
}

/** Network read that replaces the stored value. Use after a write. */
export function refreshCached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  store.delete(key)
  inflight.delete(key)
  return loadCached(key, loader)
}

export function linksFromCache(): Record<string, "out" | "in" | "accepted"> {
  const links: Record<string, "out" | "in" | "accepted"> = {}
  const boxes: Array<[string, "out" | "in" | "accepted"]> = [
    [PANEL_KEYS.outbox, "out"],
    [PANEL_KEYS.inbox, "in"],
    [PANEL_KEYS.friends, "accepted"],
  ]
  for (const [key, status] of boxes) {
    const body = readCache<{ connections?: Connection[] }>(key)
    for (const item of body?.connections ?? []) {
      links[item.other.user_id] = status
    }
  }
  return links
}

/** Fetch every desk panel into the cache before the user opens it. */
export async function warmPanels(getToken: () => Promise<string | null>): Promise<void> {
  const token = await sessionToken(getToken)
  await Promise.allSettled([
    loadCached(PANEL_KEYS.matches, () => listMatches(token, 50)),
    loadCached(PANEL_KEYS.plans, () => listPlans(token)),
    loadCached(PANEL_KEYS.events, () => listNearbyEvents(token)),
    loadCached(PANEL_KEYS.tickets, () => listTickets(token)),
    loadCached(PANEL_KEYS.contact, () => getContact(token)),
    loadCached(PANEL_KEYS.inbox, () => listConnections(token, "inbox")),
    loadCached(PANEL_KEYS.outbox, () => listConnections(token, "outbox")),
    loadCached(PANEL_KEYS.friends, () => listConnections(token, "friends")),
  ])

  const plans = readCache<{ plans?: Plan[] }>(PANEL_KEYS.plans)
  const joined = (plans?.plans ?? []).filter((plan) => plan.viewer_joined === true)
  const friends = readCache<{ connections?: Connection[] }>(PANEL_KEYS.friends)
  await Promise.allSettled([
    ...joined.map((plan) =>
      loadCached(PANEL_KEYS.planMatches(plan.id), () => listPlanMatches(token, plan.id)),
    ),
    ...(friends?.connections ?? []).map((connection) =>
      loadCached(PANEL_KEYS.messages(connection.id), () => listMessages(token, connection.id)),
    ),
  ])
}

export function invalidateConnections(): void {
  invalidatePanels(CONNECTION_KEYS)
}
