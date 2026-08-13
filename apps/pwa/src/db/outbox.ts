import { cloneForIdb } from './clone'
import { db } from './index'
import { newId } from './ids'
import { emitSyncChange } from './sync-events'
import type { OutboxItem, OutboxOp } from './types'

export async function enqueueOutbox(
  op: OutboxOp,
  entityId: string,
  payload: unknown,
  dependsOn: string[] = [],
): Promise<OutboxItem> {
  const now = new Date().toISOString()
  const item: OutboxItem = {
    id: newId(),
    op,
    entityId,
    payload,
    dependsOn,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  }
  await db.outbox.put(cloneForIdb(item))
  emitSyncChange()
  return item
}

export async function listReadyOutbox(limit = 50): Promise<OutboxItem[]> {
  const now = new Date().toISOString()
  const all = await db.outbox.orderBy('createdAt').toArray()
  return all.filter((item) => item.nextAttemptAt <= now).slice(0, limit)
}

export async function markOutboxAttempt(id: string, error: string | null, retryDelayMs: number) {
  const item = await db.outbox.get(id)
  if (!item) return
  if (!error) {
    await db.outbox.delete(id)
    return
  }
  const attempts = item.attempts + 1
  await db.outbox.update(id, {
    attempts,
    lastError: error,
    nextAttemptAt: new Date(Date.now() + retryDelayMs).toISOString(),
  })
}

export async function pendingOutboxCount(): Promise<number> {
  return db.outbox.count()
}

export async function failedOutboxCount(): Promise<number> {
  const all = await db.outbox.toArray()
  return all.filter((item) => item.lastError != null && item.attempts > 0).length
}
