export function isRemoteNewer(remoteUpdatedAt?: string | null, localUpdatedAt?: string | null): boolean {
  const r = Date.parse(String(remoteUpdatedAt || 0))
  const l = Date.parse(String(localUpdatedAt || 0))
  if (Number.isNaN(r)) return false
  if (Number.isNaN(l)) return true
  return r >= l
}
