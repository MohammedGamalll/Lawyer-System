import { ValidationError } from '@shared/schemas'
import { isValidationError } from '../services/personIdentity'

export function mapDbError(err: unknown): Error {
  if (isValidationError(err) || err instanceof ValidationError) return err as Error
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
  if (
    msg.includes('malformed') ||
    msg.includes('corrupt') ||
    msg.includes('disk image') ||
    msg.includes('file is not a database')
  ) {
    return new Error(
      'تعذر حفظ التعديل لأن ملف قاعدة البيانات تالف. أعد المحاولة، وإذا استمر أغلق البرنامج وافتحه مرة أخرى.'
    )
  }
  return err instanceof Error ? err : new Error(raw || 'حدث خطأ غير متوقع')
}
