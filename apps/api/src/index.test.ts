import { describe, expect, it } from 'vitest'
import { createApp } from './index.js'

describe('API health', () => {
  it('returns ok on /api/health', async () => {
    const app = createApp()
    const res = await app.request('/api/health', undefined, {
      PHOTOS_BUCKET: {} as R2Bucket,
      SUPABASE_URL: 'http://localhost',
      SUPABASE_PUBLISHABLE_KEY: 'test',
      SUPABASE_SECRET_KEY: 'test',
      CORS_ORIGIN: '*',
    })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; service: string }
    expect(body.ok).toBe(true)
    expect(body.service).toBe('opnameapp-api')
  })
})
