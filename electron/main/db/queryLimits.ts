export function clampPageSize(n?: number, kind: 'list' | 'lookup' | 'print' = 'list'): number {
  const max = kind === 'lookup' ? 40 : 1000
  const fallback = kind === 'lookup' ? 40 : 50
  const v = Number(n ?? fallback)
  if (!Number.isFinite(v) || v < 1) return fallback
  return Math.min(Math.floor(v), max)
}

export function applyColumnFilters(
  where: string,
  params: unknown[],
  columnFilters: Record<string, unknown> | undefined,
  columns: Record<string, string>,
  skip: Iterable<string> = []
): string {
  if (!columnFilters) return where
  const skipped = new Set(skip)
  for (const [key, raw] of Object.entries(columnFilters)) {
    if (skipped.has(key)) continue
    const s = String(raw ?? '').trim()
    if (!s) continue
    const expr = columns[key]
    if (!expr) continue
    where += ` AND IFNULL(CAST(${expr} AS TEXT), '') LIKE ?`
    params.push(`%${s}%`)
  }
  return where
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

const CODE_PREFIXES = ['CS-', 'cs-', 'CL-', 'PAY-', 'EXP-', 'INV-', 'POA-', 'CNT-', 'COR-', 'RCP-', 'VCH-'] as const

export function stripPrefixedCodeSql(expr: string): string {
  let inner = `IFNULL(CAST(${expr} AS TEXT), '')`
  for (const prefix of CODE_PREFIXES) inner = `REPLACE(${inner}, '${prefix}', '')`
  return inner
}

export function programCodeSortSql(expr: string): string {
  return `CAST(${stripPrefixedCodeSql(expr)} AS INTEGER)`
}

export function courtNumberSortSql(alias: string): string {
  return `CAST(CASE
    WHEN IFNULL(${alias}.first_instance_number,'') != '' THEN ${alias}.first_instance_number
    WHEN IFNULL(${alias}.office_case_number,'') != '' THEN ${alias}.office_case_number
    WHEN IFNULL(${alias}.appeal_number,'') != '' THEN ${alias}.appeal_number
    ELSE ${alias}.cassation_number
  END AS INTEGER)`
}

export function orderBySql(
  sortBy: string | undefined,
  sortDir: string | undefined,
  allowed: Record<string, string>,
  fallback: string
): string {
  if (!sortBy) return fallback
  const expr = allowed[sortBy]
  if (!expr) return fallback
  return `${expr} ${sqlDir(sortDir)}`
}

export function includeIds(query: { includeIds?: unknown }): string[] {
  const raw = query.includeIds
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const id = String(item || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= 20) break
  }
  return out
}

export function pickSort(sortBy: string | undefined, allowed: Record<string, string>, fallback: string): string {
  if (!sortBy) return fallback
  return allowed[sortBy] || fallback
}
