export function toUint8(data: unknown): Uint8Array {
  if (!data) return new Uint8Array()
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return Uint8Array.from(data as number[])
  if (typeof data === 'object') {
    const rec = data as { data?: unknown; type?: string }
    if (Array.isArray(rec.data)) return Uint8Array.from(rec.data as number[])
    const keys = Object.keys(rec).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b))
    if (keys.length) return Uint8Array.from(keys.map((k) => Number((rec as Record<string, number>)[k])))
  }
  return new Uint8Array()
}

export function downloadBytes(name: string, data: unknown, mime?: string) {
  const bytes = toUint8(data)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: mime || 'application/octet-stream' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
