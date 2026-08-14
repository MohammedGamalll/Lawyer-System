import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '../shared/permissions'

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

  it('legal assistant cannot delete clients', () => {
    expect(ROLE_PERMISSIONS.legal_assistant).not.toContain('clients.delete')
  })
})
