import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('auth_init_timeout')), ms)
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session | null>(null)
  const user = ref<User | null>(null)
  const ready = ref(false)
  const error = ref<string | null>(null)
  let initPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => Boolean(session.value?.access_token))
  const orgId = computed(() => (user.value?.app_metadata?.org_id as string | undefined) ?? null)
  const orgRole = computed(() => (user.value?.app_metadata?.org_role as string | undefined) ?? null)

  async function init() {
    if (ready.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        // Offline: getSession can hang on token refresh / locks — never block the shell.
        const { data } = await withTimeout(supabase.auth.getSession(), 2500)
        session.value = data.session
        user.value = data.session?.user ?? null
      } catch (err) {
        console.warn('[auth] init fell back to local/empty session', err)
        // Keep whatever we already have; router can still use cached session if set later.
      } finally {
        ready.value = true
      }

      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
        user.value = next?.user ?? null
      })
    })()

    return initPromise
  }

  async function signIn(email: string, password: string) {
    error.value = null
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      error.value = signInError.message
      throw signInError
    }
    session.value = data.session
    user.value = data.user
  }

  async function updatePassword(password: string) {
    error.value = null
    const { data, error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      error.value = updateError.message
      throw updateError
    }
    user.value = data.user
    return data.user
  }

  async function signOut() {
    await supabase.auth.signOut()
    session.value = null
    user.value = null
  }

  return {
    session,
    user,
    ready,
    error,
    isAuthenticated,
    orgId,
    orgRole,
    init,
    signIn,
    updatePassword,
    signOut,
  }
})
