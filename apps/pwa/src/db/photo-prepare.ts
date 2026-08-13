/** Client-side photo prep before Dexie / R2 upload. */

export const PHOTO_MAX_EDGE_PX = 1920
export const PHOTO_JPEG_QUALITY = 0.72

export type PreparedPhoto = {
  blob: Blob
  contentType: string
  checksum: string
  width: number
  height: number
}

function loadImageBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

function scaleSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function canvasToJpegBlob(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number) {
  if ('convertToBlob' in canvas) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Downscale + JPEG compress for field uploads.
 * Non-image blobs are returned as-is (checksum still computed).
 */
export async function preparePhotoForUpload(
  file: Blob,
  opts?: { maxEdgePx?: number; quality?: number },
): Promise<PreparedPhoto> {
  const maxEdge = opts?.maxEdgePx ?? PHOTO_MAX_EDGE_PX
  const quality = opts?.quality ?? PHOTO_JPEG_QUALITY
  const inputType = file.type || 'application/octet-stream'

  if (!inputType.startsWith('image/')) {
    const buffer = await file.arrayBuffer()
    return {
      blob: file,
      contentType: inputType,
      checksum: await sha256Hex(buffer),
      width: 0,
      height: 0,
    }
  }

  try {
    const bitmap = await loadImageBitmap(file)
    const { width, height } = scaleSize(bitmap.width, bitmap.height, maxEdge)

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height })

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('Canvas 2D unavailable')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await canvasToJpegBlob(canvas, quality)
    const buffer = await blob.arrayBuffer()
    return {
      blob,
      contentType: 'image/jpeg',
      checksum: await sha256Hex(buffer),
      width,
      height,
    }
  } catch {
    // Fallback: store original if decode/compress fails (HEIC on some desktops, etc.)
    const buffer = await file.arrayBuffer()
    return {
      blob: file,
      contentType: inputType,
      checksum: await sha256Hex(buffer),
      width: 0,
      height: 0,
    }
  }
}
