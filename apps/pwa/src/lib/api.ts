import { supabase } from './supabase'

const apiBase = () => import.meta.env.VITE_API_BASE_URL || ''

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function authHeader(): Promise<HeadersInit> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new ApiClientError(401, 'unauthorized', 'Not signed in')
    return { Authorization: `Bearer ${token}` }
  } catch (err) {
    if (err instanceof ApiClientError) throw err
    throw new ApiClientError(
      401,
      'unauthorized',
      err instanceof Error ? err.message : 'Not signed in',
    )
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const auth = await authHeader()
  for (const [k, v] of Object.entries(auth)) headers.set(k, String(v))
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, headers })
  } catch (err) {
    throw new ApiClientError(
      0,
      'network_error',
      err instanceof Error ? err.message : 'Failed to fetch',
    )
  }
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string }
  }
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      json.error?.code ?? 'request_failed',
      json.error?.message ?? `Request failed (${res.status})`,
    )
  }
  return json as T
}

/** Binary PUT/POST (photo bytes). Does not force JSON Content-Type. */
export async function apiUpload(
  path: string,
  body: Blob | ArrayBuffer,
  contentType: string,
  method: 'PUT' | 'POST' = 'PUT',
): Promise<void> {
  const headers = new Headers({ 'Content-Type': contentType })
  const auth = await authHeader()
  for (const [k, v] of Object.entries(auth)) headers.set(k, String(v))

  const res = await fetch(`${apiBase()}${path}`, { method, headers, body })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    throw new ApiClientError(
      res.status,
      json.error?.code ?? 'upload_failed',
      json.error?.message ?? `Upload failed (${res.status})`,
    )
  }
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  const auth = await authHeader()
  for (const [k, v] of Object.entries(auth)) headers.set(k, String(v))

  const res = await fetch(`${apiBase()}${path}`, { headers })
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string }
    }
    throw new ApiClientError(
      res.status,
      json.error?.code ?? 'request_failed',
      json.error?.message ?? `Request failed (${res.status})`,
    )
  }
  return res.blob()
}
