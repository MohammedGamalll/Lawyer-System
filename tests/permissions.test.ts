import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, shouldMaskClientContact, canAccessPage, NAV_ITEMS, PAGE_ACCESS } from '../shared/permissions'

describe('permissions matrix', () => {
  const allCodes = PERMISSIONS.map((p) => p.code)

  it('defines every role in ROLE_PERMISSIONS', () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role.code], role.code).toBeDefined()
    }
  })

  it('admin has every permission code', () => {
    const admin = new Set(ROLE_PERMISSIONS.admin)
    for (const code of allCodes) {
      expect(admin.has(code), code).toBe(true)
    }
  })

  it('no role references an unknown permission', () => {
    const known = new Set(allCodes)
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const code of perms) {
        expect(known.has(code), `${role}:${code}`).toBe(true)
      }
    }
  })

  it('secretary cannot manage users or settings', () => {
    expect(ROLE_PERMISSIONS.secretary).not.toContain('users.manage')
    expect(ROLE_PERMISSIONS.secretary).not.toContain('settings.manage')
  })

  it('accountant can view accounts but not delete cases', () => {
    expect(ROLE_PERMISSIONS.accountant).toContain('accounts.view')
    expect(ROLE_PERMISSIONS.accountant).not.toContain('cases.delete')
  })

  it('lawyer can create cases and hearings but not manage users', () => {
    expect(ROLE_PERMISSIONS.lawyer).toContain('cases.create')
    expect(ROLE_PERMISSIONS.lawyer).toContain('hearings.create')
    expect(ROLE_PERMISSIONS.lawyer).not.toContain('users.manage')
  })

  it('legal assistant cannot delete clients, unmask contacts, or view accounts', () => {
    expect(ROLE_PERMISSIONS.legal_assistant).not.toContain('clients.delete')
    expect(ROLE_PERMISSIONS.legal_assistant).not.toContain('clients.unmask_contact')
    expect(ROLE_PERMISSIONS.legal_assistant).not.toContain('accounts.view')
  })

  it('secretary and accountant cannot unmask client contact', () => {
    expect(ROLE_PERMISSIONS.secretary).not.toContain('clients.unmask_contact')
    expect(ROLE_PERMISSIONS.accountant).not.toContain('clients.unmask_contact')
  })

  it('lawyer can unmask client contact by default', () => {
    expect(ROLE_PERMISSIONS.lawyer).toContain('clients.unmask_contact')
  })

  it('masks contact unless unmask permission is granted', () => {
    expect(shouldMaskClientContact('secretary', ['clients.view'])).toBe(true)
    expect(shouldMaskClientContact('legal_assistant', ['clients.view', 'clients.update'])).toBe(true)
    expect(shouldMaskClientContact('lawyer', ['clients.view', 'clients.unmask_contact'])).toBe(false)
    expect(shouldMaskClientContact('admin', [])).toBe(false)
  })

  it('covers every office permission the admin can assign', () => {
    const listed = [
      'accounts.expense',
      'accounts.payment',
      'accounts.view',
      'appointments.manage',
      'appointments.view',
      'archive.view',
      'audit.delete',
      'audit.view',
      'backup.manage',
      'calendar.view',
      'cases.create',
      'cases.delete',
      'cases.update',
      'cases.view',
      'cashbox.view',
      'clients.create',
      'clients.delete',
      'clients.unmask_contact',
      'clients.update',
      'clients.view',
      'consultations.manage',
      'consultations.view',
      'contracts.manage',
      'contracts.view',
      'correspondence.manage',
      'correspondence.view',
      'documents.delete',
      'documents.upload',
      'documents.view',
      'employees.manage',
      'employees.view',
      'hearings.create',
      'hearings.delete',
      'hearings.update',
      'hearings.view',
      'invoices.manage',
      'invoices.view',
      'lawyers.view',
      'opponents.manage',
      'opponents.view',
      'poa.manage',
      'poa.view',
      'reminders.view',
      'reports.view',
      'settings.manage',
      'tasks.manage',
      'tasks.view'
    ]
    const known = new Set(PERMISSIONS.map((p) => p.code))
    for (const code of listed) expect(known.has(code), code).toBe(true)
  })

  it('blocks pages the employee was not granted', () => {
    expect(canAccessPage('accounts', 'secretary', ROLE_PERMISSIONS.secretary)).toBe(false)
    expect(canAccessPage('hearings', 'secretary', ROLE_PERMISSIONS.secretary)).toBe(true)
    expect(canAccessPage('invoices', 'accountant', ROLE_PERMISSIONS.accountant)).toBe(true)
    expect(canAccessPage('clients', 'accountant', ROLE_PERMISSIONS.accountant)).toBe(true)
    expect(canAccessPage('users', 'lawyer', ROLE_PERMISSIONS.lawyer)).toBe(false)
    expect(canAccessPage('appointments', 'secretary', ROLE_PERMISSIONS.secretary)).toBe(true)
    expect(canAccessPage('settings', 'custom', ['backup.manage'])).toBe(true)
    expect(canAccessPage('settings', 'custom', [])).toBe(false)
  })

  it('nav pages are in PAGE_ACCESS', () => {
    for (const n of NAV_ITEMS) {
      expect(PAGE_ACCESS[n.id], n.id).toBeDefined()
    }
  })
})
