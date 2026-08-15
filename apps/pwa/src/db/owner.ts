import { db } from './index'

export const LOCAL_OWNER_KEY = 'auth.owner'
export const LOCAL_OWNER_STORAGE_KEY = 'opnameapp.localOwner'

export function localOwnerId(userId: string, orgId: string): string {
  return `${userId}:${orgId}`
}

export function shouldClearLocalWorkspace(
  storedOwner: string | null,
  nextOwner: string,
  hasWorkspace: boolean,
): boolean {
  if (storedOwner === nextOwner) return false
  if (storedOwner != null) return true
  return hasWorkspace
}

function readStorageOwner(): string | null {
  try {
    return localStorage.getItem(LOCAL_OWNER_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStorageOwner(owner: string) {
  try {
    localStorage.setItem(LOCAL_OWNER_STORAGE_KEY, owner)
  } catch {
    // Private mode / quota — IDB marker is enough.
  }
}

export async function getBoundLocalOwner(): Promise<string | null> {
  const row = await db.syncMeta.get(LOCAL_OWNER_KEY)
  return row?.value ?? readStorageOwner()
}

export async function hasLocalWorkspace(): Promise<boolean> {
  const [properties, inspections, outbox] = await Promise.all([
    db.properties.count(),
    db.inspections.count(),
    db.outbox.count(),
  ])
  return properties > 0 || inspections > 0 || outbox > 0
}

export async function clearLocalWorkspace(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.properties,
      db.floors,
      db.rooms,
      db.inspections,
      db.observations,
      db.photos,
      db.photoBlobs,
      db.templates,
      db.outbox,
      db.syncMeta,
    ],
    async () => {
      await Promise.all([
        db.properties.clear(),
        db.floors.clear(),
        db.rooms.clear(),
        db.inspections.clear(),
        db.observations.clear(),
        db.photos.clear(),
        db.photoBlobs.clear(),
        db.templates.clear(),
        db.outbox.clear(),
        db.syncMeta.clear(),
      ])
    },
  )
}

export async function bindLocalOwner(
  userId: string,
  orgId: string,
): Promise<{ owner: string; switched: boolean }> {
  const next = localOwnerId(userId, orgId)
  const stored = (await db.syncMeta.get(LOCAL_OWNER_KEY))?.value ?? readStorageOwner()
  const switched = shouldClearLocalWorkspace(stored, next, await hasLocalWorkspace())
  if (switched) await clearLocalWorkspace()
  await db.syncMeta.put({ key: LOCAL_OWNER_KEY, value: next })
  writeStorageOwner(next)
  return { owner: next, switched }
}
