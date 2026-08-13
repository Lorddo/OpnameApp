<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const submitting = ref(false)

async function onSubmit() {
  submitting.value = true
  try {
    await auth.signIn(email.value, password.value)
    await router.push({ name: 'projects' })
  } catch {
    // auth.error is set
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <div>
      <h1 class="text-3xl font-bold text-brand">{{ t('app.name') }}</h1>
      <p class="mt-2 text-muted-foreground">{{ t('login.subtitle') }}</p>
    </div>

    <form class="space-y-4 rounded-xl border border-border bg-card p-5" @submit.prevent="onSubmit">
      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ t('login.email') }}</span>
        <input
          v-model="email"
          type="email"
          required
          autocomplete="username"
          class="min-h-12 w-full rounded-lg border border-input bg-background px-4 text-base"
        />
      </label>
      <label class="block space-y-2">
        <span class="text-sm font-medium">{{ t('login.password') }}</span>
        <input
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
          class="min-h-12 w-full rounded-lg border border-input bg-background px-4 text-base"
        />
      </label>
      <p v-if="auth.error" class="text-sm text-destructive">{{ auth.error }}</p>
      <Button class="w-full" type="submit" :disabled="submitting">
        {{ submitting ? t('login.submitting') : t('login.submit') }}
      </Button>
    </form>
  </div>
</template>
