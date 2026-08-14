import { net } from 'electron'
import { isSyncConfigured } from './client'

export function isOnline(): boolean {
  try {
    return net.isOnline() && isSyncConfigured()
  } catch {
    return isSyncConfigured()
  }
}
