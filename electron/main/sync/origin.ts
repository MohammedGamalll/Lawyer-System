let remoteWriteDepth = 0

export function isRemoteWrite(): boolean {
  return remoteWriteDepth > 0
}

export function runAsRemote<T>(fn: () => T): T {
  remoteWriteDepth += 1
  try {
    return fn()
  } finally {
    remoteWriteDepth -= 1
  }
}
