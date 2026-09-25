export function mapSyncError(message: string): string {
  const raw = String(message || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower.includes('invalid api key') || lower.includes('invalid jwt') || lower.includes('malformed jwt')) {
    return 'مفتاح المزامنة غير صالح. تواصل مع الدعم.'
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('enotfound')) {
    return 'تعذر الاتصال بخادم المزامنة. تحقق من الإنترنت ثم أعد المحاولة.'
  }
  return raw
}
