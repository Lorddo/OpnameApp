<script setup lang="ts">
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { applyTheme, type ThemeId } from '@/lib/theme'
import { validateNewPassword } from '@/lib/password'
import { inputClass } from '@/lib/ui'
import { useAuthStore } from '@/stores/auth'
import { usePwaInstallStore } from '@/stores/pwa-install'

const { t, locale } = useI18n()
const auth = useAuthStore()
const install = usePwaInstallStore()
const { installed, canPrompt, showIosHint, showManualHint, prompting } = storeToRefs(install)

const password = ref('')
const confirm = ref('')
const submitting = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)

function setLocale(next: 'nl' | 'en') {
  locale.value = next
  document.documentElement.lang = next
}

function setTheme(theme: ThemeId) {
  applyTheme(theme)
}

async function onChangePassword() {
  message.value = null
  error.value = null
  const invalid = validateNewPassword(password.value, confirm.value)
  if (invalid === 'tooShort') {
    error.value = t('auth.passwordTooShort')
    return
  }
  if (invalid === 'mismatch') {
    error.value = t('auth.passwordMismatch')
    return
  }
  submitting.value = true
  try {
    await auth.updatePassword(password.value)
    password.value = ''
    confirm.value = ''
    message.value = t('auth.passwordUpdated')
  } catch {
    error.value = auth.error
  } finally {
    submitting.value = false
  }
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
          <Button :variant="locale === 'nl' ? 'brand' : 'outline'" @click="setLocale('nl')">
            {{ t('common.nl') }}
          </Button>
          <Button :variant="locale === 'en' ? 'brand' : 'outline'" @click="setLocale('en')">
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

    <div class="rounded-xl border border-border bg-card p-5">
      <p class="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('settings.install') }}
      </p>
      <p v-if="!installed" class="mb-4 text-sm text-muted-foreground">
        {{ t('pwa.installDescription') }}
      </p>
      <p v-if="installed" class="text-sm font-medium text-success">{{ t('pwa.installed') }}</p>
      <div v-else class="space-y-3">
        <p v-if="showIosHint" class="text-sm">{{ t('pwa.installIos') }}</p>
        <p v-else-if="showManualHint" class="text-sm">{{ t('pwa.installManual') }}</p>
        <Button
          v-if="canPrompt"
          variant="brand"
          :disabled="prompting"
          @click="install.promptInstall()"
        >
          {{ prompting ? t('pwa.installing') : t('pwa.installAction') }}
        </Button>
      </div>
    </div>

    <form
      class="max-w-lg space-y-4 rounded-xl border border-border bg-card p-5"
      @submit.prevent="onChangePassword"
    >
      <p class="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {{ t('settings.password') }}
      </p>
      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ t('auth.newPassword') }}</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          :class="inputClass"
        />
      </label>
      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ t('auth.confirmPassword') }}</span>
        <input
          v-model="confirm"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          :class="inputClass"
        />
      </label>
      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="message" class="text-sm text-success">{{ message }}</p>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? t('auth.savingPassword') : t('auth.savePassword') }}
      </Button>
    </form>
  </section>
</template>
