import fs from 'fs'
import path from 'path'
import { nativeImage } from 'electron'
import { PDFDocument } from 'pdf-lib'
import { getDb } from '../db/database'
import { getDocumentsDir } from '../paths'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'
import { clampPageSize, pageKind } from '../db/queryLimits'

export type UploadPage = { name: string; data: Buffer | Uint8Array | number[]; mime?: string }

function asBuffer(data: Buffer | Uint8Array | number[] | { type?: string; data?: number[] }) {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Uint8Array) return Buffer.from(data)
  if (data && typeof data === 'object' && Array.isArray((data as { data?: number[] }).data)) {
    return Buffer.from((data as { data: number[] }).data)
  }
  return Buffer.from(data as number[])
}

function isPdfBuf(buf: Buffer) {
  return buf.subarray(0, 4).toString() === '%PDF'
}

function toJpegBuffer(buf: Buffer): Buffer {
  if (isPdfBuf(buf)) return buf
  const img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) return buf
  const jpeg = img.toJPEG(85)
  return jpeg.length ? Buffer.from(jpeg) : buf
}

async function pagesToPdf(jpegs: Buffer[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (const jpeg of jpegs) {
    if (isPdfBuf(jpeg)) {
      const src = await PDFDocument.load(jpeg)
      const copied = await pdf.copyPages(src, src.getPageIndices())
      copied.forEach((p) => pdf.addPage(p))
      continue
    }
    const img = await pdf.embedJpg(jpeg)
    const page = pdf.addPage([img.width, img.height])
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  }
  return Buffer.from(await pdf.save())
}

function writeDocFile(name: string, buf: Buffer) {
  const dir = getDocumentsDir()
  const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')}`
  const dest = path.join(dir, safe)
  fs.writeFileSync(dest, buf)
  return dest
}

export function listDocuments(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = clampPageSize(query.pageSize, pageKind(query))
  const params: unknown[] = []
  let where = `WHERE ${notDeleted('d')}`
  if (query.search) {
    where += ' AND (d.title LIKE ? OR d.file_name LIKE ?)'
    const s = `%${query.search}%`
    params.push(s, s)
  }
  const f = query.filters ?? {}
  if (f.category) {
    where += ' AND d.category = ?'
    params.push(f.category)
  }
  if (f.client_id) {
    where += ' AND d.client_id = ?'
    params.push(f.client_id)
  }
  if (f.case_id) {
    where += ' AND d.case_id = ?'
    params.push(f.case_id)
  }
  if (f.opponent_id) {
    where += ' AND d.opponent_id = ?'
    params.push(f.opponent_id)
  }
  const total = (db.prepare(`SELECT COUNT(*) as c FROM documents d ${where}`).get(...params) as { c: number }).c
  const rows = db
    .prepare(
      `SELECT d.*, cl.full_name as client_name, cs.case_number
       FROM documents d
       LEFT JOIN clients cl ON cl.id = d.client_id AND ${notDeleted('cl')}
       LEFT JOIN cases cs ON cs.id = d.case_id AND ${notDeleted('cs')}
       ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize)
  return { rows, total, page, pageSize }
}

export async function uploadDocument(
  actor: AuthedUser,
  meta: Record<string, unknown>,
  file: UploadPage | { pages?: UploadPage[]; save_format?: string; name?: string; data?: Buffer | Uint8Array | number[]; mime?: string }
) {
  const incoming = (file as { pages?: UploadPage[] }).pages?.length
    ? (file as { pages: UploadPage[] }).pages
    : [{ name: (file as UploadPage).name, data: (file as UploadPage).data, mime: (file as UploadPage).mime }]
  if (!incoming.length || incoming.some((p) => !p?.data)) throw new Error('اختر ملفاً أولاً')
  const title = String(meta.title || incoming[0].name || 'مستند')
  const saveFormat = String(meta.save_format || (file as { save_format?: string }).save_format || (incoming.length > 1 ? 'pdf' : 'jpeg'))
  const ts = nowIso()
  const db = getDb()
  const id = newId()

  const pageFiles: { dest: string; name: string; mime: string; buf: Buffer }[] = []
  for (let i = 0; i < incoming.length; i++) {
    const raw = asBuffer(incoming[i].data)
    const jpegOrPdf = toJpegBuffer(raw)
    const isPdf = isPdfBuf(jpegOrPdf)
    const mime = isPdf ? 'application/pdf' : 'image/jpeg'
    const name = isPdf ? incoming[i].name || `page-${i + 1}.pdf` : `page-${i + 1}.jpg`
    const dest = writeDocFile(name, jpegOrPdf)
    pageFiles.push({ dest, name, mime, buf: jpegOrPdf })
  }

  let dest = pageFiles[0].dest
  let fileName = pageFiles[0].name
  let mime = pageFiles[0].mime
  let size = pageFiles[0].buf.length
  if (saveFormat === 'pdf' || (pageFiles.length > 1 && saveFormat !== 'jpeg')) {
    const pdfBuf = await pagesToPdf(pageFiles.map((p) => p.buf)).catch(() => null)
    if (pdfBuf) {
      fileName = `${path.parse(String(incoming[0].name || 'document')).name || 'document'}.pdf`
      dest = writeDocFile(fileName, pdfBuf)
      mime = 'application/pdf'
      size = pdfBuf.length
    }
  }

  db.prepare(
    `INSERT INTO documents (id, title, category, client_id, opponent_id, case_id, hearing_id, contract_id, file_path, file_name, mime_type, file_size, current_version, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`
  ).run(
    id,
    title,
    meta.category ?? 'other',
    asIdOrNull(meta.client_id),
    asIdOrNull(meta.opponent_id),
    asIdOrNull(meta.case_id),
    asIdOrNull(meta.hearing_id),
    asIdOrNull(meta.contract_id),
    dest,
    fileName,
    mime,
    size,
    meta.notes ?? null,
    actor.id,
    ts,
    ts
  )
  recordLocalChange('documents', id, 'INSERT')
  const vid = newId()
  db.prepare(
    `INSERT INTO document_versions (id, document_id, version, file_path, file_name, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(vid, id, 1, dest, fileName, actor.id, ts, ts)
  recordLocalChange('document_versions', vid, 'INSERT')
  const insertPage = db.prepare(
    `INSERT INTO document_pages (id, document_id, page_no, file_path, file_name, mime_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  )
  pageFiles.forEach((p, i) => {
    const pid = newId()
    insertPage.run(pid, id, i + 1, p.dest, p.name, p.mime, ts, ts)
    recordLocalChange('document_pages', pid, 'INSERT')
  })
  audit(actor, 'create', 'documents', id, `تم رفع المستند ${title}`)
  return { id }
}

export function updateDocument(
  actor: AuthedUser,
  id: string,
  data: Record<string, unknown>,
  file?: { name: string; data: Buffer | Uint8Array; mime?: string }
) {
  const db = getDb()
  const old = db.prepare(`SELECT * FROM documents WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { current_version: number; title: string }
    | undefined
  if (!old) throw new Error('المستند غير موجود')
  let filePath: string | undefined
  let version = old.current_version
  if (file) {
    const dest = path.join(getDocumentsDir(), `${Date.now()}-${file.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')}`)
    fs.writeFileSync(dest, Buffer.from(file.data))
    version += 1
    filePath = dest
    const vid = newId()
    const ts = nowIso()
    db.prepare(
      `INSERT INTO document_versions (id, document_id, version, file_path, file_name, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run(vid, id, version, dest, file.name, actor.id, ts, ts)
    recordLocalChange('document_versions', vid, 'INSERT')
  }
  db.prepare(
    `UPDATE documents SET title=?, category=?, client_id=?, opponent_id=?, case_id=?, hearing_id=?, contract_id=?, notes=?,
      file_path=COALESCE(?, file_path), file_name=COALESCE(?, file_name), current_version=?, updated_at=? WHERE id=?`
  ).run(
    data.title ?? old.title,
    data.category ?? 'other',
    asIdOrNull(data.client_id),
    asIdOrNull(data.opponent_id),
    asIdOrNull(data.case_id),
    asIdOrNull(data.hearing_id),
    asIdOrNull(data.contract_id),
    data.notes ?? null,
    filePath ?? null,
    file?.name ?? null,
    version,
    nowIso(),
    id
  )
  recordLocalChange('documents', id, 'UPDATE')
  audit(actor, 'update', 'documents', id, `تم تحديث المستند ${data.title ?? old.title}`)
  return { id }
}

export function removeDocument(actor: AuthedUser, id: string) {
  const db = getDb()
  const doc = db.prepare(`SELECT * FROM documents WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { file_path: string; title: string }
    | undefined
  if (!doc) throw new Error('المستند غير موجود')
  const versions = db.prepare(`SELECT id, file_path FROM document_versions WHERE document_id = ? AND ${notDeleted()}`).all(id) as {
    id: string
    file_path: string
  }[]
  for (const v of versions) softDelete('document_versions', v.id)
  const pages = db.prepare(`SELECT id, file_path FROM document_pages WHERE document_id = ? AND ${notDeleted()}`).all(id) as {
    id: string
    file_path: string
  }[]
  for (const p of pages) {
    softDelete('document_pages', p.id)
    if (p.file_path && fs.existsSync(p.file_path) && p.file_path !== doc.file_path) {
      try {
        fs.unlinkSync(p.file_path)
      } catch {
        /* ignore */
      }
    }
  }
  softDelete('documents', id)
  for (const v of versions) {
    if (v.file_path && fs.existsSync(v.file_path)) fs.unlinkSync(v.file_path)
  }
  if (doc.file_path && fs.existsSync(doc.file_path)) {
    try {
      fs.unlinkSync(doc.file_path)
    } catch {
      /* already deleted via version */
    }
  }
  audit(actor, 'delete', 'documents', id, `تم حذف المستند ${doc.title}`)
}

export function openDocument(id: string) {
  const doc = getDb().prepare(`SELECT file_path FROM documents WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { file_path: string }
    | undefined
  if (!doc || !fs.existsSync(doc.file_path)) throw new Error('الملف غير موجود على القرص')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shell } = require('electron') as { shell: { openPath: (p: string) => Promise<string> } }
  return shell.openPath(doc.file_path)
}

export function documentVersions(id: string) {
  return getDb()
    .prepare(`SELECT * FROM document_versions WHERE document_id = ? AND ${notDeleted()} ORDER BY version DESC`)
    .all(id)
}

export function collectReferencedFiles(): Set<string> {
  const db = getDb()
  const set = new Set<string>()
  const docs = db.prepare('SELECT file_path FROM documents').all() as { file_path: string }[]
  const vers = db.prepare('SELECT file_path FROM document_versions').all() as { file_path: string }[]
  let pages: { file_path: string }[] = []
  try {
    pages = db.prepare('SELECT file_path FROM document_pages').all() as { file_path: string }[]
  } catch {
    pages = []
  }
  for (const r of [...docs, ...vers, ...pages]) if (r.file_path) set.add(path.normalize(r.file_path))
  return set
}

export function garbageCollectOrphans(actor?: AuthedUser | null): { deleted: number; kept: number } {
  const dir = getDocumentsDir()
  const referenced = collectReferencedFiles()
  const files = fs.readdirSync(dir)
  let deleted = 0
  for (const name of files) {
    const full = path.normalize(path.join(dir, name))
    if (!referenced.has(full) && fs.statSync(full).isFile()) {
      fs.unlinkSync(full)
      deleted++
    }
  }
  if (actor && deleted) audit(actor, 'gc', 'documents', null, `تم تنظيف ${deleted} ملفًا يتيمًا`)
  return { deleted, kept: referenced.size }
}

export function deleteCaseDocumentsFromDisk(caseId: string): void {
  const db = getDb()
  const docs = db.prepare('SELECT id FROM documents WHERE case_id = ?').all(caseId) as { id: string }[]
  for (const d of docs) {
    const versions = db.prepare('SELECT file_path FROM document_versions WHERE document_id = ?').all(d.id) as {
      file_path: string
    }[]
    for (const v of versions) {
      if (v.file_path && fs.existsSync(v.file_path)) fs.unlinkSync(v.file_path)
    }
  }
}

export function renameDocument(actor: AuthedUser, id: string, title: string) {
  if (!title?.trim()) throw new Error('العنوان مطلوب')
  const db = getDb()
  const old = db.prepare(`SELECT title FROM documents WHERE id = ? AND ${notDeleted()}`).get(id) as { title: string } | undefined
  if (!old) throw new Error('المستند غير موجود')
  db.prepare('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?').run(title.trim(), nowIso(), id)
  recordLocalChange('documents', id, 'UPDATE')
  audit(actor, 'update', 'documents', id, `تمت إعادة تسمية المستند من ${old.title} إلى ${title}`)
  return { id }
}

export function moveDocument(
  actor: AuthedUser,
  id: string,
  data: { client_id?: string; case_id?: string; category?: string }
) {
  const db = getDb()
  db.prepare(
    'UPDATE documents SET client_id=COALESCE(?, client_id), opponent_id=COALESCE(?, opponent_id), case_id=COALESCE(?, case_id), category=COALESCE(?, category), updated_at=? WHERE id=?'
  ).run(
    asIdOrNull(data.client_id),
    asIdOrNull((data as { opponent_id?: string }).opponent_id),
    asIdOrNull(data.case_id),
    data.category ?? null,
    nowIso(),
    id
  )
  recordLocalChange('documents', id, 'UPDATE')
  audit(actor, 'update', 'documents', id, 'تم نقل/إعادة تصنيف المستند')
  return { id }
}

export function downloadDocument(id: string, versionId?: string) {
  const db = getDb()
  let filePath: string | undefined
  let fileName: string | undefined
  if (versionId) {
    const v = db.prepare('SELECT file_path, file_name FROM document_versions WHERE id = ?').get(versionId) as
      | { file_path: string; file_name: string }
      | undefined
    filePath = v?.file_path
    fileName = v?.file_name
  } else {
    const d = db.prepare('SELECT file_path, file_name FROM documents WHERE id = ?').get(id) as
      | { file_path: string; file_name: string }
      | undefined
    filePath = d?.file_path
    fileName = d?.file_name
  }
  if (!filePath || !fs.existsSync(filePath)) throw new Error('الملف غير موجود على القرص')
  const buf = fs.readFileSync(filePath)
  return { name: fileName || path.basename(filePath), data: Array.from(buf) }
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

function previewFile(file_path: string, file_name: string, mime_type: string | null) {
  if (!fs.existsSync(file_path)) throw new Error('الملف غير موجود على القرص')
  const ext = path.extname(file_name || file_path).toLowerCase()
  const mime = String(mime_type || '')
  const buf = fs.readFileSync(file_path)
  const isImage = IMAGE_EXT.has(ext) || mime.startsWith('image/')
  const isPdf = ext === '.pdf' || mime === 'application/pdf' || isPdfBuf(buf)
  if (isImage) {
    const kind = mime.startsWith('image/') ? mime : `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`
    if (buf.length > 2_500_000) {
      return { kind: 'image_large' as const, name: file_name, mime: kind }
    }
    return { kind: 'image' as const, name: file_name, mime: kind, dataUrl: `data:${kind};base64,${buf.toString('base64')}` }
  }
  if (isPdf) {
    return { kind: 'pdf' as const, name: file_name, data: Array.from(buf) }
  }
  return { kind: 'other' as const, name: file_name }
}

export function previewDocument(id: string) {
  const db = getDb()
  const d = db.prepare(`SELECT file_path, file_name, mime_type FROM documents WHERE id = ? AND ${notDeleted()}`).get(id) as
    | { file_path: string; file_name: string; mime_type: string | null }
    | undefined
  if (!d) throw new Error('الملف غير موجود على القرص')
  let pages: { page_no: number; file_path: string; file_name: string | null; mime_type: string | null }[] = []
  try {
    pages = db
      .prepare(
        `SELECT page_no, file_path, file_name, mime_type FROM document_pages WHERE document_id = ? AND ${notDeleted()} ORDER BY page_no`
      )
      .all(id) as typeof pages
  } catch {
    pages = []
  }
  const items = pages.length
    ? pages.map((p) => previewFile(p.file_path, p.file_name || d.file_name, p.mime_type))
    : [previewFile(d.file_path, d.file_name, d.mime_type)]
  if (items.length === 1) return items[0]
  return { kind: 'multi' as const, name: d.file_name, pages: items }
}
