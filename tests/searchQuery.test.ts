import { describe, expect, it } from 'vitest'
import { isProgramCodeQuery, shouldSkipFts } from '../shared/searchQuery'

describe('searchQuery', () => {
  it('treats padded and short numeric codes as program-code queries', () => {
    expect(isProgramCodeQuery('512')).toBe(true)
    expect(isProgramCodeQuery('CS-00512')).toBe(true)
    expect(isProgramCodeQuery('cs512')).toBe(true)
    expect(isProgramCodeQuery('احمد')).toBe(false)
    expect(shouldSkipFts('512')).toBe(true)
    expect(shouldSkipFts('أحمد')).toBe(true)
    expect(shouldSkipFts('UniqueZ')).toBe(false)
  })
})
