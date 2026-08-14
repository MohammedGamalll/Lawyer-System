import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchLookup, type LookupKind, type LookupOption } from '../lib/lookups'
import { cn } from '../lib/utils'

export function EntitySelect({
  kind,
  value,
  onChange,
  clientId,
  excludeIds,
  className
}: {
  kind: LookupKind
  value?: string | number
  onChange: (v: string) => void
  clientId?: string | number
  excludeIds?: Array<string | number>
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState<LookupOption[]>([])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchLookup(kind, clientId ? { client_id: clientId } : undefined)
      .then(setOpts)
      .catch(() => setOpts([]))
  }, [kind, clientId])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const selected = opts.find((o) => String(o.value) === String(value ?? ''))
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const excluded = new Set((excludeIds ?? []).map((x) => String(x)))
    const base = opts.filter((o) => !excluded.has(String(o.value)))
    if (!s) return base.slice(0, 80)
    return base.filter((o) => o.label.toLowerCase().includes(s)).slice(0, 80)
  }, [opts, q, excludeIds])

  return (
    <div ref={box} className={cn('relative', className)}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-navy-200 bg-white px-3 text-sm text-navy-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-navy-900 dark:border-navy-700 dark:text-navy-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selected ? '' : 'text-navy-400'}>{selected?.label || t('pickFromList')}</span>
        <span className="text-navy-400">▾</span>
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-md border border-navy-200 bg-white p-2 shadow-xl dark:bg-navy-900 dark:border-navy-700"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="mb-2 h-8 w-full rounded border border-navy-200 px-2 text-sm outline-none focus:ring-2 focus:ring-gold-400 dark:bg-navy-950 dark:border-navy-700"
            placeholder={t('typeToFilter')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="max-h-56 overflow-auto">
            <button
              type="button"
              className="block w-full px-2 py-1.5 text-right text-sm text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-800"
              onClick={() => {
                onChange('')
                setOpen(false)
                setQ('')
              }}
            >
              —
            </button>
            {filtered.length === 0 && <div className="px-2 py-3 text-center text-xs text-navy-400">{t('noData')}</div>}
            {filtered.map((o) => (
              <button
                type="button"
                key={String(o.value)}
                className={cn(
                  'block w-full px-2 py-1.5 text-right text-sm hover:bg-navy-50 dark:hover:bg-navy-800',
                  String(o.value) === String(value) && 'bg-gold-50 font-semibold'
                )}
                onClick={() => {
                  onChange(String(o.value))
                  setOpen(false)
                  setQ('')
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
