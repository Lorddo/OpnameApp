import { defineStore } from 'pinia'
import { ref } from 'vue'

export type HealthState = 'idle' | 'loading' | 'ok' | 'error'

export const useAppStore = defineStore('app', () => {
  const health = ref<HealthState>('idle')
  const healthDetail = ref<string>('')

  async function checkHealth() {
    health.value = 'loading'
    healthDetail.value = ''
    try {
      const base = import.meta.env.VITE_API_BASE_URL || ''
      const res = await fetch(`${base}/api/health`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const body = (await res.json()) as { ok?: boolean; service?: string }
      health.value = body.ok ? 'ok' : 'error'
      healthDetail.value = body.service ?? ''
    } catch (error) {
      health.value = 'error'
      healthDetail.value = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    health,
    healthDetail,
    checkHealth,
  }
})
