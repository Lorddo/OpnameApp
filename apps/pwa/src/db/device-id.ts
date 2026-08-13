/** Stable per-install device id for sync/conflict metadata. */

const STORAGE_KEY = 'opnameapp.device_id'

export function getDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
