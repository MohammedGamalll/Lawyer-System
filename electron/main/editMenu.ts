import { BrowserWindow, Menu } from 'electron'
import type { WebContents } from 'electron'

export function attachEditContextMenu(contents: WebContents, getWin: () => BrowserWindow | null): void {
  contents.on('context-menu', (_event, params) => {
    const { isEditable, editFlags, selectionText } = params
    if (!isEditable && !String(selectionText || '').trim()) return
    const template: Electron.MenuItemConstructorOptions[] = isEditable
      ? [
          { role: 'cut', label: 'قص', enabled: Boolean(editFlags.canCut) },
          { role: 'copy', label: 'نسخ', enabled: Boolean(editFlags.canCopy) },
          { role: 'paste', label: 'لصق', enabled: Boolean(editFlags.canPaste) },
          { type: 'separator' },
          { role: 'selectAll', label: 'تحديد الكل', enabled: Boolean(editFlags.canSelectAll) }
        ]
      : [{ role: 'copy', label: 'نسخ', enabled: Boolean(editFlags.canCopy) }]
    const menu = Menu.buildFromTemplate(template)
    const win = getWin()
    if (win && !win.isDestroyed()) menu.popup({ window: win })
    else menu.popup()
  })
}
