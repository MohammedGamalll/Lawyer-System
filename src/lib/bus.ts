type Listener = () => void
const listeners = new Set<Listener>()

export function onDataChanged(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function notifyDataChanged() {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }
}
