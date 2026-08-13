import { v7 as uuidv7 } from 'uuid'

/** Client-generated time-sortable UUID (v7) for offline-first creates. */
export function newId(): string {
  return uuidv7()
}
