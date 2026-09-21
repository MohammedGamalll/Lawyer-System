import { getDb } from '../db/database'
import { nowIso, todayIso } from '../utils/time'
import { cairoDateTimeStamp } from '@shared/cairoDate'
import { formattedCourtNumber, printLookupLabel, stripProgramPrefix } from '@shared/printLabels'
import { audit } from './audit'
import { newId, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import { getSetting } from './settings'
import { getCase } from './cases'
import { getClient } from './clients'
import { appFontFace, officeLogoDataUrl, printHtml } from './print'
import type { BrowserWindow } from 'electron'
import {
  defaultCaseLayout,
  PRINT_FIELD_KEYS,
  renderLayoutHtml,
  sanitizeLayout,
  sanitizePlain,
  type PrintFieldKey,
  type PrintLayout
} from '@shared/printTemplate'

export type PrintTemplateRow = {
  id: string
  name: string
  page_size: string
  layout_json: string
  created_at: string
  updated_at: string
}

function parseLayout(json: string): PrintLayout {
  try {
    return sanitizeLayout(JSON.parse(json))
  } catch {
    return defaultCaseLayout()
  }
}

export function listPrintTemplates(): PrintTemplateRow[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM print_templates WHERE ${notDeleted()} ORDER BY updated_at DESC`)
    .all() as PrintTemplateRow[]
  if (rows.length) return rows
  const seeded = createPrintTemplate(null, { name: 'ورقة بيانات قضية', layout: defaultCaseLayout() })
  return db.prepare(`SELECT * FROM print_templates WHERE id = ?`).all(seeded.id) as PrintTemplateRow[]
}

export function getPrintTemplate(id: string) {
  const row = getDb().prepare(`SELECT * FROM print_templates WHERE id = ? AND ${notDeleted()}`).get(id) as
    | PrintTemplateRow
    | undefined
  if (!row) throw new Error('القالب غير موجود')
  return { ...row, layout: parseLayout(row.layout_json) }
}

export function createPrintTemplate(actor: AuthedUser | null, data: { name?: unknown; layout?: unknown }) {
  const name = sanitizePlain(data.name || 'قالب جديد', 80) || 'قالب جديد'
  const layout = sanitizeLayout(data.layout)
  const id = newId()
  const ts = nowIso()
  getDb()
    .prepare(
      `INSERT INTO print_templates (id, name, page_size, layout_json, created_at, updated_at) VALUES (?,?,?,?,?,?)`
    )
    .run(id, name, 'A4', JSON.stringify(layout), ts, ts)
  recordLocalChange('print_templates', id, 'INSERT')
  if (actor) audit(actor, 'create', 'print_templates', id, `تم إنشاء قالب طباعة: ${name}`)
  return { id }
}

export function updatePrintTemplate(actor: AuthedUser, id: string, data: { name?: unknown; layout?: unknown }) {
  const old = getDb().prepare(`SELECT * FROM print_templates WHERE id = ? AND ${notDeleted()}`).get(id) as
    | PrintTemplateRow
    | undefined
  if (!old) throw new Error('القالب غير موجود')
  const name = sanitizePlain(data.name ?? old.name, 80) || old.name
  const layout = data.layout !== undefined ? sanitizeLayout(data.layout) : parseLayout(old.layout_json)
  getDb()
    .prepare(`UPDATE print_templates SET name=?, layout_json=?, updated_at=? WHERE id=?`)
    .run(name, JSON.stringify(layout), nowIso(), id)
  recordLocalChange('print_templates', id, 'UPDATE')
  audit(actor, 'update', 'print_templates', id, `تم تعديل قالب طباعة: ${name}`)
  return { id }
}

export function removePrintTemplate(actor: AuthedUser, id: string) {
  const old = getDb().prepare(`SELECT name FROM print_templates WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { name: string }
    | undefined
  if (!old) throw new Error('القالب غير موجود')
  softDelete('print_templates', id)
  audit(actor, 'delete', 'print_templates', id, `تم حذف قالب طباعة: ${old.name}`)
}

function money(n: unknown) {
  const v = Number(n || 0)
  if (!Number.isFinite(v)) return '0'
  return v.toLocaleString('ar-EG')
}

export function printFieldCatalog() {
  return PRINT_FIELD_KEYS.slice()
}

function clip(s: string, max = 1600) {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function listLines(rows: string[], max = 14) {
  return clip(rows.filter(Boolean).slice(0, max).join('\n'))
}

export function buildPrintContext(opts: { caseId?: string; clientId?: string; actor?: AuthedUser | null }): Record<PrintFieldKey, string> {
  const empty = Object.fromEntries(PRINT_FIELD_KEYS.map((k) => [k, ''])) as Record<PrintFieldKey, string>
  empty['office.name'] = getSetting('office_name', '')
  empty['office.address'] = getSetting('office_address', '')
  empty['office.phone'] = [getSetting('office_phone', ''), getSetting('office_phone2', ''), getSetting('office_phone3', '')]
    .filter(Boolean)
    .join(' — ')
  empty['office.logo'] = ''
  empty.today = todayIso()
  let clientId = opts.clientId || ''
  if (opts.caseId) {
    const packed = getCase(opts.caseId, opts.actor) as Record<string, unknown>
    const fees = (packed.fees as Record<string, unknown> | undefined) || {}
    const opponents = (packed.opponents as {
      full_name?: string
      lawyer_name?: string
      phone?: string
      capacity_first?: string
      capacity_appeal?: string
      capacity_cassation?: string
    }[] | undefined) || []
    const hearings = (packed.hearings as {
      hearing_date?: string
      hearing_type?: string
      court_decision?: string
      status?: string
      venue?: string
    }[]) || []
    const tasks = (packed.tasks as { title?: string; due_date?: string; status?: string; venue?: string }[]) || []
    empty['case.case_number'] = stripProgramPrefix(packed.case_number) || stripProgramPrefix(packed.internal_file_number)
    empty['case.office_case_number'] = formattedCourtNumber(packed) || String(packed.office_case_number || '')
    empty['case.court_number'] = empty['case.office_case_number']
    empty['case.case_year'] = String(packed.case_year || '')
    empty['case.title'] = String(packed.title || '')
    empty['case.court'] = String(packed.court || '')
    empty['case.status'] = printLookupLabel(packed.status)
    empty['case.category'] = String(packed.category || '')
    empty['case.circuit'] = String(packed.circuit || '')
    empty['case.type'] = String(packed.case_type_name || '')
    empty['case.lawyer'] = String(packed.lawyer_name || '')
    empty['case.assistant'] = String(packed.assistant_lawyer_name || '')
    empty['case.filing_date'] = String(packed.filing_date || '').slice(0, 10)
    empty['case.received_date'] = String(packed.received_date || '').slice(0, 10)
    empty['case.notes'] = clip(String(packed.notes || ''))
    empty['case.summary'] = clip(String(packed.summary || ''))
    empty['case.description'] = clip(String(packed.description || ''))
    empty['case.litigation_degree'] = String(packed.litigation_degree || '')
    empty['case.session_place'] = String(packed.session_place || '')
    empty['case.capacity_first'] = String(packed.capacity_first || '')
    empty['case.capacity_appeal'] = String(packed.capacity_appeal || '')
    empty['case.capacity_cassation'] = String(packed.capacity_cassation || '')
    empty['client.capacity'] = String(packed.capacity_first || '')
    empty['opponent.full_name'] = opponents.map((o) => o.full_name).filter(Boolean).join('، ') || String(packed.opponent_name || '')
    empty['opponent.lawyer'] =
      opponents.map((o) => o.lawyer_name).filter(Boolean).join('، ') || String(packed.opponent_lawyer || '')
    empty['opponent.capacity_first'] = String(packed.opponent_capacity_first || opponents[0]?.capacity_first || '')
    empty['opponent.capacity_appeal'] = String(packed.opponent_capacity_appeal || opponents[0]?.capacity_appeal || '')
    empty['opponent.capacity_cassation'] = String(
      packed.opponent_capacity_cassation || opponents[0]?.capacity_cassation || ''
    )
    empty['opponent.phone'] = String(opponents[0]?.phone || packed.opponent_phone || '')
    empty['fees.total'] = money(fees.total_fees)
    empty['fees.paid'] = money(fees.paid)
    empty['fees.remaining'] = money(fees.remaining)
    empty['client.full_name'] = String(packed.client_name || '')
    const today = empty.today
    const upcoming = [...hearings]
      .filter((h) => String(h.hearing_date || '').slice(0, 10) >= today)
      .sort((a, b) => String(a.hearing_date).localeCompare(String(b.hearing_date)))
    const nextH = upcoming[0] || hearings[0]
    empty['hearings.next'] = nextH
      ? [nextH.hearing_date, nextH.hearing_type, nextH.venue, nextH.court_decision].filter(Boolean).join(' — ')
      : ''
    empty['hearings.list'] = listLines(
      hearings.map((h) =>
        [
          String(h.hearing_date || '').slice(0, 10),
          h.hearing_type,
          h.venue,
          printLookupLabel(h.status),
          h.court_decision
        ]
          .filter(Boolean)
          .join(' — ')
      )
    )
    const upcomingTasks = tasks.filter((tk) => !tk.due_date || String(tk.due_date).slice(0, 10) >= today)
    empty['tasks.list'] = listLines(
      tasks.map((tk) =>
        [tk.title, tk.due_date ? String(tk.due_date).slice(0, 10) : '', printLookupLabel(tk.status), tk.venue]
          .filter(Boolean)
          .join(' — ')
      )
    )
    empty['tasks.upcoming'] = listLines(
      upcomingTasks.map((tk) => [tk.title, tk.due_date ? String(tk.due_date).slice(0, 10) : '', tk.venue].filter(Boolean).join(' — '))
    )
    const experts = (packed.expertHearings as {
      expert_name?: string
      expert_office?: string
      floor?: string
      hall?: string
      hearing_date?: string
      hearing_time?: string
      previous_action?: string
      current_action?: string
    }[]) || []
    const latestExpert = experts[0]
    empty['expert.name'] = String(latestExpert?.expert_name || '')
    empty['expert.office'] = String(latestExpert?.expert_office || '')
    empty['expert.floor'] = String(latestExpert?.floor || '')
    empty['expert.hall'] = String(latestExpert?.hall || '')
    empty['expert.datetime'] = [latestExpert?.hearing_date, latestExpert?.hearing_time].filter(Boolean).join(' ')
    empty['expert.previous_action'] = String(latestExpert?.previous_action || '')
    empty['expert.current_action'] = String(latestExpert?.current_action || '')
    empty['experts.list'] = listLines(
      experts.map((ex) =>
        [ex.hearing_date, ex.hearing_time, ex.expert_office, ex.expert_name, ex.floor, ex.hall, ex.current_action]
          .filter(Boolean)
          .join(' — ')
      )
    )
    clientId = clientId || String(packed.client_id || '')
  }
  if (clientId) {
    try {
      const c = getClient(clientId) as Record<string, unknown>
      empty['client.full_name'] = String(c.full_name || empty['client.full_name'])
      empty['client.client_number'] = String(c.client_number || '')
      empty['client.national_id'] = String(c.national_id || '')
      empty['client.phone'] = String(c.phone || c.phone2 || '')
      empty['client.address'] = String(c.address || '')
      empty['client.profession'] = String(c.profession || '')
    } catch {
      /* keep case snapshot */
    }
  }
  return empty
}

export function renderTemplateHtml(id: string, opts: { caseId?: string; clientId?: string; actor?: AuthedUser | null }) {
  const tpl = getPrintTemplate(id)
  const values = buildPrintContext(opts)
  return renderLayoutHtml(tpl.layout, values, officeLogoDataUrl() || undefined, appFontFace(), cairoDateTimeStamp())
}

export async function printTemplate(
  id: string,
  opts: { caseId?: string; clientId?: string; actor?: AuthedUser | null },
  parent?: BrowserWindow | null
) {
  const html = renderTemplateHtml(id, opts)
  await printHtml(html, 'a4', parent)
}

export async function printLayout(
  layout: unknown,
  opts: { caseId?: string; clientId?: string; actor?: AuthedUser | null },
  parent?: BrowserWindow | null
) {
  const values = buildPrintContext(opts)
  const html = renderLayoutHtml(sanitizeLayout(layout), values, officeLogoDataUrl() || undefined, appFontFace(), cairoDateTimeStamp())
  await printHtml(html, 'a4', parent)
}
