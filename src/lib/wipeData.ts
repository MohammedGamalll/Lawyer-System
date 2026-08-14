import { invoke } from './api'
import { notifyDataChanged } from './bus'

async function idsOf(channel: string, extra: Record<string, unknown> = {}): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page <= 80; page++) {
    const data = await invoke<{ rows?: { id: string }[]; total?: number }>(channel, { page, pageSize: 200, ...extra })
    const rows = data?.rows || []
    out.push(...rows.map((r) => String(r.id || '')).filter(Boolean))
    if (!rows.length || out.length >= Number(data.total || rows.length)) break
  }
  return out
}

async function removeListed(listChannel: string, removeChannel: string, extra: Record<string, unknown> = {}) {
  const ids = await idsOf(listChannel, extra)
  for (const id of ids) {
    try {
      await invoke(removeChannel, id)
    } catch {
      /* صف مرتبط أو محذوف مسبقاً */
    }
  }
}

async function wipeViaExistingApis() {
  const steps: [string, string, Record<string, unknown>?][] = [
    ['documents:list', 'documents:remove'],
    ['hearings:list', 'hearings:remove'],
    ['payments:list', 'payments:remove'],
    ['expenses:list', 'expenses:remove'],
    ['invoices:list', 'invoices:remove'],
    ['poa:list', 'poa:remove'],
    ['contracts:list', 'contracts:remove'],
    ['consultations:list', 'consultations:remove'],
    ['correspondence:list', 'correspondence:remove'],
    ['tasks:list', 'tasks:remove'],
    ['reminders:list', 'reminders:remove'],
    ['appointments:list', 'appointments:remove'],
    ['cases:list', 'cases:remove'],
    ['cases:list', 'cases:remove', { archived: 1 }],
    ['clients:list', 'clients:remove'],
    ['opponents:list', 'opponents:remove'],
    ['employees:list', 'employees:remove'],
    ['lawyers:list', 'lawyers:remove']
  ]
  for (const [list, remove, extra] of steps) {
    try {
      await removeListed(list, remove, extra)
    } catch {
      /* القناة غير متاحة */
    }
  }
  try {
    const audit = await invoke<{ rows?: { id: string }[] }>('audit:list', { page: 1, pageSize: 2000 })
    const ids = (audit.rows || []).map((r) => String(r.id || '')).filter(Boolean)
    if (ids.length) await invoke('audit:remove', ids)
  } catch {
    /* تجاهل */
  }
  try {
    await invoke('files:gc')
  } catch {
    /* تجاهل */
  }
}

export async function wipeAllBusinessData() {
  try {
    await invoke('demo:wipe')
  } catch {
    await wipeViaExistingApis()
  }
  notifyDataChanged()
}
