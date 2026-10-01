import { describe, expect, it } from 'vitest'
import { lockDurationMinutes, remainingLockMinutes } from '../shared/loginLock'

describe('lockDurationMinutes', () => {
  it('does not lock before the attempt threshold', () => {
    expect(lockDurationMinutes(4, 5, 5)).toBeNull()
    expect(lockDurationMinutes(0, 5, 5)).toBeNull()
  })

  it('starts at 5 minutes and doubles after each extra failed login', () => {
    expect(lockDurationMinutes(5, 5, 5)).toBe(5)
    expect(lockDurationMinutes(6, 5, 5)).toBe(10)
    expect(lockDurationMinutes(7, 5, 5)).toBe(20)
    expect(lockDurationMinutes(8, 5, 5)).toBe(40)
  })
})

describe('remainingLockMinutes', () => {
  it('returns 0 when the lock has expired', () => {
    expect(remainingLockMinutes(new Date(Date.now() - 1000).toISOString())).toBe(0)
    expect(remainingLockMinutes(null)).toBe(0)
  })

  it('rounds remaining time up to a whole minute', () => {
    expect(remainingLockMinutes(new Date(Date.now() + 90_000).toISOString())).toBe(2)
  })
})
