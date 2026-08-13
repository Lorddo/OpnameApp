<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const message = ref(t('auth.callbackWorking'))
const error = ref<string | null>(null)

function linkType(): 'invite' | 'recovery' | 'other' {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const type = (hash.get('type') || query.get('type') || '').toLowerCase()
  if (type === 'invite' || type === 'signup') return 'invite'
  if (type === 'recovery') return 'recovery'
  return 'other'
}

onMounted(async () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const err =
    hash.get('error_description') ||
    hash.get('error') ||
    query.get('error_description') ||
    query.get('error')

  if (err) {
    error.value = decodeURIComponent(err.replace(/\+/g, ' '))
    message.value = t('auth.callbackFailed')
    return
  }

  const reason = linkType()

  // Capture PASSWORD_RECOVERY before getSession clears URL params
  let recoveryEvent = reason === 'recovery' || reason === 'invite'
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recoveryEvent = true
  })

  const { data, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    sub.subscription.unsubscribe()
    error.value = sessionError.message
    message.value = t('auth.callbackFailed')
    return
  }

  if (!data.session) {
    await new Promise((r) => setTimeout(r, 250))
    const again = await supabase.auth.getSession()
    if (!again.data.session) {
      sub.subscription.unsubscribe()
      error.value = t('auth.callbackNoSession')
      message.value = t('auth.callbackFailed')
      return
    }
  }

  sub.subscription.unsubscribe()
  await auth.init()

  if (recoveryEvent || reason === 'invite' || reason === 'recovery') {
    await router.replace({ name: 'set-password', query: { reason: reason === 'other' ? 'recovery' : reason } })
    return
  }

  await router.replace({ name: 'projects' })
})
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
    <h1 class="text-2xl font-bold">{{ t('auth.callbackTitle') }}</h1>
    <p class="text-muted-foreground">{{ message }}</p>
    <p v-if="error" class="text-destructive">{{ error }}</p>
    <RouterLink v-if="error" class="text-primary underline" :to="{ name: 'login' }">
      {{ t('login.submit') }}
    </RouterLink>
  </main>
</template>
