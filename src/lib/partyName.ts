export function cleanPartyName(name: string) {
  return String(name || '')
    .replace(/^\s*(?:الموكل|الخصم)\s*[:\-–]?\s*/u, '')
    .trim()
}
