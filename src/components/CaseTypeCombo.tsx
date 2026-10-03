import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { Input } from './ui'
import { cn } from '../lib/utils'
import { onDataChanged } from '../lib/bus'
import { FloatingMenu } from './FloatingMenu'
import { arabicFold } from '@shared/arabic'
import { useApp } from '../store'

type CaseTypeRow = { id: string; name_ar: string }

export function CaseTypeCombo({
  value,
  onChange,
  className,
  id
}: {
  value: string
  onChange: (id: string) => void
  className?: string
  id?: string
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [opts, setOpts] = useState<CaseTypeRow[]>([])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [openedByPointer, setOpenedByPointer] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const uid = useId().replace(/:/g, '')
  const inputId = id || `case-type-${uid}`
  const listId = `case-type-list-${uid}`

  const load = () => {
    invoke<CaseTypeRow[]>('caseTypes:list')
      .then(setOpts)
      .catch(() => undefined)
  }
  useEffect(() => {
    load()
  }, [])
  useEffect(() => onDataChanged(() => load(), 'caseTypes'), [])

  const selected = opts.find((o) => o.id === value)
  useEffect(() => {
    if (selected) setText(selected.name_ar)
    else if (!value) setText('')
  }, [value, selected?.name_ar])

  const openMenu = (fromPointer = false) => {
    setOpenedByPointer(fromPointer)
    setOpen(true)
    inputRef.current?.focus()
  }
  useEffect(() => {
    const n = box.current
    if (!n) return
    const fn = () => openMenu(true)
    n.addEventListener('open-on-label', fn)
    return () => n.removeEventListener('open-on-label', fn)
  }, [])

  const typed = text.trim()
  const shouldFilter = typed.length >= 2 && !openedByPointer && (!selected || arabicFold(selected.name_ar) !== arabicFold(typed))
  const filtered = (
    shouldFilter ? opts.filter((o) => arabicFold(o.name_ar).includes(arabicFold(typed))) : opts
  ).slice(0, 80)

  useEffect(() => {
    setHi(0)
  }, [typed, open, shouldFilter])

  const pick = (row: CaseTypeRow) => {
    setText(row.name_ar)
    onChange(row.id)
    setOpen(false)
    setOpenedByPointer(false)
  }

  const commit = async () => {
    const name = text.trim()
    if (!name) {
      onChange('')
      return
    }
    const hit = opts.find((o) => arabicFold(o.name_ar) === arabicFold(name))
    if (hit) {
      setText(hit.name_ar)
      onChange(hit.id)
      return
    }
    try {
      const created = await invoke<{ id: string }>('caseTypes:findOrCreate', name)
      setText(name)
      onChange(created.id)
      load()
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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

  return (
    <div ref={box} data-open-on-label className={cn('relative', className)}>
      <Input
        ref={inputRef}
        id={inputId}
        value={text}
        autoComplete="off"
        aria-controls={listId}
        aria-expanded={open}
        className={cn('w-full', text.trim() ? 'pe-8' : '')}
        onFocus={() => openMenu(false)}
        onClick={() => openMenu(true)}
        onPointerDown={() => openMenu(true)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setOpenedByPointer(false)
          setText(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          void commit()
        }}
      />
      {text.trim() ? (
        <button
          type="button"
          className="absolute end-1 top-1/2 z-[1] flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-navy-400 hover:bg-navy-50 hover:text-navy-800 dark:hover:bg-navy-800"
          title={t('clearField')}
          aria-label={t('clearField')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation()
            setText('')
            onChange('')
            setOpen(true)
            inputRef.current?.focus()
          }}
        >
          ×
        </button>
      ) : null}
      <FloatingMenu open={open} onClose={() => setOpen(false)} anchor={box} minWidth={220}>
        <div id={listId} className="max-h-64 overflow-y-auto overscroll-contain" onWheel={(e) => e.stopPropagation()}>
          {filtered.length === 0 && <div className="px-2 py-2 text-center text-xs text-navy-400">{t('noData')}</div>}
          {filtered.map((o, i) => (
            <button
              key={o.id}
              type="button"
              className={cn(
                'block w-full px-2 py-1.5 text-right text-base hover:bg-navy-50 dark:hover:bg-navy-800',
                i === hi && 'bg-gold-50',
                o.id === value && 'font-semibold'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.stopPropagation()
                pick(o)
              }}
            >
              {o.name_ar}
            </button>
          ))}
        </div>
      </FloatingMenu>
    </div>
  )
}
