import { isSyncConfigured } from './client'

/** Chromium's net.isOnline() is often wrong on Windows; request failures mark errors. */
export function isOnline(): boolean {
  return isSyncConfigured()
}
