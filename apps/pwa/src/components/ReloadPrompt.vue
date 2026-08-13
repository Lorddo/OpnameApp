<script setup lang="ts">
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const CHECK_INTERVAL_MS = 60 * 60 * 1000

const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    window.setInterval(() => {
      void registration.update()
    }, CHECK_INTERVAL_MS)
  },
})

function dismiss() {
  offlineReady.value = false
  needRefresh.value = false
}

async function reload() {
  await updateServiceWorker(true)
}
</script>

<template>
  <div
    v-if="offlineReady || needRefresh"
    class="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg"
    role="status"
  >
    <p class="mb-3 text-sm font-medium">
      <template v-if="needRefresh">{{ t('pwa.updateAvailable') }}</template>
      <template v-else>{{ t('pwa.offlineReady') }}</template>
    </p>
    <div class="flex flex-wrap gap-2">
      <Button v-if="needRefresh" size="sm" variant="brand" @click="reload">
        {{ t('pwa.reload') }}
      </Button>
      <Button size="sm" variant="outline" @click="dismiss">
        {{ t('pwa.dismiss') }}
      </Button>
    </div>
  </div>
</template>
