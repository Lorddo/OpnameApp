<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { applyTheme, type ThemeId } from '@/lib/theme'

const { t, locale } = useI18n()

function setLocale(next: 'nl' | 'en') {
  locale.value = next
  document.documentElement.lang = next
}

function setTheme(theme: ThemeId) {
  applyTheme(theme)
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <h1 class="text-3xl font-bold sm:text-4xl">{{ t('settings.title') }}</h1>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-border bg-card p-5">
        <p class="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('settings.language') }}
        </p>
        <div class="flex flex-wrap gap-3">
          <Button
            :variant="locale === 'nl' ? 'brand' : 'outline'"
            @click="setLocale('nl')"
          >
            {{ t('common.nl') }}
          </Button>
          <Button
            :variant="locale === 'en' ? 'brand' : 'outline'"
            @click="setLocale('en')"
          >
            {{ t('common.en') }}
          </Button>
        </div>
      </div>

      <div class="rounded-xl border border-border bg-card p-5">
        <p class="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {{ t('settings.theme') }}
        </p>
        <div class="flex flex-wrap gap-3">
          <Button variant="brand" @click="setTheme('pranimate')">
            {{ t('settings.themePranimate') }}
          </Button>
          <Button variant="secondary" @click="setTheme('slate')">
            {{ t('settings.themeSlate') }}
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
