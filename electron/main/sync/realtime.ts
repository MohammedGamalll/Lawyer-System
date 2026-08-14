import type { BrowserWindow } from 'electron'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { SYNC_TABLES } from '../db/schema'
import { applyRemoteWrite } from './applyRemote'
import { getSupabase } from './client'

let channel: RealtimeChannel | null = null

export function startRealtime(getWin: () => BrowserWindow | null): void {
  stopRealtime()
  const sb = getSupabase()
  if (!sb) return
  let ch = sb.channel('office-sync')
  for (const table of SYNC_TABLES) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      const row = (payload.new || payload.old) as Record<string, unknown> | null
      const event = payload.eventType === 'DELETE' ? 'DELETE' : payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE'
      applyRemoteWrite(table, row, event)
      getWin()?.webContents.send('sync:changed', { table })
    })
  }
  channel = ch.subscribe()
}

export function stopRealtime(): void {
  if (channel) {
    channel.unsubscribe()
    channel = null
  }
}
