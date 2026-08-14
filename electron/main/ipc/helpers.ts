import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { IpcResult } from '@shared/ipc'
import { getSession, hasPermission } from './session'
import { writeQueue } from '../queue/writeQueue'
import { ValidationError } from '@shared/schemas'
import { mapDbError } from '../utils/errors'
import log from 'electron-log'

export type AuthedUser = {
  id: string
  username: string
  fullName: string
  roleCode: string
  permissions: string[]
}

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

export function fail(error: string, fieldErrors?: Record<string, string>): IpcResult<never> {
  return { ok: false, error, fieldErrors }
}

export function handle(
  ipc: IpcMain,
  channel: string,
  options: {
    auth?: boolean
    permission?: string
    write?: boolean
  },
  fn: (event: IpcMainInvokeEvent, user: AuthedUser | null, ...args: unknown[]) => unknown
): void {
  ipc.handle(channel, async (event, ...args) => {
    try {
      let user: AuthedUser | null = null
      if (options.auth !== false) {
        user = getSession(event)
        if (!user) return fail('يجب تسجيل الدخول أولاً')
        if (options.permission && !hasPermission(user, options.permission)) {
          return fail('ليست لديك صلاحية تنفيذ هذا الإجراء')
        }
      }
      const run = () => fn(event, user, ...args)
      const result = options.write ? await writeQueue.enqueue(run) : run()
      return result
    } catch (err) {
      if (err instanceof ValidationError) {
        return fail(err.message, err.fieldErrors)
      }
      const mapped = mapDbError(err)
      log.error(channel, err)
      return fail(mapped.message)
    }
  })
}
