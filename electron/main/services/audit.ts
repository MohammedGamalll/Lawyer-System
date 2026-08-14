import { getDb } from '../db/database'
import { nowIso } from '../utils/time'

export function audit(
  user: { id?: number; username?: string } | null | undefined,
  action: string,
  entityType: string | null,
  entityId: number | null,
  description: string,
  oldValues?: unknown,
  newValues?: unknown,
  deviceInfo?: string
): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, description, old_values, new_values, device_info, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.id ?? null,
    user?.username ?? null,
    action,
    entityType,
    entityId,
    description,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    deviceInfo ?? null,
    nowIso()
  )
}
