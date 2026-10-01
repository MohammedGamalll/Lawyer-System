export const DEFAULT_MAX_LOGIN_ATTEMPTS = 5
export const DEFAULT_LOCK_MINUTES = 5

/** First lock = base minutes; each extra failed login after the threshold doubles it (5, 10, 20…). */
export function lockDurationMinutes(
  failedAttempts: number,
  maxAttempts = DEFAULT_MAX_LOGIN_ATTEMPTS,
  baseMinutes = DEFAULT_LOCK_MINUTES
): number | null {
  const max = Math.max(1, Math.floor(Number(maxAttempts) || DEFAULT_MAX_LOGIN_ATTEMPTS))
  const base = Math.max(1, Math.floor(Number(baseMinutes) || DEFAULT_LOCK_MINUTES))
  const fails = Math.floor(Number(failedAttempts) || 0)
  if (fails < max) return null
  const round = Math.min(fails - max, 8)
  return base * 2 ** round
}

export function remainingLockMinutes(lockedUntil: string | null | undefined, nowMs = Date.now()): number {
  if (!lockedUntil) return 0
  const end = new Date(lockedUntil).getTime()
  if (!Number.isFinite(end) || end <= nowMs) return 0
  return Math.max(1, Math.ceil((end - nowMs) / 60_000))
}
