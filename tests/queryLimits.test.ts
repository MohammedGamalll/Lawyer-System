import { describe, expect, it } from 'vitest'
import { applyColumnFilters, clampPageSize, orderBySql, programCodeSortSql } from '../electron/main/db/queryLimits'

describe('clampPageSize', () => {
  it('allows 500 and 1000 list pages and caps above 1000', () => {
    expect(clampPageSize(500, 'list')).toBe(500)
    expect(clampPageSize(1000, 'list')).toBe(1000)
    expect(clampPageSize(2000, 'list')).toBe(1000)
  })

  it('keeps lookup pages at 40', () => {
    expect(clampPageSize(100, 'lookup')).toBe(40)
  })
})

describe('applyColumnFilters', () => {
  it('adds LIKE clauses for known columns and skips empty or unknown keys', () => {
    const params: unknown[] = []
    const where = applyColumnFilters('WHERE 1=1', params, { title: 'مدني', ghost: 'x', empty: '  ' }, { title: 'c.title' })
    expect(where).toContain("AND IFNULL(CAST(c.title AS TEXT), '') LIKE ?")
    expect(where).not.toContain('ghost')
    expect(params).toEqual(['%مدني%'])
  })
})

describe('orderBySql', () => {
  it('keeps fallback when sort is empty or unknown', () => {
    expect(orderBySql(undefined, 'desc', { title: 'c.title' }, 'c.created_at DESC')).toBe('c.created_at DESC')
    expect(orderBySql('ghost', 'asc', { title: 'c.title' }, 'c.created_at DESC')).toBe('c.created_at DESC')
  })

  it('applies ASC/DESC only for allowed columns', () => {
    expect(orderBySql('title', 'asc', { title: 'c.title COLLATE NOCASE' }, 'x')).toBe('c.title COLLATE NOCASE ASC')
    expect(orderBySql('title', 'desc', { title: 'c.title COLLATE NOCASE' }, 'x')).toBe('c.title COLLATE NOCASE DESC')
  })
})

describe('programCodeSortSql', () => {
  it('casts stripped CS/CL prefixes to integers', () => {
    const sql = programCodeSortSql('c.case_number')
    expect(sql).toContain('CAST(')
    expect(sql).toContain('CS-')
    expect(sql).toContain('CL-')
    expect(sql).toContain('c.case_number')
  })
})
