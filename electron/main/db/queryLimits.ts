export function clampPageSize(n?: number, kind: 'list' | 'lookup' | 'print' = 'list'): number {
  const max = kind === 'print' ? 1000 : kind === 'lookup' ? 40 : 100
  const fallback = kind === 'lookup' ? 40 : 50
  const v = Number(n ?? fallback)
  if (!Number.isFinite(v) || v < 1) return fallback
  return Math.min(Math.floor(v), max)
}

export function pageKind(query: { print?: boolean; lookup?: boolean; pageSize?: number }): 'list' | 'lookup' | 'print' {
  if (query.print) return 'print'
  if (query.lookup) return 'lookup'
  if (Number(query.pageSize) === 40) return 'lookup'
  return 'list'
}

export function sqlDir(dir?: string): 'ASC' | 'DESC' {
  return String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC'
}

export function pickSort(sortBy: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sortBy) return fallback
  return allowed[sortBy] || fallback
}
