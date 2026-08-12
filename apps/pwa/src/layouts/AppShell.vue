<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
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
        </nav>
      </div>
    </header>

    <main class="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
      <RouterView />
    </main>
  </div>
</template>
