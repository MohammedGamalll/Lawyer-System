import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Paperclip } from 'lucide-react'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { parseSourceOrder, type AttachSource } from '../lib/attachSources'
import { Button, Field, Modal, Select } from './ui'

export type PickedFile = { name: string; data: number[]; mime?: string }

export type PendingDoc = {
  localId: string
  category: string
  title: string
  save_format: 'jpeg' | 'pdf'
  sides: 'front' | 'front_back'
  pages: PickedFile[]
}

export const DOC_CATEGORIES = [
  { id: 'id', key: 'docs.catId' },
  { id: 'poa', key: 'docs.catPoa' },
  { id: 'passport', key: 'docs.catPassport' },
  { id: 'contract', key: 'docs.catContract' },
  { id: 'birth', key: 'docs.catBirth' },
  { id: 'other', key: 'docs.catOther' }
] as const

function useSourceOrder() {
  const [order, setOrder] = useState<AttachSource[]>(parseSourceOrder(''))
  useEffect(() => {
    invoke<Record<string, string>>('settings:get')
      .then((s) => setOrder(parseSourceOrder(s.attach_source_order)))
      .catch(() => undefined)
  }, [])
  return order
}

export function UploadSourceMenu({
  onFile,
  label,
  multiple,
  compact
}: {
  onFile: (file: PickedFile) => void
  label?: string
  multiple?: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [cam, setCam] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const order = useSourceOrder()
  const pickScan = async () => {
    try {
      onFile(await invoke<PickedFile>('files:scan'))
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }
  const onLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      const buf = new Uint8Array(await file.arrayBuffer())
      onFile({ name: file.name, data: Array.from(buf), mime: file.type })
    }
  }
  const actions: Record<AttachSource, { label: string; run: () => void }> = {
    scanner: { label: t('docs.fromScanner'), run: () => void pickScan() },
    camera: { label: t('docs.fromCamera'), run: () => setCam(true) },
    file: { label: label || t('docs.fromFile'), run: () => fileRef.current?.click() }
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {order.map((src) => (
          <Button key={src} type="button" variant="outline" size={compact ? 'sm' : 'default'} onClick={actions[src].run}>
            {actions[src].label}
          </Button>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple={multiple}
          className="hidden"
          onChange={(ev) => onLocalFile(ev)}
        />
      </div>
      {!compact ? <p className="text-[11px] text-navy-500">{t('docs.scannerHint')}</p> : null}
      <CameraCapture open={cam} onClose={() => setCam(false)} onFile={onFile} stayOpen={multiple} />
    </>
  )
}

function CameraCapture({
  open,
  onClose,
  onFile,
  stayOpen
}: {
  open: boolean
  onClose: () => void
  onFile: (file: PickedFile) => void
  stayOpen?: boolean
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!open) return
    let stopped = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      })
      .catch(() => toast(t('docs.cameraDenied'), 'err'))
    return () => {
      stopped = true
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
    }
  }, [open])

  const snap = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      async (blob) => {
        if (!blob) return
        const buf = new Uint8Array(await blob.arrayBuffer())
        onFile({ name: `camera-${Date.now()}.jpg`, data: Array.from(buf), mime: 'image/jpeg' })
        if (!stayOpen) onClose()
      },
      'image/jpeg',
      0.88
    )
  }

  return (
    <Modal open={open} title={t('docs.fromCamera')} onClose={onClose} wide>
      <video ref={videoRef} autoPlay playsInline className="max-h-80 w-full rounded bg-black" />
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={snap}>
          {t('docs.capture')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('cancel')}
        </Button>
      </div>
    </Modal>
  )
}

export type PreviewItem =
  | { kind: 'image'; name: string; mime: string; dataUrl: string }
  | { kind: 'image_large'; name: string; mime: string }
  | { kind: 'pdf'; name: string; data: number[] }
  | { kind: 'other'; name: string }

export type PreviewData = PreviewItem | { kind: 'multi'; name: string; pages: PreviewItem[] }

function PreviewBody({ p }: { p: PreviewItem }) {
  const { t } = useTranslation()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (p.kind !== 'pdf') {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(p.data)], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [p])
  if (p.kind === 'image') return <img src={p.dataUrl} alt={p.name} className="max-h-[70vh] w-full object-contain" />
  if (p.kind === 'pdf' && pdfUrl) return <iframe title={p.name} src={pdfUrl} className="h-[70vh] w-full rounded border" />
  return (
    <div className="space-y-3">
      <p>{p.name}</p>
    </div>
  )
}

export function DocumentPreviewModal({
  id,
  onClose
}: {
  id: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [p, setP] = useState<PreviewData | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!id) {
      setP(null)
      setPage(0)
      return
    }
    invoke<PreviewData>('documents:preview', id)
      .then((data) => {
        setP(data)
        setPage(0)
      })
      .catch((e) => toast((e as Error).message, 'err'))
  }, [id])

  const items: PreviewItem[] = p ? (p.kind === 'multi' ? p.pages : [p]) : []
  const current = items[page] || items[0]

  return (
    <Modal open={!!id} title={t('docs.preview')} onClose={onClose} wide>
      {!p || !current ? (
        <div>{t('loading')}</div>
      ) : (
        <div className="space-y-3">
          <PreviewBody p={current} />
          {items.length > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <Button type="button" variant="outline" disabled={page <= 0} onClick={() => setPage((n) => n - 1)}>
                {t('prev')}
              </Button>
              <span>
                {page + 1} / {items.length}
              </span>
              <Button type="button" variant="outline" disabled={page >= items.length - 1} onClick={() => setPage((n) => n + 1)}>
                {t('next')}
              </Button>
            </div>
          ) : null}
          {id ? (
            <Button type="button" variant="outline" onClick={() => invoke('documents:open', id).catch((e) => toast((e as Error).message, 'err'))}>
              {t('docs.openExternal')}
            </Button>
          ) : null}
        </div>
      )}
    </Modal>
  )
}

export function DocumentThumb({
  id,
  title,
  onOpen,
  onOpenExternal
}: {
  id: string
  title?: string
  onOpen?: () => void
  onOpenExternal?: () => void
}) {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null>(null)
  const [kind, setKind] = useState<string>('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    let url: string | null = null
    invoke<PreviewData>('documents:preview', id)
      .then((p) => {
        const first = p.kind === 'multi' ? p.pages[0] : p
        setKind(first.kind)
        if (first.kind === 'image') setSrc(first.dataUrl)
        else if (first.kind === 'pdf') {
          url = URL.createObjectURL(new Blob([new Uint8Array(first.data)], { type: 'application/pdf' }))
          setSrc(url)
        }
      })
      .catch(() => undefined)
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return (
    <div className="relative flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 text-start"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        data-no-row
      >
        {kind === 'image' && src ? (
          <img src={src} alt="" className="h-12 w-12 rounded border object-cover" />
        ) : kind === 'pdf' ? (
          <span className="flex h-12 w-12 items-center justify-center rounded border bg-navy-50 text-[10px] font-bold">PDF</span>
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded border bg-navy-50 text-[10px]">ملف</span>
        )}
        <span className="max-w-[14rem] truncate">{title}</span>
      </button>
      {menu ? (
        <>
          <button type="button" className="fixed inset-0 z-[90]" onClick={() => setMenu(null)} aria-label={t('cancel')} />
          <div
            className="fixed z-[91] min-w-[10rem] rounded-md border border-navy-100 bg-white py-1 text-sm shadow-lg dark:border-navy-700 dark:bg-navy-900"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-start hover:bg-navy-50 dark:hover:bg-navy-800"
              onClick={() => {
                setMenu(null)
                onOpen?.()
              }}
            >
              {t('docs.preview')}
            </button>
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-start hover:bg-navy-50 dark:hover:bg-navy-800"
              onClick={() => {
                setMenu(null)
                onOpenExternal?.()
              }}
            >
              {t('docs.openExternal')}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function fileToUrl(file: PickedFile) {
  const mime = file.mime || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
  return URL.createObjectURL(new Blob([new Uint8Array(file.data)], { type: mime }))
}

function LocalFileThumb({
  file,
  label,
  onOpen,
  onClear
}: {
  file: PickedFile
  label: string
  onOpen: () => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = fileToUrl(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  const pdf = (file.mime || '').includes('pdf') || file.name.toLowerCase().endsWith('.pdf')
  return (
    <div className="flex items-center gap-2 rounded border border-navy-100 px-2 py-1 dark:border-navy-800">
      <button type="button" className="flex min-w-0 items-center gap-2 text-start" onClick={onOpen}>
        {pdf ? (
          <span className="flex h-12 w-12 items-center justify-center rounded bg-navy-50 text-[10px] font-bold">PDF</span>
        ) : url ? (
          <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <span className="h-12 w-12 rounded border" />
        )}
        <span className="max-w-[9rem] truncate text-xs">
          {label}
          <br />
          {file.name}
        </span>
      </button>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        {t('delete')}
      </Button>
    </div>
  )
}

function LocalPreviewModal({ file, title, onClose }: { file: PickedFile | null; title: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const u = fileToUrl(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  const pdf = !!file && ((file.mime || '').includes('pdf') || file.name.toLowerCase().endsWith('.pdf'))
  return (
    <Modal open={!!file} title={title} onClose={onClose} wide>
      {!file || !url ? (
        <div>{t('loading')}</div>
      ) : pdf ? (
        <iframe title={file.name} src={url} className="h-[70vh] w-full rounded border" />
      ) : (
        <img src={url} alt={file.name} className="max-h-[70vh] w-full object-contain" />
      )}
    </Modal>
  )
}

export function AttachDocumentControl({
  docs,
  onChange,
  existing,
  owner,
  onUploaded
}: {
  docs: PendingDoc[]
  onChange: (docs: PendingDoc[]) => void
  existing?: { id?: string; title: string; category: string }[]
  owner?: { client_id?: string; opponent_id?: string }
  onUploaded?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('id')
  const [saveFormat, setSaveFormat] = useState<'jpeg' | 'pdf'>('jpeg')
  const [sides, setSides] = useState<'front' | 'front_back'>('front_back')
  const [front, setFront] = useState<PickedFile | null>(null)
  const [back, setBack] = useState<PickedFile | null>(null)
  const [preview, setPreview] = useState<{ file: PickedFile; title: string } | null>(null)
  const [savedPreview, setSavedPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const catLabel = (id: string) => t(DOC_CATEGORIES.find((c) => c.id === id)?.key || 'docs.catId')
  const hasOwner = Boolean(owner?.client_id || owner?.opponent_id)

  const resetDraft = () => {
    setFront(null)
    setBack(null)
  }

  const commit = async () => {
    if (!front) return
    if (sides === 'front_back' && !back) return toast(t('docs.pickFirst'), 'err')
    const pages = sides === 'front_back' && back ? [front, back] : [front]
    const next: PendingDoc = {
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category,
      title: `${catLabel(category)} — ${sides === 'front_back' ? t('docs.frontBack') : t('docs.frontOnly')}`,
      save_format: pages.length > 1 ? 'pdf' : saveFormat,
      sides,
      pages
    }
    setBusy(true)
    try {
      if (hasOwner) {
        await invoke(
          'documents:upload',
          {
            ...owner,
            title: next.title,
            category: next.category,
            save_format: next.save_format
          },
          { pages: next.pages, save_format: next.save_format }
        )
        toast(t('docs.uploaded'))
        onUploaded?.()
      } else {
        onChange([...docs, next])
      }
      resetDraft()
      setOpen(false)
    } catch (e) {
      toast((e as Error).message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const allItems = [
    ...docs.map((d) => ({ kind: 'pending' as const, doc: d })),
    ...(existing || []).map((d) => ({ kind: 'saved' as const, doc: d }))
  ]

  return (
    <div className="ms-auto flex w-full max-w-xl flex-col items-end gap-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button type="button" variant="outline" className="gap-1">
            <Paperclip size={16} />
            {t('docs.attach')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[80] min-w-[12rem] rounded-xl border border-navy-100 bg-white p-1 text-start shadow-xl dark:border-navy-700 dark:bg-navy-900"
          >
            {DOC_CATEGORIES.map((c) => (
              <DropdownMenu.Item
                key={c.id}
                className="cursor-pointer rounded-md px-3 py-2 text-start text-sm outline-none hover:bg-navy-50 dark:text-white dark:hover:bg-navy-800"
                onSelect={() => {
                  setCategory(c.id)
                  setSaveFormat(c.id === 'poa' || c.id === 'contract' ? 'pdf' : 'jpeg')
                  setSides(c.id === 'id' || c.id === 'passport' ? 'front_back' : 'front')
                  resetDraft()
                  setOpen(true)
                }}
              >
                {t(c.key)}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {allItems.length ? (
        <div className="flex w-full flex-wrap justify-end gap-2">
          {docs.map((d) => (
            <button
              key={d.localId}
              type="button"
              className="rounded border border-navy-100 px-2 py-1 text-xs hover:bg-navy-50 dark:border-navy-800"
              onClick={() => d.pages[0] && setPreview({ file: d.pages[0], title: d.title })}
            >
              {d.title}
            </button>
          ))}
          {(existing || []).map((d) =>
            d.id ? (
              <DocumentThumb
                key={d.id}
                id={d.id}
                title={d.title}
                onOpen={() => setSavedPreview(d.id || null)}
                onOpenExternal={() => invoke('documents:open', d.id).catch((e) => toast((e as Error).message, 'err'))}
              />
            ) : (
              <span key={d.title} className="text-xs text-navy-500">
                {d.title}
              </span>
            )
          )}
        </div>
      ) : null}
      <Modal open={open} title={`${t('docs.attach')} — ${catLabel(category)}`} onClose={() => setOpen(false)} wide>
        <div className="space-y-3">
          <Field label={t('docs.sides')}>
            <Select
              value={sides}
              onChange={(e) => {
                const v = e.target.value as 'front' | 'front_back'
                setSides(v)
                if (v === 'front') setBack(null)
              }}
            >
              <option value="front">{t('docs.frontOnly')}</option>
              <option value="front_back">{t('docs.frontBack')}</option>
            </Select>
          </Field>
          <Field label={t('docs.saveFormat')}>
            <Select value={saveFormat} onChange={(e) => setSaveFormat(e.target.value as 'jpeg' | 'pdf')}>
              <option value="jpeg">JPEG</option>
              <option value="pdf">PDF</option>
            </Select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-navy-100 p-2 dark:border-navy-800">
              <div className="text-xs font-bold">{t('docs.front')}</div>
              {front ? (
                <LocalFileThumb
                  file={front}
                  label={t('docs.front')}
                  onOpen={() => setPreview({ file: front, title: t('docs.front') })}
                  onClear={() => setFront(null)}
                />
              ) : (
                <UploadSourceMenu onFile={setFront} compact />
              )}
            </div>
            {sides === 'front_back' ? (
              <div className="space-y-2 rounded-lg border border-navy-100 p-2 dark:border-navy-800">
                <div className="text-xs font-bold">{t('docs.back')}</div>
                {back ? (
                  <LocalFileThumb
                    file={back}
                    label={t('docs.back')}
                    onOpen={() => setPreview({ file: back, title: t('docs.back') })}
                    onClear={() => setBack(null)}
                  />
                ) : (
                  <UploadSourceMenu onFile={setBack} compact />
                )}
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={busy || !front || (sides === 'front_back' && !back)} onClick={() => void commit()}>
              {busy ? t('saving') : t('docs.addPages')}
            </Button>
          </div>
        </div>
      </Modal>
      <LocalPreviewModal file={preview?.file || null} title={preview?.title || t('docs.preview')} onClose={() => setPreview(null)} />
      <DocumentPreviewModal id={savedPreview} onClose={() => setSavedPreview(null)} />
    </div>
  )
}

export async function uploadPendingDocs(
  owner: { client_id?: string; opponent_id?: string },
  form: Record<string, unknown>
) {
  const docs = (form.__pending_docs as PendingDoc[] | undefined) || []
  const legacy: PendingDoc[] = []
  const idFile = form.__pending_id as PickedFile | undefined
  const poaFile = form.__pending_poa as PickedFile | undefined
  if (idFile?.data) {
    legacy.push({ localId: 'id', category: 'id', title: idFile.name || 'بطاقة', save_format: 'jpeg', sides: 'front', pages: [idFile] })
  }
  if (poaFile?.data) {
    legacy.push({ localId: 'poa', category: 'poa', title: poaFile.name || 'توكيل', save_format: 'pdf', sides: 'front', pages: [poaFile] })
  }
  for (const doc of [...docs, ...legacy]) {
    await invoke(
      'documents:upload',
      {
        ...owner,
        title: doc.title,
        category: doc.category,
        save_format: doc.save_format
      },
      { pages: doc.pages, save_format: doc.save_format }
    )
  }
}

export function ClientDocumentUpload({
  clientId,
  opponentId,
  onDone
}: {
  clientId?: string
  opponentId?: string
  onDone: () => void
}) {
  const { can } = useApp()
  const [docs, setDocs] = useState<PendingDoc[]>([])
  if (!can('documents.upload')) return null
  return (
    <AttachDocumentControl
      docs={docs}
      onChange={setDocs}
      owner={{ client_id: clientId, opponent_id: opponentId }}
      onUploaded={onDone}
    />
  )
}
