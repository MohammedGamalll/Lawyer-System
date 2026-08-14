import { app, BrowserWindow, dialog, shell } from 'electron'
import { getSetting } from './settings'
import { getTempDir, getDataRoot } from '../paths'
import path from 'path'
import fs from 'fs'
import { nowIso } from '../utils/time'
import { buildPrintHtml, type PrintKind } from './printHtml'

export type { PrintKind }
export { buildPrintHtml }

function pageOpts(kind: PrintKind) {
  if (kind === 'receipt' || kind === 'voucher') {
    return {
      pageSize: { width: 80000, height: 200000 },
      marginsType: 1 as const
    }
  }
  return { pageSize: 'A4' as const, marginsType: 0 as const }
}

function cairoFace(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'fonts', 'Cairo-Regular.woff2'),
    path.join(app.getAppPath(), 'resources/fonts/Cairo-Regular.woff2'),
    path.join(process.cwd(), 'resources/fonts/Cairo-Regular.woff2'),
    path.join(process.cwd(), 'node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2')
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const b64 = fs.readFileSync(p).toString('base64')
        return `@font-face { font-family: 'Cairo'; src: url(data:font/woff2;base64,${b64}) format('woff2'); font-weight: 400 800; }`
      }
    } catch {
      /* try next */
    }
  }
  return `@font-face { font-family: 'Cairo'; src: local('Cairo'), local('Segoe UI'); }`
}

function bundledLogoPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'brand-logo.png'),
    path.join(app.getAppPath(), 'resources', 'brand-logo.png'),
    path.join(process.cwd(), 'resources', 'brand-logo.png')
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function logoImg(): string {
  const logo = getSetting('office_logo', '')
  const full = logo && fs.existsSync(logo) ? logo : path.join(getDataRoot(), 'logo.png')
  const file = full && fs.existsSync(full) ? full : bundledLogoPath()
  if (file && fs.existsSync(file)) {
    const ext = path.extname(file).slice(1) || 'png'
    const b64 = fs.readFileSync(file).toString('base64')
    return `<img src="data:image/${ext};base64,${b64}" class="logo" alt="logo"/>`
  }
  return ''
}

export function wrapHtml(title: string, body: string, kind: PrintKind): string {
  const office = getSetting('office_name', 'مكتب المحاماة')
  const phone = getSetting('office_phone', '')
  const address = getSetting('office_address', '')
  return buildPrintHtml({
    title,
    body,
    kind,
    office,
    phone,
    address,
    fontFace: cairoFace(),
    logo: logoImg(),
    printedAt: nowIso().slice(0, 16).replace('T', ' ')
  })
}

async function loadHtmlWindow(html: string, show: boolean, parent?: BrowserWindow | null) {
  const file = path.join(getTempDir(), `print-${Date.now()}.html`)
  fs.writeFileSync(file, html, 'utf8')
  const win = new BrowserWindow({
    show,
    width: 900,
    height: 1100,
    autoHideMenuBar: true,
    parent: parent || undefined,
    webPreferences: { sandbox: true }
  })
  await win.loadFile(file)
  await new Promise((r) => setTimeout(r, 400))
  return { win, file }
}

function cleanup(win: BrowserWindow, file: string) {
  try {
    if (!win.isDestroyed()) win.destroy()
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

export async function htmlToPdf(html: string, kind: PrintKind, parent?: BrowserWindow | null): Promise<Buffer> {
  const { win, file } = await loadHtmlWindow(html, false, parent)
  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      ...pageOpts(kind)
    })
    return Buffer.from(data)
  } finally {
    cleanup(win, file)
  }
}

function isCancel(error?: string) {
  const s = String(error || '').toLowerCase()
  return !error || s.includes('cancel') || s.includes('abort') || s.includes('cancel')
}

export async function printHtml(html: string, kind: PrintKind, parent?: BrowserWindow | null, silent?: boolean): Promise<void> {
  const preferred =
    kind === 'receipt' || kind === 'voucher'
      ? getSetting('print_thermal_printer', '')
      : getSetting('print_a4_printer', '')
  const doSilent = silent ?? getSetting('silent_print', 'false') === 'true'
  const { win, file } = await loadHtmlWindow(html, true, parent)
  try {
    const printers = await win.webContents.getPrintersAsync()
    const match = printers.find((p) => p.name === preferred)
    const pdfLike = /print to pdf|microsoft print to pdf|xps/i.test(preferred || match?.name || '')
    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: Boolean(doSilent && match && !pdfLike),
          ...(match && !pdfLike ? { deviceName: match.name } : {}),
          printBackground: true,
          pageSize: 'A4'
        },
        (success, error) => {
          if (!success && error && !isCancel(error)) reject(new Error(error))
          else resolve()
        }
      )
    })
  } finally {
    cleanup(win, file)
  }
}

export async function savePdf(
  html: string,
  kind: PrintKind,
  suggestedName: string,
  parent?: BrowserWindow | null
) {
  const buf = await htmlToPdf(html, kind, parent)
  const res = parent
    ? await dialog.showSaveDialog(parent, {
        title: 'حفظ PDF',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
    : await dialog.showSaveDialog({
        title: 'حفظ PDF',
        defaultPath: suggestedName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
  if (res.canceled || !res.filePath) return { canceled: true as const, file: '', bytes: [] as number[] }
  fs.writeFileSync(res.filePath, buf)
  await shell.openPath(res.filePath)
  return { canceled: false as const, file: res.filePath, bytes: Array.from(buf) }
}

export function listPrinters(win?: BrowserWindow | null) {
  return win?.webContents.getPrintersAsync() ?? Promise.resolve([])
}

export function saveOfficeLogo(file: { name: string; data: number[] }) {
  const dest = path.join(getDataRoot(), 'logo' + (path.extname(file.name) || '.png'))
  fs.writeFileSync(dest, Buffer.from(file.data))
  return dest
}

export function saveLawyerPhoto(file: { name: string; data: number[] }) {
  const dest = path.join(getDocumentsDirSafe(), `lawyer-${Date.now()}${path.extname(file.name) || '.png'}`)
  fs.writeFileSync(dest, Buffer.from(file.data))
  return dest
}

function getDocumentsDirSafe() {
  const dir = path.join(getDataRoot(), 'photos')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function manualHtmlPath(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'docs', 'user-manual-ar.html'),
    path.join(app.getAppPath(), 'resources/docs/user-manual-ar.html'),
    path.join(process.cwd(), 'resources/docs/user-manual-ar.html'),
    path.join(process.cwd(), 'docs/user-manual-ar.html')
  ]
  return candidates.find((p) => fs.existsSync(p)) || ''
}

export async function saveManualPdf(parent?: BrowserWindow | null) {
  const src = manualHtmlPath()
  if (!src) throw new Error('ملف دليل الاستخدام غير موجود')
  const html = fs.readFileSync(src, 'utf8')
  return savePdf(html, 'a4', 'دليل-استخدام-نظام-إدارة-مكتب-المحاماة.pdf', parent)
}
