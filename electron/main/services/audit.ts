import { getDb } from '../db/database'
import { nowIso } from '../utils/time'
import { newId } from '../db/ids'
import { recordLocalChange } from '../sync/queue'

export function audit(
  user: { id?: string | number; username?: string } | null | undefined,
  action: string,
  entityType: string | null,
  entityId: string | number | null,
  description: string,
  oldValues?: unknown,
  newValues?: unknown,
  deviceInfo?: string
): void {
  const db = getDb()
  const ts = nowIso()
  const id = newId()
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, username, action, entity_type, entity_id, description, old_values, new_values, device_info, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user?.id ?? null,
    user?.username ?? null,
    action,
    entityType,
    entityId,
    description,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    deviceInfo ?? null,
    ts,
    ts
  )
  recordLocalChange('audit_logs', id, 'INSERT')
}
