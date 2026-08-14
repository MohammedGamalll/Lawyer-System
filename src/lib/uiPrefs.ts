export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 28
export const FONT_SIZE_DEFAULT = 16

export function clampFontSize(n: number) {
  if (!Number.isFinite(n)) return FONT_SIZE_DEFAULT
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)))
}

export function applyFontSize(px: number) {
  const n = clampFontSize(px)
  document.documentElement.style.fontSize = `${n}px`
  document.documentElement.style.setProperty('--app-font-size', `${n}px`)
}
