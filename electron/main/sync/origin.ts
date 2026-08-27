let remoteWriteDepth = 0
let skipQueueDepth = 0

export function isRemoteWrite(): boolean {
  return remoteWriteDepth > 0 || skipQueueDepth > 0
}

export function runAsRemote<T>(fn: () => T): T {
  remoteWriteDepth += 1
  try {
    return fn()
  } finally {
    remoteWriteDepth -= 1
  }
}

/** Local inserts (demo seed) that must not fill the sync queue. */
export function runWithoutLocalQueue<T>(fn: () => T): T {
  skipQueueDepth += 1
  try {
    return fn()
  } finally {
    skipQueueDepth -= 1
  }
}
