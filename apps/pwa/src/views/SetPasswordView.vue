<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppLogo from '@/components/AppLogo.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const password = ref('')
const confirm = ref('')
const submitting = ref(false)
const localError = ref<string | null>(null)
const done = ref(false)

const isFirstSetup = route.query.reason === 'invite' || route.query.reason === 'recovery'

async function onSubmit() {
  localError.value = null
  if (password.value.length < 8) {
    localError.value = t('auth.passwordTooShort')
    return
  }
  if (password.value !== confirm.value) {
    localError.value = t('auth.passwordMismatch')
    return
  }

  submitting.value = true
  try {
    await auth.updatePassword(password.value)
    done.value = true
    await router.replace({ name: 'projects' })
  } catch {
    localError.value = auth.error
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <div>
      <AppLogo :size="64" decorative class="mb-4" />
      <h1 class="text-3xl font-bold text-brand">{{ t('app.name') }}</h1>
      <p class="mt-2 text-muted-foreground">
        {{ isFirstSetup ? t('auth.setPasswordSubtitle') : t('auth.changePasswordSubtitle') }}
      </p>
    </div>

    <form class="space-y-4 rounded-xl border border-border bg-card p-5" @submit.prevent="onSubmit">
      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ t('auth.newPassword') }}</span>
        <input
          v-model="password"
          type="password"
          required
          minlength="8"
          autocomplete="new-password"
          class="min-h-12 w-full rounded-lg border border-input bg-background px-4 text-base"
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
          class="min-h-12 w-full rounded-lg border border-input bg-background px-4 text-base"
        />
      </label>
      <p v-if="localError" class="text-sm text-destructive">{{ localError }}</p>
      <Button class="w-full" type="submit" :disabled="submitting || done">
        {{ submitting ? t('auth.savingPassword') : t('auth.savePassword') }}
      </Button>
    </form>
  </div>
</template>
