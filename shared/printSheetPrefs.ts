export type SheetFontSize = 'sm' | 'md' | 'lg'

export const SHEET_HIDE_COLS = ['court', 'type', 'client', 'opponent', 'previous'] as const
export type SheetHideCol = (typeof SHEET_HIDE_COLS)[number]

export const PRINT_INK: Record<'navy' | 'black' | 'gold', string> = {
  navy: '#122f4d',
  black: '#111111',
  gold: '#c9a227'
}

export function parseSheetFontSize(raw: unknown): SheetFontSize {
  const v = String(raw || '').trim()
  if (v === 'sm' || v === 'lg') return v
  return 'md'
}

export function parseSheetHideCols(raw: unknown): SheetHideCol[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) list = raw
  else {
    const s = String(raw || '').trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) list = parsed
      else list = s.split(',')
    } catch {
      list = s.split(',')
    }
  }
  const allowed = new Set<string>(SHEET_HIDE_COLS)
  const out: SheetHideCol[] = []
  for (const item of list) {
    const id = String(item || '').trim() as SheetHideCol
    if (allowed.has(id) && !out.includes(id)) out.push(id)
  }
  return out
}

export function sheetTableFonts(size: SheetFontSize) {
  if (size === 'sm') return { td: '11px', th: '12px' }
  if (size === 'lg') return { td: '15px', th: '16px' }
  return { td: '13px', th: '14px' }
}
