import type { SyncStatus } from './types'

/** Local rows that still have unpushed / failed / draft writes — do not overwrite from server. */
export function isBusySyncStatus(status: SyncStatus | string | null | undefined) {
  return status === 'pending' || status === 'error' || status === 'draft'
}
