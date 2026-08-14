import type { ElectronApi } from '../../electron/preload/index'

declare global {
  interface Window {
    api: ElectronApi
  }
}

export {}
