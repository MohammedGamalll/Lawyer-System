import { describe, expect, it } from 'vitest'
import { weekdayName } from '../src/lib/datetime'
import { partiesText, typeSubject } from '../src/pages/WorkPages'
import { msg, taskSchema } from '../shared/schemas'

describe('weekdayName', () => {
  it('names Thursday for 22 Oct 2026', () => {
    expect(weekdayName('2026-10-22', 'ar')).toBe('الخميس')
    expect(weekdayName('2026-10-22', 'en')).toBe('Thursday')
  })
})

describe('cell title helpers', () => {
  it('joins parties and type/subject for hover text', () => {
    expect(
      partiesText({ client_name: 'أحمد علي', opponent_name: 'شركة النور' })
    ).toBe('أحمد علي / شركة النور')
    expect(
      typeSubject({ case_type_name: 'إيجارات', title: 'طرد للغصب' })
    ).toBe('إيجارات — طرد للغصب')
  })
})

describe('taskSchema venue', () => {
  const base = {
    description: 'إعلان',
    due_date: '2026-10-22'
  }

  it('rejects an admin task without a venue', () => {
    const result = taskSchema.safeParse({ ...base, work_kind: 'admin' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'venue' && i.message === msg.required)).toBe(true)
    }
  })

  it('accepts an execution task without a venue', () => {
    const result = taskSchema.safeParse({ ...base, work_kind: 'execution' })
    expect(result.success).toBe(true)
  })

  it('accepts an admin task with a venue', () => {
    const result = taskSchema.safeParse({ ...base, work_kind: 'admin', venue: 'جنوب الجيزة' })
    expect(result.success).toBe(true)
  })
})
