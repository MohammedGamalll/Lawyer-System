import { ValidationError } from '@shared/schemas'

export function mapDbError(err: unknown): Error {
  if (err instanceof ValidationError) return err
  const raw = err instanceof Error ? err.message : String(err)
  const msg = raw.toLowerCase()
  if (msg.includes('unique constraint') || msg.includes('unique')) {
    return new Error('هذه القيمة مستخدمة بالفعل ولا يمكن تكرارها')
  }
  if (msg.includes('foreign key')) {
    return new Error('لا يمكن إتمام العملية لوجود بيانات مرتبطة. تحقق من العلاقات أولاً')
  }
  if (msg.includes('not null')) {
    return new Error('حقل مطلوب غير مكتمل')
  }
  if (msg.includes('sqlite_busy') || msg.includes('database is locked')) {
    return new Error('قاعدة البيانات مشغولة حالياً. حاول مرة أخرى')
  }
  return err instanceof Error ? err : new Error(raw || 'حدث خطأ غير متوقع')
}
