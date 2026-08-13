import { describe, expect, it } from 'vitest'
import { reactive, ref } from 'vue'
import { cloneForIdb } from './clone'

describe('cloneForIdb', () => {
  it('strips Vue proxies so IndexedDB structured clone can store the value', () => {
    const proxy = reactive({
      templates: [{ templateKey: 'bbmi', templateVersion: '0.1.0' }],
    })

    expect(() => structuredClone(proxy)).toThrowError(/could not be cloned|DataCloneError/i)

    const plain = cloneForIdb(proxy)
    expect(structuredClone(plain)).toEqual({
      templates: [{ templateKey: 'bbmi', templateVersion: '0.1.0' }],
    })
  })

  it('unwraps ref values and nested reactive objects', () => {
    const selected = ref([{ templateKey: 'bbmi', templateVersion: '0.1.0' }])
    const row = {
      id: 'insp-1',
      templates: selected.value,
    }

    const plain = cloneForIdb(row)
    expect(plain).toEqual({
      id: 'insp-1',
      templates: [{ templateKey: 'bbmi', templateVersion: '0.1.0' }],
    })
    expect(() => structuredClone(plain)).not.toThrow()
  })
})
