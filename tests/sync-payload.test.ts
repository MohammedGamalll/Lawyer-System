import { describe, expect, it } from 'vitest'
import { omitLocalOnly, stripColumn, unknownColumnFromError } from '../electron/main/sync/payload'

describe('sync payload sanitizer', () => {
  it('drops login-only user columns so the cloud upsert can proceed', () => {
    const clean = omitLocalOnly({
      id: 'u1',
      username: 'admin',
      password_hash: 'x',
      failed_login_attempts: 3,
      last_login_at: '2026-01-01',
      last_login_device: 'Windows'
    })
    expect(clean).toEqual({ id: 'u1', username: 'admin', password_hash: 'x' })
  })

  it('reads the unknown column from PostgREST and Postgres errors', () => {
    expect(unknownColumnFromError(`Could not find the 'failed_login_attempts' column of 'users'`)).toBe(
      'failed_login_attempts'
    )
    expect(unknownColumnFromError('column "avatar_path" of relation "users" does not exist')).toBe('avatar_path')
    expect(unknownColumnFromError('unique violation')).toBeNull()
  })

  it('strips one column for a retry', () => {
    expect(stripColumn({ a: 1, b: 2 }, 'b')).toEqual({ a: 1 })
  })
})
