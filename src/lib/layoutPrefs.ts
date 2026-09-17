import { NAV_ITEMS } from '@shared/permissions'

export const DASHBOARD_SECTION_IDS = ['actions', 'stats', 'charts', 'hearings'] as const
export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number]

function parseIdList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  const s = String(raw ?? '').trim()
  if (!s) return []
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return s.split(',').map((x) => x.trim()).filter(Boolean)
  }
}

export function orderedIds(raw: unknown, fallback: readonly string[]): string[] {
  const wanted = parseIdList(raw)
  if (!wanted.length) return [...fallback]
  const remain = new Set(fallback)
  const out: string[] = []
  for (const id of wanted) {
    if (!remain.has(id)) continue
    out.push(id)
    remain.delete(id)
  }
  for (const id of fallback) if (remain.has(id)) out.push(id)
  return out
}

export function orderedNavItems(raw?: unknown) {
  const ids = orderedIds(
    raw,
    NAV_ITEMS.map((n) => n.id)
  )
  const map = new Map(NAV_ITEMS.map((n) => [n.id, n]))
  return ids.map((id) => map.get(id)).filter(Boolean) as typeof NAV_ITEMS
}

export function orderedDashboardSections(raw?: unknown): DashboardSectionId[] {
  return orderedIds(raw, DASHBOARD_SECTION_IDS) as DashboardSectionId[]
}

export function serializeIdList(ids: string[]): string {
  return JSON.stringify(ids)
}
