import { app, BrowserWindow, dialog, shell } from 'electron'
import { getSetting } from './settings'
import { getTempDir, getDataRoot } from '../paths'
import path from 'path'
import fs from 'fs'
import { nowIso } from '../utils/time'
import { buildPrintHtml, stripPrintCodes, type PrintKind } from './printHtml'

export type { PrintKind }
export { buildPrintHtml, stripPrintCodes }

function pageOpts(kind: PrintKind) {
  const paper = { marginType: 'custom' as const, top: 0.55, bottom: 0.55, left: 0.55, right: 0.55 }
  if (kind === 'receipt' || kind === 'voucher') {
    return {
      pageSize: { width: 80000, height: 200000 },
      margins: { marginType: 'custom' as const, top: 0.2, bottom: 0.2, left: 0.2, right: 0.2 }
    }
  }
  return { pageSize: 'A4' as const, landscape: false, margins: paper }
}

export function appFontFace(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'fonts', 'ibm-plex-sans-arabic-arabic-400-normal.woff2'),
    path.join(app.getAppPath(), 'resources/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2'),
    path.join(process.cwd(), 'resources/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2'),
    path.join(
      process.cwd(),
      'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2'
    )
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const b64 = fs.readFileSync(p).toString('base64')
        return `@font-face { font-family: 'IBM Plex Sans Arabic'; src: url(data:font/woff2;base64,${b64}) format('woff2'); font-weight: 400 700; }`
      }
    } catch {
      /* try next */
    }
  }
  return `@font-face { font-family: 'IBM Plex Sans Arabic'; src: local('IBM Plex Sans Arabic'), local('Segoe UI'); }`
}
function bundledLogoPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'brand-logo.png'),
    path.join(app.getAppPath(), 'resources', 'brand-logo.png'),
    path.join(process.cwd(), 'resources', 'brand-logo.png')
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

export function officeLogoDataUrl(): string {
  const custom = getSetting('office_logo', '')
  const dataRoot = path.join(getDataRoot(), 'logo.png')
  const file = [bundledLogoPath(), custom, dataRoot].find((p) => p && fs.existsSync(p))
  if (file && fs.existsSync(file)) {
    const ext = path.extname(file).slice(1).toLowerCase() || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'gif' ? 'gif' : ext === 'webp' ? 'webp' : 'png'
    if (!['png', 'jpeg', 'gif', 'webp'].includes(mime)) return ''
    const b64 = fs.readFileSync(file).toString('base64')
    return `data:image/${mime};base64,${b64}`
  }
  return ''
}

function logoImg(): string {
  const src = officeLogoDataUrl()
  return src ? `<img src="${src}" class="logo" alt="logo"/>` : ''
}

export function wrapHtml(title: string, body: string, kind: PrintKind, layout?: string): string {
  const office = getSetting('office_name', 'مكتب المحاماة')
  const phones = [getSetting('office_phone', ''), getSetting('office_phone2', ''), getSetting('office_phone3', '')]
    .filter(Boolean)
    .join(' — ')
  const address = getSetting('office_address', '')
  const lang = getSetting('language', 'ar')
  const recipientLine =
    lang === 'en' ? 'Receiving lawyer: ...........' : 'اسم المحامي المستلم: ...........'
  return buildPrintHtml({
    title,
    body,
    kind,
    office,
    phone: phones,
    address,
    fontFace: appFontFace(),
    logo: logoImg(),
    printedAt: nowIso().slice(0, 16).replace('T', ' '),
    recipientLine: kind === 'report' && layout !== 'hearingsRoll' ? recipientLine : undefined,
    layout
  })
}

function appWindow(preferred?: BrowserWindow | null) {
  if (preferred && !preferred.isDestroyed()) return preferred
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.getParentWindow()) || null
}

function restoreAppWindow(preferred?: BrowserWindow | null) {
  const target = appWindow(preferred)
  if (!target) return
  try {
    if (target.isMinimized()) target.restore()
    target.show()
    target.moveTop()
    target.focus()
    if (process.platform === 'win32') {
      target.setAlwaysOnTop(true)
      target.setAlwaysOnTop(false)
    }
  } catch {
    /* ignore */
  }
}

async function loadHtmlWindow(html: string, parent?: BrowserWindow | null) {
  const file = path.join(getTempDir(), `print-${Date.now()}.html`)
  fs.writeFileSync(file, stripPrintCodes(html), 'utf8')
  const owner = appWindow(parent)
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    autoHideMenuBar: true,
    skipTaskbar: true,
    parent: owner || undefined,
    modal: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, javascript: false }
  })
  win.setMenuBarVisibility(false)
  await win.loadFile(file)
  await new Promise((r) => setTimeout(r, 400))
  return { win, file }
}

function cleanup(win: BrowserWindow, file: string, parent?: BrowserWindow | null) {
  restoreAppWindow(parent)
  try {
    if (!win.isDestroyed()) win.destroy()
  } catch {
    /* ignore */
  }
  restoreAppWindow(parent)
  try {
    fs.unlinkSync(file)
  } catch {
    /* ignore */
  }
}

export async function htmlToPdf(html: string, kind: PrintKind, parent?: BrowserWindow | null): Promise<Buffer> {
  const { win, file } = await loadHtmlWindow(html, parent)
  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: kind !== 'receipt' && kind !== 'voucher',
      ...pageOpts(kind)
    })
    return Buffer.from(data)
  } finally {
    cleanup(win, file, parent)
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
  const { win, file } = await loadHtmlWindow(html, parent)
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
          ...(kind === 'receipt' || kind === 'voucher'
            ? {}
            : { pageSize: 'A4' as const, landscape: false }),
          margins: {
            marginType: kind === 'receipt' || kind === 'voucher' ? 'printableArea' : 'none'
          }
        },
        (success, error) => {
          restoreAppWindow(parent)
          if (!success && error && !isCancel(error)) reject(new Error(error))
          else resolve()
        }
      )
    })
  } finally {
    cleanup(win, file, parent)
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
