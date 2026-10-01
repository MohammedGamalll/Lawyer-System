import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Input, Textarea } from './ui'
import { cn } from '../lib/utils'
import { onDataChanged } from '../lib/bus'
import { FloatingMenu } from './FloatingMenu'
import { arabicFold } from '@shared/arabic'

export function lookupLabel(kind: string, value: string, t: (k: string, opts?: Record<string, string>) => string): string {
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
    const typedPay = t(key)
    if (typedPay !== key) return typedPay
  }
  const statusKey = `status.${value}`
  const status = t(statusKey)
  if (status !== statusKey) return status
  const typeKey = `types.${value}`
  const typed = t(typeKey)
  if (typed !== typeKey) return typed
  return value
}

export function LookupCombo({
  kind,
  value,
  onChange,
  placeholder,
  className,
  style,
  id,
  multiline
}: {
  kind: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  id?: string
  multiline?: boolean
}) {
  const { t } = useTranslation()
  const [opts, setOpts] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [openedByPointer, setOpenedByPointer] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const uid = useId().replace(/:/g, '')
  const listId = `lookup-${kind}-${uid}`
  const inputId = id || `lookup-input-${kind}-${uid}`
  const focusInput = () => {
    if (multiline) areaRef.current?.focus()
    else inputRef.current?.focus()
  }
  const openMenu = (fromPointer = false) => {
    setOpenedByPointer(fromPointer)
    setOpen(true)
    focusInput()
  }

  const load = () => {
    invoke<{ value: string }[]>('lookups:list', kind)
      .then((rows) => setOpts(rows.map((r) => r.value)))
      .catch(() => undefined)
  }
  useEffect(() => {
    load()
  }, [kind])
  useEffect(() => onDataChanged(() => load(), 'lookups'), [kind])
  useEffect(() => {
    const n = box.current
    if (!n) return
    const onLabel = () => openMenu(true)
    n.addEventListener('open-on-label', onLabel)
    return () => n.removeEventListener('open-on-label', onLabel)
  }, [])

  const remember = (v: string) => {
    const tval = v.trim()
    if (!tval) return
    invoke('lookups:remember', kind, tval).catch(() => undefined)
    load()
  }
  const remove = async (v: string) => {
    if (!window.confirm(t('lookups.confirmRemove', { value: v }))) return
    await invoke('lookups:remove', kind, v)
    setOpts((prev) => prev.filter((x) => x !== v))
    if (value === v) onChange('')
  }
  const display = lookupLabel(kind, value, t)
  const selectedKnown = opts.some((o) => o === value)
  const typed = value.trim()
  const shouldFilter = typed.length >= 2 && !selectedKnown && !openedByPointer
  const filtered = (
    shouldFilter
      ? opts.filter(
          (o) =>
            arabicFold(o).includes(arabicFold(value)) ||
            arabicFold(lookupLabel(kind, o, t)).includes(arabicFold(value))
        )
      : opts
  ).slice(0, 80)

  useEffect(() => {
    setHi(0)
  }, [shouldFilter, value, open])

  const pick = (o: string) => {
    onChange(o)
    remember(o)
    setOpen(false)
    setOpenedByPointer(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHi((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHi((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && open && filtered[hi]) {
      e.preventDefault()
      pick(filtered[hi])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const fieldClass = cn('w-full', value.trim() ? 'pe-8' : '')
  const fieldProps = {
    id: inputId,
    value: display,
    autoComplete: 'off' as const,
    'aria-controls': listId,
    'aria-expanded': open,
    placeholder,
    className: fieldClass,
    style,
    onFocus: () => openMenu(false),
    onClick: () => openMenu(true),
    onPointerDown: () => openMenu(true),
    onKeyDown,
    onChange: (e: { target: { value: string } }) => {
      const next = e.target.value
      const match = opts.find((o) => lookupLabel(kind, o, t) === next || o === next)
      setOpenedByPointer(false)
      onChange(match ?? next)
      setOpen(true)
    },
    onBlur: () => remember(value)
  }

  return (
    <div ref={box} data-open-on-label className={cn('relative', className)}>
      {multiline ? <Textarea ref={areaRef} rows={3} {...fieldProps} /> : <Input ref={inputRef} {...fieldProps} />}
      {value.trim() ? (
        <button
          type="button"
          className={cn(
            'absolute end-1 z-[1] flex h-7 w-7 items-center justify-center rounded text-navy-400 hover:bg-navy-50 hover:text-navy-800 dark:hover:bg-navy-800',
            multiline ? 'top-2' : 'top-1/2 -translate-y-1/2'
          )}
          title={t('clearField')}
          aria-label={t('clearField')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
            setOpen(true)
            focusInput()
          }}
        >
          ×
        </button>
      ) : null}
      <FloatingMenu open={open} onClose={() => setOpen(false)} anchor={box} minWidth={220}>
        <div id={listId} className="max-h-64 overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 && <div className="px-2 py-2 text-center text-xs text-navy-400">{t('noData')}</div>}
          {filtered.map((o, i) => (
            <div
              key={o}
              className={cn('flex items-center gap-1 rounded hover:bg-navy-50 dark:hover:bg-navy-800', i === hi && 'bg-gold-50')}
            >
              <button
                type="button"
                className="h-7 w-7 shrink-0 text-navy-400 hover:text-navy-800"
                title={t('moveUp')}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  invoke('lookups:reorder', kind, o, 'up')
                    .then(() => load())
                    .catch(() => undefined)
                }}
              >
                ▲
              </button>
              <button
                type="button"
                className="h-7 w-7 shrink-0 text-navy-400 hover:text-navy-800"
                title={t('moveDown')}
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  invoke('lookups:reorder', kind, o, 'down')
                    .then(() => load())
                    .catch(() => undefined)
                }}
              >
                ▼
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-1.5 text-right text-sm"
                onMouseDown={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  pick(o)
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
