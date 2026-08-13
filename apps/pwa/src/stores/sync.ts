import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { db } from '@/db'
import { failedOutboxCount, pendingOutboxCount } from '@/db/outbox'
import { pullRemote } from '@/db/pull'
import { onSyncChange } from '@/db/sync-events'
import { flushOutbox } from '@/db/sync'
import type { SyncStatus } from '@/db/types'
import { useProjectsStore } from '@/stores/projects'

export type GlobalSyncState = 'offline' | 'idle' | 'pending' | 'syncing' | 'error'

export const useSyncStore = defineStore('sync', () => {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const syncing = ref(false)
  const pendingCount = ref(0)
  const failedCount = ref(0)
  const lastError = ref<string | null>(null)
  const lastSyncedAt = ref<string | null>(null)
  const lastPullAt = ref<string | null>(null)
  const inspectionSyncById = ref<Record<string, SyncStatus>>({})

  let started = false
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const globalState = computed<GlobalSyncState>(() => {
    if (!online.value) return 'offline'
    if (syncing.value) return 'syncing'
    if (failedCount.value > 0) return 'error'
    if (pendingCount.value > 0) return 'pending'
    return 'idle'
  })

  async function refresh() {
    pendingCount.value = await pendingOutboxCount()
    failedCount.value = await failedOutboxCount()
    const inspections = await db.inspections.toArray()
    const map: Record<string, SyncStatus> = {}
    for (const row of inspections) {
      map[row.id] = row.syncStatus
      if (row.syncStatus === 'error' && row.lastSyncError && !lastError.value) {
        lastError.value = row.lastSyncError
      }
    }
    inspectionSyncById.value = map
  }

  async function syncNow() {
    if (syncing.value) return
    online.value = navigator.onLine
    if (!online.value) {
      lastError.value = null
      await refresh()
      return
    }
    syncing.value = true
    lastError.value = null
    try {
      // 1) Push local outbox first
      let result = await flushOutbox()
      if (result.remaining > 0 && result.processed > 0) {
        result = await flushOutbox()
      }
      if (result.failed > 0) {
        const errored = await db.outbox.filter((i) => i.lastError != null).first()
        lastError.value = errored?.lastError ?? 'Sync failed'
      }

      // 2) Pull remote assignments / templates / properties
      let pull = await pullRemote()
      let guard = 0
      while (pull.truncated && guard < 5) {
        pull = await pullRemote()
        guard += 1
      }
      lastPullAt.value = new Date().toISOString()

      if (result.failed === 0) {
        lastSyncedAt.value = new Date().toISOString()
      }

      try {
        await useProjectsStore().loadAll()
      } catch {
        // Non-fatal: sync itself may have succeeded
      }
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
    } finally {
      syncing.value = false
      await refresh()
    }
  }

  function syncLabelForInspection(inspectionId: string, fallback?: string | null): SyncStatus {
    return inspectionSyncById.value[inspectionId] ?? (fallback as SyncStatus | undefined) ?? 'synced'
  }

  function start() {
    if (started || typeof window === 'undefined') return
    started = true
    online.value = navigator.onLine
    void refresh()
    void syncNow()

    window.addEventListener('online', () => {
      online.value = true
      void syncNow()
    })
    window.addEventListener('offline', () => {
      online.value = false
      void refresh()
    })
    onSyncChange(() => {
      void refresh()
    })
    pollTimer = setInterval(() => {
      void refresh()
    }, 8000)
  }

  function stop() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    started = false
  }

  return {
    online,
    syncing,
    pendingCount,
    failedCount,
    lastError,
    lastSyncedAt,
    lastPullAt,
    inspectionSyncById,
    globalState,
    refresh,
    syncNow,
    syncLabelForInspection,
    start,
    stop,
  }
})
