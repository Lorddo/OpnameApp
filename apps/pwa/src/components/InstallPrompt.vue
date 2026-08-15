<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { usePwaInstallStore } from '@/stores/pwa-install'

const { t } = useI18n()
const install = usePwaInstallStore()
const { showBanner, prompting } = storeToRefs(install)
</script>

<template>
  <div
    v-if="showBanner"
    class="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg"
    role="status"
  >
    <p class="mb-3 text-sm font-medium">{{ t('pwa.installBanner') }}</p>
    <div class="flex flex-wrap gap-2">
      <Button size="sm" variant="brand" :disabled="prompting" @click="install.promptInstall()">
        {{ prompting ? t('pwa.installing') : t('pwa.installAction') }}
      </Button>
      <Button size="sm" variant="outline" @click="install.dismissBanner()">
        {{ t('pwa.dismiss') }}
      </Button>
    </div>
  </div>
</template>
