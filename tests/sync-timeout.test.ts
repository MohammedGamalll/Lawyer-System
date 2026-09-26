import { describe, expect, it } from 'vitest'
import { mapSyncError } from '../electron/main/sync/errors'
import { TIMEOUT_MESSAGE, withTimeout } from '../electron/main/sync/timeout'

describe('sync request timeout', () => {
  it('rejects a hung promise and maps the Arabic timeout', async () => {
    await expect(withTimeout(new Promise(() => undefined), 25)).rejects.toThrow('مهلة')
    expect(mapSyncError('Request timeout')).toContain('مهلة')
    expect(mapSyncError(TIMEOUT_MESSAGE)).toContain('مهلة')
  })

  it('resolves when the request finishes in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 200)).resolves.toBe(7)
  })

  it('clears the cycle lock after a timeout so another run can start', async () => {
    let locked: Promise<void> | null = withTimeout(new Promise<void>(() => undefined), 20).finally(() => {
      locked = null
    })
    await expect(locked).rejects.toThrow('مهلة')
    expect(locked).toBeNull()
  })
})
