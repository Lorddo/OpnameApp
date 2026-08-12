<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app'

const { t } = useI18n()
const appStore = useAppStore()
const { health, healthDetail } = storeToRefs(appStore)

onMounted(() => {
  void appStore.checkHealth()
})
</script>

<template>
  <section class="space-y-4 lg:col-span-2">
    <h1 class="text-3xl font-bold sm:text-4xl">{{ t('home.title') }}</h1>
    <p class="max-w-2xl text-lg text-muted-foreground">{{ t('home.body') }}</p>

    <div class="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {{ t('home.health') }}
          </p>
          <p class="mt-1 text-xl font-semibold">
            <template v-if="health === 'loading'">{{ t('home.checking') }}</template>
            <template v-else-if="health === 'ok'">{{ t('home.healthOk') }}</template>
            <template v-else-if="health === 'error'">{{ t('home.healthFail') }}</template>
            <template v-else>—</template>
          </p>
          <p v-if="healthDetail" class="mt-1 text-sm text-muted-foreground">
            {{ healthDetail }}
          </p>
        </div>
        <Button variant="outline" @click="appStore.checkHealth()">
          {{ t('home.health') }}
        </Button>
      </div>
    </div>
  </section>
</template>
