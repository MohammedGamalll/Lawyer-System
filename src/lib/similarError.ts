import { ApiError } from './api'

export type SimilarHit = {
  id: string
  client_number: string
  full_name: string
  national_id?: string | null
}

export function similarFromError(err: unknown): SimilarHit | null {
  const fe = err instanceof ApiError ? err.fieldErrors : (err as { fieldErrors?: Record<string, string> })?.fieldErrors
  if (fe?._similar) {
    try {
      return JSON.parse(fe._similar) as SimilarHit
    } catch {
      /* fall through */
    }
  }
  const msg = err instanceof Error ? err.message : String(err || '')
  const m = msg.match(/«([^»]+)»\s*\(كود\s*([^)]+)\)/)
  if (m) return { id: '', client_number: m[2], full_name: m[1] }
  if (msg.includes('هذا الاسم مسجل بالفعل') || msg.includes('هذا العميل مسجل من قبل')) {
    return { id: '', client_number: '', full_name: '' }
  }
  return null
}
