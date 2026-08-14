import fs from 'fs'
import path from 'path'
import { getDb } from '../db/database'
import { getDocumentsDir } from '../paths'
import { nowIso } from '../utils/time'
import { audit } from './audit'
import { newId, asIdOrNull, notDeleted } from '../db/ids'
import { recordLocalChange, softDelete } from '../sync/queue'
import type { AuthedUser } from '../ipc/helpers'
import type { ListQuery } from '@shared/types'

export function listDocuments(query: ListQuery = {}) {
  const db = getDb()
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
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

export function uploadDocument(
  actor: AuthedUser,
  meta: Record<string, unknown>,
  file: { name: string; data: Buffer | Uint8Array; mime?: string }
) {
  if (!meta.title) throw new Error('عنوان المستند مطلوب')
  const dir = getDocumentsDir()
  const safe = `${Date.now()}-${file.name.replace(/[^\w.\u0600-\u06FF-]+/g, '_')}`
  const dest = path.join(dir, safe)
  fs.writeFileSync(dest, Buffer.from(file.data))
  const ts = nowIso()
  const db = getDb()
  const id = newId()
  db.prepare(
    `INSERT INTO documents (id, title, category, client_id, case_id, hearing_id, contract_id, file_path, file_name, mime_type, file_size, current_version, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`
  ).run(
    id,
    meta.title,
    meta.category ?? 'other',
    asIdOrNull(meta.client_id),
    asIdOrNull(meta.case_id),
    asIdOrNull(meta.hearing_id),
    asIdOrNull(meta.contract_id),
    dest,
    file.name,
    file.mime ?? null,
    Buffer.from(file.data).length,
    meta.notes ?? null,
    actor.id,
    ts,
    ts
  )
  recordLocalChange('documents', id, 'INSERT')
  const vid = newId()
  db.prepare(
    `INSERT INTO document_versions (id, document_id, version, file_path, file_name, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  ).run(vid, id, 1, dest, file.name, actor.id, ts, ts)
  recordLocalChange('document_versions', vid, 'INSERT')
  audit(actor, 'create', 'documents', id, `تم رفع المستند ${meta.title}`)
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
    `UPDATE documents SET title=?, category=?, client_id=?, case_id=?, hearing_id=?, notes=?,
      file_path=COALESCE(?, file_path), file_name=COALESCE(?, file_name), current_version=?, updated_at=? WHERE id=?`
  ).run(
    data.title ?? old.title,
    data.category ?? 'other',
    asIdOrNull(data.client_id),
    asIdOrNull(data.case_id),
    asIdOrNull(data.hearing_id),
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
  for (const r of [...docs, ...vers]) if (r.file_path) set.add(path.normalize(r.file_path))
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
    'UPDATE documents SET client_id=COALESCE(?, client_id), case_id=COALESCE(?, case_id), category=COALESCE(?, category), updated_at=? WHERE id=?'
  ).run(asIdOrNull(data.client_id), asIdOrNull(data.case_id), data.category ?? null, nowIso(), id)
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
