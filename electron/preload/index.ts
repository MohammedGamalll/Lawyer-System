import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const listener = (_e: unknown, ...args: unknown[]) => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  channels: IPC
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
