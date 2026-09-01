const TTL_MS = 30_000

type Entry = { at: number; data: unknown }

const cache = new Map<string, Entry>()

export function listCacheKey(channel: string, payload: unknown): string {
  return `${channel}:${JSON.stringify(payload)}`
}

export function getListCache<T>(key: string): T | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.data as T
}

export function setListCache(key: string, data: unknown): void {
  cache.set(key, { at: Date.now(), data })
  if (cache.size > 80) {
    const first = cache.keys().next().value
    if (first) cache.delete(first)
  }
}

export function invalidateListCache(): void {
  cache.clear()
}
