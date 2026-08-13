type SyncListener = () => void

const listeners = new Set<SyncListener>()

export function onSyncChange(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitSyncChange() {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // Ignore listener errors so one bad subscriber cannot break sync.
    }
  }
}
