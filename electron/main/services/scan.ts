import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function acquireScan(): Promise<{ name: string; data: number[]; mime: string }> {
  const out = path.join(os.tmpdir(), `law-scan-${Date.now()}.jpg`)
  const escaped = out.replace(/'/g, "''")
  const script = `
$ErrorActionPreference = 'Stop'
$dialog = New-Object -ComObject WIA.CommonDialog
$img = $dialog.ShowAcquireImage()
if (-not $img) { throw 'cancelled' }
$img.SaveFile('${escaped}')
`
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-STA', '-Command', script], {
      windowsHide: true,
      timeout: 180000
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/cancelled/i.test(msg)) throw new Error('تم إلغاء المسح')
    throw new Error('تعذر الاتصال بالسكانر. تأكد أن الجهاز متصل ثم أعد المحاولة، أو أرفق ملفاً.')
  }
  if (!fs.existsSync(out)) throw new Error('لم يتم حفظ صورة المسح')
  const buf = fs.readFileSync(out)
  try {
    fs.unlinkSync(out)
  } catch {
    /* ignore */
  }
  return { name: `scan-${Date.now()}.jpg`, data: Array.from(buf), mime: 'image/jpeg' }
}
