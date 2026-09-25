export type RemoteUserRow = {
  id: string
  password_hash: string
  is_active: number | boolean
  role_id: string
  deleted_at?: string | null
  updated_at?: string | null
}

export type LocalUserRow = {
  password_hash: string
  is_active: number | boolean
  role_id: string
}

export type GuardDecision =
  | { action: 'continue' }
  | { action: 'key'; error: string }
  | { action: 'banned' }
  | { action: 'reverify' }
  | { action: 'role'; roleId: string }

function activeFlag(value: number | boolean | null | undefined): boolean {
  return Number(value) === 1 || value === true
}

/** Pure decision for pre-push auth. Safe to unit-test without SQLite. */
export function decideGuard(input: {
  fetchError?: string
  remote: RemoteUserRow | null
  local: LocalUserRow
  usersRowQueued: boolean
}): GuardDecision {
  if (input.fetchError) {
    return { action: 'key', error: input.fetchError }
  }
  if (!input.remote) return { action: 'continue' }

  const remote = input.remote
  if (remote.deleted_at || !activeFlag(remote.is_active)) {
    return { action: 'banned' }
  }

  if (String(remote.password_hash || '') !== String(input.local.password_hash || '')) {
    if (input.usersRowQueued) return { action: 'continue' }
    return { action: 'reverify' }
  }

  if (String(remote.role_id || '') !== String(input.local.role_id || '')) {
    return { action: 'role', roleId: String(remote.role_id) }
  }

  return { action: 'continue' }
}

export const PRIVILEGED_QUEUE_TABLES = [
  'settings',
  'roles',
  'permissions',
  'role_permissions',
  'user_permissions',
  'number_sequences'
] as const
