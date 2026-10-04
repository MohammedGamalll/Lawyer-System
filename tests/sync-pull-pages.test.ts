import { describe, expect, it } from 'vitest'
import {
  FULL_PULL_FLAG,
  FULL_PULL_SINCE,
  PULL_PAGE_SIZE,
  lastCursorFromRows,
  parseCheckpoint,
  pullPageRange,
  pullSince
} from '../electron/main/sync/pull'

describe('sync pull paging', () => {
  it('uses a full resync cursor when the office has no cases', () => {
    expect(pullSince('2026-10-03T18:00:00.000Z', true)).toBe(FULL_PULL_SINCE)
    expect(pullSince('2026-10-03T18:00:00.000Z', false)).toBe('2026-10-03T18:00:00.000Z')
  })

  it('pages without gaps so identical updated_at rows are not skipped', () => {
    const first = pullPageRange(0)
    const second = pullPageRange(PULL_PAGE_SIZE)
    expect(first).toEqual({ from: 0, to: 199 })
    expect(second).toEqual({ from: 200, to: 399 })
    expect(second.from).toBe(first.to + 1)
  })

  it('resumes an incomplete checkpoint and keeps a keyset cursor', () => {
    const raw = JSON.stringify({
      full: true,
      since: FULL_PULL_SINCE,
      tableIndex: 15,
      lastId: 'abc-2000',
      offset: 2000,
      maxTs: FULL_PULL_SINCE
    })
    expect(parseCheckpoint(raw)?.lastId).toBe('abc-2000')
    expect(parseCheckpoint(raw)?.offset).toBe(2000)
    expect(parseCheckpoint(JSON.stringify({ tableIndex: 2 }))?.lastId).toBe('')
    expect(parseCheckpoint('nope')).toBeNull()
  })

  it('advances the full-pull keyset from the last primary key on the page', () => {
    expect(lastCursorFromRows([{ id: 'a' }, { id: 'm' }, { id: 'z' }], 'id')).toBe('z')
    expect(lastCursorFromRows([], 'id')).toBe('')
    expect(FULL_PULL_FLAG).toBe('sync_full_pull_v125')
  })
})
