import { apiFetchBlob } from '@/lib/api'
import { db } from '@/db'

/** Prefer a local photo blob; fall back to the network when online. */
export async function resolvePhotoPreviewUrl(photoId: string): Promise<string | null> {
  const localBlob = await db.photoBlobs.get(photoId)
  if (localBlob) return URL.createObjectURL(localBlob.blob)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null
  try {
    const blob = await apiFetchBlob(`/api/photos/${photoId}/content`)
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
