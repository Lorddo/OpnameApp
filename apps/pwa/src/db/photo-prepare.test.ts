import { describe, expect, it } from 'vitest'
import { PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX, sha256Hex } from './photo-prepare'

describe('photo-prepare', () => {
  it('exposes field defaults', () => {
    expect(PHOTO_MAX_EDGE_PX).toBe(1920)
    expect(PHOTO_JPEG_QUALITY).toBeGreaterThan(0.5)
    expect(PHOTO_JPEG_QUALITY).toBeLessThanOrEqual(0.9)
  })

  it('hashes bytes stably', async () => {
    const a = await sha256Hex(new TextEncoder().encode('opname'))
    const b = await sha256Hex(new TextEncoder().encode('opname'))
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
