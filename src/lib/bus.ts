import { invalidateListCache } from './listCache'

type Listener = (scopes: Set<string>) => void
const listeners = new Set<Listener>()

let pending: Set<string> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

const COALESCE_MS = 150

function flush() {
  timer = null
  const scopes = pending ?? new Set(['*'])
  pending = null
  if (scopes.has('*')) invalidateListCache()
  else {
    for (const scope of scopes) invalidateListCache(scope)
  }
  for (const fn of [...listeners]) {
    try {
      fn(scopes)
    } catch {
      /* ignore */
    }
  }
}

export function onDataChanged(fn: () => void, filter?: string | string[]) {
  const filters = filter ? (Array.isArray(filter) ? filter : [filter]) : null
  const wrapped: Listener = (scopes) => {
    if (!filters) {
      fn()
      return
    }
    if (scopes.has('*') || filters.some((f) => scopes.has(f))) fn()
  }
  listeners.add(wrapped)
  return () => {
    listeners.delete(wrapped)
  }
}

export function notifyDataChanged(scope?: string | string[]) {
  const next = Array.isArray(scope) ? scope : [scope || '*']
  if (!pending) pending = new Set()
  for (const s of next) {
    if (s) pending.add(s)
  }
  if (timer) return
  timer = setTimeout(flush, COALESCE_MS)
}
