import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '../lib/api'
import { useApp } from '../store'
import { Button, Field, Input, Modal, Select } from './ui'

export type PickedFile = { name: string; data: number[]; mime?: string }

export function UploadSourceMenu({
  onFile,
  label
}: {
  onFile: (file: PickedFile) => void
  label?: string
}) {
  const { t } = useTranslation()
  const { toast } = useApp()
  const [cam, setCam] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickScan = async () => {
    try {
      onFile(await invoke<PickedFile>('files:scan'))
    } catch (e) {
      toast((e as Error).message, 'err')
    }
  }
  const onLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const buf = new Uint8Array(await file.arrayBuffer())
    onFile({ name: file.name, data: Array.from(buf), mime: file.type })
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => pickScan()}>
          {t('docs.fromScanner')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setCam(true)}>
          {t('docs.fromCamera')}
        </Button>
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          {label || t('docs.fromFile')}
        </Button>
        <input ref={fileRef} type="file" className="hidden" onChange={(ev) => onLocalFile(ev)} />
      </div>
      <p className="text-[11px] text-navy-500">{t('docs.scannerHint')}</p>
      <CameraCapture open={cam} onClose={() => setCam(false)} onFile={onFile} />
    </>
  )
}

function CameraCapture({
  open,
  onClose,
  onFile
}: {
  open: boolean
  onClose: () => void
  onFile: (file: PickedFile) => void
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
        onClose()
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

export type PreviewData =
  | { kind: 'image'; name: string; mime: string; dataUrl: string }
  | { kind: 'image_large'; name: string; mime: string }
  | { kind: 'pdf'; name: string; data: number[] }
  | { kind: 'other'; name: string }

export function DocumentThumb({
  id,
  title,
  onOpen
}: {
  id: string
  title?: string
  onOpen?: () => void
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [kind, setKind] = useState<string>('')
  useEffect(() => {
    let url: string | null = null
    invoke<PreviewData>('documents:preview', id)
      .then((p) => {
        setKind(p.kind)
        if (p.kind === 'image') setSrc(p.dataUrl)
        else if (p.kind === 'pdf') {
          url = URL.createObjectURL(new Blob([new Uint8Array(p.data)], { type: 'application/pdf' }))
          setSrc(url)
        }
      })
      .catch(() => undefined)
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  return (
    <button type="button" className="flex items-center gap-2 text-start" onClick={onOpen} data-no-row>
      {kind === 'image' && src ? (
        <img src={src} alt="" className="h-12 w-12 rounded border object-cover" />
      ) : kind === 'pdf' ? (
        <span className="flex h-12 w-12 items-center justify-center rounded border bg-navy-50 text-[10px] font-bold">
          PDF
        </span>
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded border bg-navy-50 text-[10px]">
          ملف
        </span>
      )}
      <span className="max-w-[14rem] truncate">{title}</span>
    </button>
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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!id) {
      setP(null)
      return
    }
    invoke<PreviewData>('documents:preview', id)
      .then(setP)
      .catch((e) => toast((e as Error).message, 'err'))
  }, [id])

  useEffect(() => {
    if (p?.kind !== 'pdf') {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(p.data)], { type: 'application/pdf' }))
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [p])

  return (
    <Modal open={!!id} title={t('docs.preview')} onClose={onClose} wide>
      {!p ? (
        <div>{t('loading')}</div>
      ) : p.kind === 'image' ? (
        <img src={p.dataUrl} alt={p.name} className="max-h-[70vh] w-full object-contain" />
      ) : p.kind === 'pdf' && pdfUrl ? (
        <iframe title={p.name} src={pdfUrl} className="h-[70vh] w-full rounded border" />
      ) : (
        <div className="space-y-3">
          <p>{p.name}</p>
          <Button
            type="button"
            onClick={() => invoke('documents:open', id).catch((e) => toast((e as Error).message, 'err'))}
          >
            {t('docs.openExternal')}
          </Button>
        </div>
      )}
    </Modal>
  )
}

export function ClientDocumentUpload({
  clientId,
  onDone
}: {
  clientId: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { toast, can } = useApp()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Record<string, unknown>>({ category: 'id', client_id: clientId })
  const [file, setFile] = useState<PickedFile | null>(null)

  if (!can('documents.upload')) return null

  const save = async () => {
    if (!file) return toast(t('docs.pickFirst'), 'err')
    await invoke('documents:upload', { ...form, client_id: clientId, title: form.title || file.name }, file)
    toast(t('docs.uploaded'))
    setOpen(false)
    setFile(null)
    onDone()
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}>
        {t('docs.uploadClient')}
      </Button>
      <Modal open={open} title={t('docs.uploadClient')} onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label={t('fields.title')} required>
            <Input value={String(form.title || '')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={t('fields.category')}>
            <Select value={String(form.category)} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="id">{t('fields.national_id')}</option>
              <option value="poa">{t('nav.poa')}</option>
              <option value="contract">{t('nav.contracts')}</option>
              <option value="other">{t('status.other')}</option>
            </Select>
          </Field>
          <UploadSourceMenu
            onFile={(f) => {
              setFile(f)
              if (!form.title) setForm({ ...form, title: f.name })
            }}
          />
          {file ? <p className="text-sm text-navy-600">{file.name}</p> : null}
          <Button disabled={!file} onClick={() => save().catch((e) => toast(e.message, 'err'))}>
            {t('save')}
          </Button>
        </div>
      </Modal>
    </>
  )
}
