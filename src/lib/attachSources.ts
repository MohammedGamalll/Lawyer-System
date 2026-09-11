export const ATTACH_SOURCES = ['scanner', 'camera', 'file'] as const
export type AttachSource = (typeof ATTACH_SOURCES)[number]

export function parseSourceOrder(raw?: string | null): AttachSource[] {
  const allowed = new Set<string>(ATTACH_SOURCES)
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AttachSource => allowed.has(s))
  const missing = ATTACH_SOURCES.filter((s) => !parts.includes(s))
  return [...parts, ...missing]
}

export function serializeSourceOrder(order: AttachSource[]) {
  return parseSourceOrder(order.join(',')).join(',')
}
