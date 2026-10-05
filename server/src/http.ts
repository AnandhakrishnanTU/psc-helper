import { PDFParse } from 'pdf-parse'

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (PSC Helper; job alert service)' }
const TIMEOUT_MS = 60_000
const RETRIES = 3

/** fetch with timeout and retries; the PSC site is often slow or briefly down. */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok) return res
      lastError = new Error(`HTTP ${res.status} for ${url}`)
      if (res.status < 500 && res.status !== 429) break // not worth retrying
    } catch (err) {
      lastError = err
    }
    if (attempt < RETRIES) await new Promise(r => setTimeout(r, attempt * 5000))
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchWithRetry(url)).text()
}

export async function fetchPdfText(url: string): Promise<string> {
  const data = new Uint8Array(await (await fetchWithRetry(url)).arrayBuffer())
  const parser = new PDFParse({ data })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}
