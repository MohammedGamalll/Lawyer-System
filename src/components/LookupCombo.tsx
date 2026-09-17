import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Input } from './ui'
import { cn } from '../lib/utils'
import { onDataChanged } from '../lib/bus'
import { FloatingMenu } from './FloatingMenu'
import { arabicFold } from '@shared/arabic'

function lookupLabel(kind: string, value: string, t: (k: string) => string): string {
  if (
    kind === 'task_status' ||
    kind === 'link_type' ||
    kind === 'case_status' ||
    kind === 'hearing_status' ||
    kind === 'poa_status' ||
    kind === 'contract_status' ||
    kind === 'staff_status'
  ) {
    const key = `status.${value}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  if (kind === 'payment_type') {
    const key = `types.${value}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  return value
}

export function LookupCombo({
  kind,
  value,
  onChange,
  placeholder,
  className,
  style
}: {
  kind: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
}) {
  const { t } = useTranslation()
  const [opts, setOpts] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const listId = `lookup-${kind}-${useId().replace(/:/g, '')}`

  const load = () => {
    invoke<{ value: string }[]>('lookups:list', kind)
      .then((rows) => setOpts(rows.map((r) => r.value)))
      .catch(() => undefined)
  }
  useEffect(() => {
    load()
  }, [kind])
  useEffect(() => onDataChanged(() => load(), 'lookups'), [kind])

  const remember = (v: string) => {
    const tval = v.trim()
    if (!tval) return
    invoke('lookups:remember', kind, tval).catch(() => undefined)
    setOpts((prev) => (prev.includes(tval) ? prev : [...prev, tval].sort((a, b) => a.localeCompare(b, 'ar'))))
  }
  const remove = async (v: string) => {
    if (!window.confirm(t('lookups.confirmRemove', { value: v }))) return
    await invoke('lookups:remove', kind, v)
    setOpts((prev) => prev.filter((x) => x !== v))
    if (value === v) onChange('')
  }
  const filtered = opts
    .filter(
      (o) =>
        !value.trim() ||
        arabicFold(o).includes(arabicFold(value)) ||
        arabicFold(lookupLabel(kind, o, t)).includes(arabicFold(value))
    )
    .slice(0, 80)

  return (
    <div ref={box} className={cn('relative', className)}>
      <Input
        value={value}
        autoComplete="off"
        aria-controls={listId}
        placeholder={placeholder}
        className="w-full"
        style={style}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onBlur={() => remember(value)}
      />
      <FloatingMenu open={open} onClose={() => setOpen(false)} anchor={box} minWidth={220}>
        <div id={listId} className="max-h-64 overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 && <div className="px-2 py-2 text-center text-xs text-navy-400">{t('noData')}</div>}
          {filtered.map((o) => (
            <div key={o} className="flex items-center gap-1 rounded hover:bg-navy-50 dark:hover:bg-navy-800">
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-1.5 text-right text-sm"
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onChange(o)
                  remember(o)
                  setOpen(false)
                }}
              >
                {lookupLabel(kind, o, t)}
              </button>
              <button
                type="button"
                className="h-7 w-7 shrink-0 text-navy-400 hover:text-red-600"
                title={t('delete')}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  void remove(o)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </FloatingMenu>
    </div>
  )
}
