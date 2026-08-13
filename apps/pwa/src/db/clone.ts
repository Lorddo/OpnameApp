import { isProxy, isRef, toRaw } from 'vue'

/**
 * IndexedDB structured-clone cannot store Vue reactive proxies.
 * Deep-unwrap then structuredClone so Dexie `put` receives plain data.
 */
export function cloneForIdb<T>(value: T): T {
  return structuredClone(unwrapVue(value))
}

function unwrapVue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (isRef(value)) return unwrapVue(value.value) as T

  const current = isProxy(value) ? toRaw(value) : value

  if (current instanceof Date || current instanceof Blob || current instanceof ArrayBuffer) {
    return current
  }

  if (Array.isArray(current)) {
    return current.map((item) => unwrapVue(item)) as T
  }

  if (typeof current === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(current as Record<string, unknown>)) {
      out[key] = unwrapVue(nested)
    }
    return out as T
  }

  return current
}
