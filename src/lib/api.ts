import type { IpcResult } from '@shared/ipc'
import { notifyDataChanged } from './bus'

export class ApiError extends Error {
  fieldErrors?: Record<string, string>
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message)
    this.fieldErrors = fieldErrors
  }
}

const MUTATION = /:(create|update|remove|upload|delete|move|archive|restore|setPermissions|attendance|leave|linkCase|link|addContact|removeContact|rename|reorder)$/

export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  let res: IpcResult<T>
  try {
    res = (await window.api.invoke(channel, ...args)) as IpcResult<T>
  } catch (e) {
    throw new ApiError((e as Error)?.message || 'فشل الاتصال بالنظام')
  }
  if (!res || typeof res !== 'object' || !('ok' in res)) {
    throw new ApiError('استجابة غير صالحة من النظام')
  }
  if (!res.ok) throw new ApiError(res.error, res.fieldErrors)
  if (MUTATION.test(channel)) notifyDataChanged()
  return res.data
}
