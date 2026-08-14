import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const listener = (_e: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  onUpdateProgress: (cb: (progress: { percent: number }) => void) => {
    const listener = (_e: unknown, progress: { percent: number }) => cb(progress)
    ipcRenderer.on('updater:progress', listener)
    return () => ipcRenderer.removeListener('updater:progress', listener)
  },
  channels: IPC
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
