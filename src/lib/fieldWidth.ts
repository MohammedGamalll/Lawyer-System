export function defaultWidthCh(opts: {
  type?: string
  size?: 'sm' | 'xs'
  widthCh?: number
  lookup?: string
  name?: string
}): number {
  if (opts.widthCh) return opts.widthCh
  if (opts.size === 'xs') return 8
  if (opts.size === 'sm') return 12
  if (opts.lookup) return 22
  const name = opts.name || ''
  if (/_year$/.test(name) || name === 'case_year' || name === 'poa_year') return 8
  if (/phone|whatsapp|national_id|tax_id|bar_number/.test(name)) return 16
  if (/email|address|full_name/.test(name)) return 28
  switch (opts.type) {
    case 'date':
    case 'time':
      return 18
    case 'datetime-local':
      return 22
    case 'number':
      return 12
    case 'select':
    case 'combo':
      return 18
    default:
      return 22
  }
}
