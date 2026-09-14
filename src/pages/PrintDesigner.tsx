import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Card, Field, Input, Select } from '../components/ui'
import {
  PAGE_H,
  PAGE_W,
  PRINT_FIELD_GROUPS,
  defaultCaseLayout,
  sanitizeLayout,
  type PrintAlign,
  type PrintBlock,
  type PrintFieldKey,
  type PrintLayout,
  type PrintVAlign
} from '@shared/printTemplate'

const SCALE = 2.2

function nid() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

type TemplateRow = { id: string; name: string; layout_json?: string }

export function PrintDesigner() {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [list, setList] = useState<TemplateRow[]>([])
  const [sel, setSel] = useState('')
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<PrintLayout>(defaultCaseLayout())
  const [active, setActive] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [caseId, setCaseId] = useState('')
  const [cases, setCases] = useState<{ id: string; case_number: string; title: string }[]>([])
  const drag = useRef<{
    id: string
    mode: 'move' | 'resize'
    dx: number
    dy: number
    startW: number
    startH: number
    startX: number
    startY: number
  } | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const loadList = async (prefer?: string) => {
    const rows = await invoke<TemplateRow[]>('printTemplates:list')
    setList(rows)
    const id = prefer || sel || rows[0]?.id || ''
    if (id) await loadOne(id, rows)
  }

  const loadOne = async (id: string, rows?: TemplateRow[]) => {
    const tpl = await invoke<{ id: string; name: string; layout: PrintLayout }>('printTemplates:get', id)
    setSel(id)
    setName(tpl.name)
    setLayout(sanitizeLayout(tpl.layout))
    setActive(null)
    void rows
  }

  useEffect(() => {
    loadList().catch((e) => toast((e as Error).message, 'err'))
    invoke<{ rows: { id: string; case_number: string; title: string }[] }>('cases:list', { page: 1, pageSize: 25, lookup: true })
      .then((r) => setCases(r.rows || []))
      .catch(() => undefined)
    invoke<Record<string, string>>('printTemplates:context', {})
      .then(setValues)
      .catch(() => undefined)
  }, [])

  const block = layout.blocks.find((b) => b.id === active) || null

  const setBlocks = (blocks: PrintBlock[]) => setLayout({ page: 'A4', blocks })

  const patch = (id: string, part: Partial<PrintBlock>) => {
    setBlocks(layout.blocks.map((b) => (b.id === id ? { ...b, ...part } : b)))
  }

  const addField = (bind: PrintFieldKey) => {
    const y = Math.min(
      PAGE_H - 18,
      layout.blocks.reduce((m, b) => Math.max(m, b.y + b.h), 8) + 3
    )
    const next: PrintBlock = {
      id: nid(),
      kind: bind === 'office.logo' ? 'logo' : bind === 'custom' ? 'text' : 'field',
      x: 12,
      y,
      w: bind === 'office.logo' ? 36 : 186,
      h: bind === 'office.logo' ? 22 : bind === 'hearings.list' || bind === 'tasks.list' ? 28 : 14,
      title: t(`printDesigner.field.${bind}`),
      bind,
      text: '',
      fontSize: 12,
      align: 'right',
      vAlign: 'top'
    }
    setBlocks([...layout.blocks, next])
    setActive(next.id)
  }

  const addSection = () => {
    const next: PrintBlock = {
      id: nid(),
      kind: 'section',
      x: 10,
      y: 40,
      w: 190,
      h: 36,
      title: t('printDesigner.newSection'),
      bind: 'custom',
      text: '',
      fontSize: 13,
      align: 'right',
      vAlign: 'top'
    }
    setBlocks([...layout.blocks, next])
    setActive(next.id)
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>, b: PrintBlock, mode: 'move' | 'resize') => {
    e.preventDefault()
    e.stopPropagation()
    setActive(b.id)
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = {
      id: b.id,
      mode,
      dx: (e.clientX - rect.left) / SCALE - b.x,
      dy: (e.clientY - rect.top) / SCALE - b.y,
      startW: b.w,
      startH: b.h,
      startX: b.x,
      startY: b.y
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current) return
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    const d = drag.current
    if (d.mode === 'resize') {
      const mx = (e.clientX - rect.left) / SCALE
      const my = (e.clientY - rect.top) / SCALE
      const w = Math.min(PAGE_W - d.startX, Math.max(8, mx - d.startX))
      const h = Math.min(PAGE_H - d.startY, Math.max(6, my - d.startY))
      patch(d.id, { w, h })
      return
    }
    const x = Math.min(PAGE_W - 8, Math.max(0, (e.clientX - rect.left) / SCALE - d.dx))
    const y = Math.min(PAGE_H - 8, Math.max(0, (e.clientY - rect.top) / SCALE - d.dy))
    patch(d.id, { x, y })
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const save = async () => {
    try {
      const clean = sanitizeLayout(layout)
      if (sel) await invoke('printTemplates:update', sel, { name, layout: clean })
      else {
        const r = await invoke<{ id: string }>('printTemplates:create', { name, layout: clean })
        setSel(r.id)
      }
      toast(t('savedOk'))
      await loadList(sel)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const createNew = async () => {
    try {
      const r = await invoke<{ id: string }>('printTemplates:create', {
        name: t('printDesigner.newTemplate'),
        layout: defaultCaseLayout()
      })
      toast(t('savedOk'))
      await loadList(r.id)
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const remove = async () => {
    if (!sel) return
    try {
      await invoke('printTemplates:remove', sel)
      setSel('')
      await loadList()
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const printNow = async () => {
    try {
      const clean = sanitizeLayout(layout)
      if (sel) await invoke('printTemplates:update', sel, { name, layout: clean })
      else {
        const r = await invoke<{ id: string }>('printTemplates:create', { name, layout: clean })
        setSel(r.id)
      }
      await invoke('printTemplates:printLayout', clean, { caseId: caseId || undefined })
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }

  const loadContext = async (id: string) => {
    setCaseId(id)
    const ctx = await invoke<Record<string, string>>('printTemplates:context', id ? { caseId: id } : {})
    setValues(ctx)
  }

  const display = (b: PrintBlock) => {
    if (b.kind === 'section') return b.title
    if (b.kind === 'text' || b.bind === 'custom') return b.text || b.title
    if (b.kind === 'logo') return t('printDesigner.field.office.logo')
    const val = values[b.bind] || ''
    return b.title ? `${b.title}: ${val || '—'}` : val || '—'
  }

  const groups = useMemo(() => PRINT_FIELD_GROUPS, [])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t('printDesigner.template')}>
          <Select
            value={sel}
            onChange={(e) => {
              const id = e.target.value
              if (id) void loadOne(id)
            }}
          >
            {list.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('printDesigner.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('printDesigner.sampleCase')}>
          <Select value={caseId} onChange={(e) => void loadContext(e.target.value)}>
            <option value="">{t('printDesigner.officeOnly')}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.case_number} — {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="button" onClick={() => void save()}>
          {t('save')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void createNew()}>
          {t('add')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void printNow()}>
          {t('print')}
        </Button>
        <Button type="button" variant="danger" onClick={() => void remove()}>
          {t('delete')}
        </Button>
      </div>
      <p className="text-xs text-navy-500">{t('printDesigner.hint')}</p>
      <div className="flex flex-wrap items-start gap-3">
        <Card className="w-56 shrink-0 space-y-2 p-2">
          <div className="text-sm font-bold">{t('printDesigner.fields')}</div>
          <Button type="button" variant="outline" className="w-full" onClick={addSection}>
            {t('printDesigner.addSection')}
          </Button>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="mb-1 text-[11px] font-semibold text-navy-500">{t(`printDesigner.group.${g.id}`)}</div>
              <div className="flex flex-col gap-1">
                {g.keys.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="rounded border border-navy-100 px-2 py-1 text-start text-xs hover:bg-navy-50 dark:border-navy-700 dark:hover:bg-navy-800"
                    onClick={() => addField(k)}
                  >
                    {t(`printDesigner.field.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <div
          ref={pageRef}
          className="relative shrink-0 overflow-hidden border border-navy-200 bg-white shadow dark:border-navy-700"
          style={{ width: PAGE_W * SCALE, height: PAGE_H * SCALE }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={() => setActive(null)}
        >
          {layout.blocks.map((b) => (
            <div
              key={b.id}
              className={`absolute overflow-hidden rounded-sm border ${
                active === b.id ? 'border-gold-400 bg-gold-50/40' : b.kind === 'section' ? 'border-navy-300 bg-navy-50/40' : 'border-dashed border-navy-200'
              }`}
              style={{
                left: b.x * SCALE,
                top: b.y * SCALE,
                width: b.w * SCALE,
                height: b.h * SCALE,
                fontSize: b.fontSize * 0.9,
                textAlign: b.align,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: b.vAlign === 'middle' ? 'center' : b.vAlign === 'bottom' ? 'flex-end' : 'flex-start',
                whiteSpace: 'pre-wrap'
              }}
              onPointerDown={(e) => onPointerDown(e, b, 'move')}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onClick={(e) => {
                e.stopPropagation()
                setActive(b.id)
              }}
            >
              <div className="inner w-full cursor-move px-1 py-0.5 leading-tight text-navy-900">{display(b)}</div>
              <span
                className="absolute bottom-0 end-0 h-3 w-3 cursor-nwse-resize bg-gold-400"
                onPointerDown={(e) => onPointerDown(e, b, 'resize')}
              />
            </div>
          ))}
        </div>
        <Card className="min-w-[14rem] flex-1 space-y-2 p-3">
          <div className="text-sm font-bold">{t('printDesigner.selected')}</div>
          {block ? (
            <>
              <Field label={t('printDesigner.title')}>
                <Input value={block.title} onChange={(e) => patch(block.id, { title: e.target.value })} />
              </Field>
              {block.kind === 'text' || block.bind === 'custom' ? (
                <Field label={t('printDesigner.freeText')}>
                  <Input value={block.text} onChange={(e) => patch(block.id, { text: e.target.value })} />
                </Field>
              ) : null}
              <Field label={t('printDesigner.fontSize')}>
                <Input
                  type="number"
                  value={block.fontSize}
                  onChange={(e) => patch(block.id, { fontSize: Number(e.target.value) })}
                />
              </Field>
              <Field label={t('printDesigner.align')}>
                <Select value={block.align} onChange={(e) => patch(block.id, { align: e.target.value as PrintAlign })}>
                  <option value="right">{t('printDesigner.right')}</option>
                  <option value="center">{t('printDesigner.center')}</option>
                  <option value="left">{t('printDesigner.left')}</option>
                </Select>
              </Field>
              <Field label={t('printDesigner.vAlign')}>
                <Select value={block.vAlign || 'top'} onChange={(e) => patch(block.id, { vAlign: e.target.value as PrintVAlign })}>
                  <option value="top">{t('printDesigner.top')}</option>
                  <option value="middle">{t('printDesigner.middle')}</option>
                  <option value="bottom">{t('printDesigner.bottom')}</option>
                </Select>
              </Field>
              <Field label={t('printDesigner.snap')}>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => patch(block.id, { x: Math.max(0, PAGE_W - block.w - 10) })}>
                    {t('printDesigner.right')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => patch(block.id, { x: Math.max(0, (PAGE_W - block.w) / 2) })}
                  >
                    {t('printDesigner.center')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => patch(block.id, { x: 10 })}>
                    {t('printDesigner.left')}
                  </Button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <Field key={k} label={k}>
                    <Input
                      type="number"
                      value={Math.round(block[k])}
                      onChange={(e) => patch(block.id, { [k]: Number(e.target.value) })}
                    />
                  </Field>
                ))}
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  setBlocks(layout.blocks.filter((b) => b.id !== block.id))
                  setActive(null)
                }}
              >
                {t('delete')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-navy-500">{t('printDesigner.pickBlock')}</p>
          )}
        </Card>
      </div>
    </div>
  )
}
