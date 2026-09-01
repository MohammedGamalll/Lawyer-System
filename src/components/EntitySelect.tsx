import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchLookup, type LookupKind, type LookupOption } from '../lib/lookups'
import { cn } from '../lib/utils'
import { invoke } from '../lib/api'
import { onDataChanged } from '../lib/bus'
import { FloatingMenu } from './FloatingMenu'
import { useDebouncedValue } from '../lib/useDebouncedValue'

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
  const dq = useDebouncedValue(q, 300)
  const [opts, setOpts] = useState<LookupOption[]>([])
  const [missingLabel, setMissingLabel] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const load = (search?: string) => {
    fetchLookup(kind, { client_id: clientId, search })
      .then(setOpts)
      .catch(() => setOpts([]))
  }
  useEffect(() => {
    if (!open) return
    load(dq)
  }, [open, kind, clientId, dq])
  useEffect(() => onDataChanged(() => open && load(dq)), [kind, clientId, open, dq])

  useEffect(() => {
    const id = String(value ?? '')
    if (!id) {
      setMissingLabel('')
      return
    }
    if (opts.some((o) => String(o.value) === id)) {
      setMissingLabel('')
      return
    }
    const channel =
      kind === 'clients' ? 'clients:get' : kind === 'opponents' ? 'opponents:get' : kind === 'cases' ? 'cases:get' : ''
    if (!channel) return
    invoke<Record<string, unknown>>(channel, id)
      .then((row) => {
        const rec = (row.opponent as Record<string, unknown> | undefined) || row
        const code = String(rec.client_number ?? rec.case_number ?? '')
        const name = String(rec.full_name ?? rec.title ?? '')
        setMissingLabel(code ? `${code} — ${name}` : name)
      })
      .catch(() => setMissingLabel(''))
  }, [kind, value, opts])

  const selected = opts.find((o) => String(o.value) === String(value ?? ''))
  const display = selected?.label || missingLabel
  const filtered = useMemo(() => {
    const excluded = new Set((excludeIds ?? []).map((x) => String(x)))
    return opts.filter((o) => !excluded.has(String(o.value)))
  }, [opts, excludeIds])

  return (
    <div ref={box} className={cn('relative', className)}>
      <button
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-navy-200 bg-white px-3 text-sm text-navy-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-navy-900 dark:border-navy-700 dark:text-navy-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={display ? '' : 'text-navy-400'}>{display || t('pickFromList')}</span>
        <span className="text-navy-400">▾</span>
      </button>
      <FloatingMenu open={open} onClose={() => setOpen(false)} anchor={box} minWidth={240}>
        <div className="p-1">
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
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.stopPropagation()
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
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
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
      </FloatingMenu>
    </div>
  )
}
