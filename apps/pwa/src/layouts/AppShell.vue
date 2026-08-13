<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const { t } = useI18n()
const auth = useAuthStore()
const sync = useSyncStore()
const { globalState, pendingCount, failedCount, lastError, syncing, online } = storeToRefs(sync)

onMounted(() => {
  sync.start()
})

async function logout() {
  await auth.signOut()
  window.location.href = '/login'
}

async function onSyncNow() {
  await sync.syncNow()
}
</script>

<template>
  <div class="min-h-dvh bg-background text-foreground">
    <header class="border-b border-border bg-brand text-brand-foreground">
      <div
        class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"
      >
        <div>
          <p class="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {{ t('app.name') }}
          </p>
          <p class="text-sm text-brand-foreground/80 sm:text-base">
            {{ t('app.tagline') }}
          </p>
        </div>
        <nav class="flex items-center gap-2">
          <RouterLink
            class="rounded-lg px-4 py-3 text-base font-semibold hover:bg-white/10"
            to="/"
          >
            {{ t('nav.projects') }}
          </RouterLink>
          <RouterLink
            class="rounded-lg px-4 py-3 text-base font-semibold hover:bg-white/10"
            to="/settings"
          >
            {{ t('nav.settings') }}
          </RouterLink>
          <Button variant="secondary" size="sm" @click="logout">{{ t('nav.logout') }}</Button>
        </nav>
      </div>
    </header>

    <div
      class="border-b border-border"
      :class="{
        'bg-muted': globalState === 'idle',
        'bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50':
          globalState === 'pending' || globalState === 'syncing',
        'bg-destructive/10 text-destructive': globalState === 'error',
        'bg-muted text-muted-foreground': globalState === 'offline',
      }"
    >
      <div
        class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
      >
        <div class="min-w-0 text-sm">
          <p class="font-medium">
            <template v-if="globalState === 'offline'">{{ t('sync.offline') }}</template>
            <template v-else-if="globalState === 'syncing'">{{ t('sync.syncing') }}</template>
            <template v-else-if="globalState === 'error'">
              {{ t('sync.error', { n: failedCount }) }}
            </template>
            <template v-else-if="globalState === 'pending'">
              {{ t('sync.pending', { n: pendingCount }) }}
            </template>
            <template v-else>{{ t('sync.idle') }}</template>
          </p>
          <p v-if="lastError && globalState === 'error'" class="truncate text-xs opacity-90">
            {{ lastError }}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          class="shrink-0 bg-background"
          :disabled="syncing || !online"
          @click="onSyncNow"
        >
          {{ syncing ? t('sync.syncing') : t('sync.now') }}
        </Button>
      </div>
    </div>

    <main class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
      <RouterView />
    </main>
  </div>
</template>
