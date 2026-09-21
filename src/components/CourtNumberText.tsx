import { formatCourtNumber } from '../lib/courtNumber'
import { cn } from '../lib/utils'

export function CourtNumberText({
  row,
  className
}: {
  row: Record<string, unknown>
  className?: string
}) {
  const text = formatCourtNumber(row)
  if (!text || text === '—') return <span className={className}>—</span>
  return (
    <span className={cn('court-number', className)} dir="rtl">
      {text}
    </span>
  )
}
