import { app, dialog } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import log from 'electron-log'

if (process.platform === 'win32') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch(
    'disable-features',
    'CalculateNativeWinOcclusion,WinUseNativeWinOcclusion,HardwareMediaKeyHandling'
  )
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  try {
    app.setAppUserModelId('com.lawoffice.management')
  } catch {
    /* ignore */
  }
}

log.transports.file.level = 'info'
log.transports.console.level = 'info'

function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message
  return String(err)
}

export function fatalStartup(err: unknown): void {
  const msg = errorText(err)
  log.error('startup failed', msg)
  try {
    const dir = join(tmpdir(), 'law-office-management')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'startup-error.txt'), msg, 'utf8')
  } catch {
    /* ignore */
  }
  const logFile = log.transports.file.getFile?.().path || ''
  const hint =
    /NODE_MODULE_VERSION|was compiled against|VCRUNTIME|The specified module could not be found/i.test(msg)
      ? '\n\nثبّت Microsoft Visual C++ Redistributable 2015-2022 (x64) من موقع مايكروسوفت، ثم أعد تشغيل الجهاز.'
      : ''
  try {
    dialog.showErrorBox(
      'تعذر تشغيل البرنامج',
      `${msg.slice(0, 1800)}${hint}${logFile ? `\n\nسجل الأخطاء:\n${logFile}` : ''}`
    )
  } catch {
    /* ignore */
  }
  app.exit(1)
}

process.on('uncaughtException', (err) => fatalStartup(err))
process.on('unhandledRejection', (err) => fatalStartup(err))

app.on('render-process-gone', (_e, _wc, details) => {
  fatalStartup(`انهار عرض الواجهة (${details.reason} / ${details.exitCode})`)
})
app.on('child-process-gone', (_e, details) => {
  if (details.type === 'GPU') {
    log.warn('gpu process gone', details.reason, details.exitCode)
  }
})
