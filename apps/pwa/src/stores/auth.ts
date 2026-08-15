import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import type { OrgType } from '@opnameapp/core'
import { bindLocalOwner } from '@/db/owner'
import { apiFetch } from '@/lib/api'
import { supabase } from '@/lib/supabase'

type MeResponse = {
  organization?: {
    id: string
    name: string
    orgType: OrgType
    externalId: string | null
  } | null
}

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

  const orgType = ref<OrgType | null>(null)
  const orgName = ref<string | null>(null)
  const profileReady = ref(false)

  const isAuthenticated = computed(() => Boolean(session.value?.access_token))
  const orgId = computed(() => (user.value?.app_metadata?.org_id as string | undefined) ?? null)
  const orgRole = computed(() => (user.value?.app_metadata?.org_role as string | undefined) ?? null)
  const isPlatformAdmin = computed(() => orgRole.value === 'admin' && orgType.value === 'platform')

  async function init() {
    if (ready.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        // Offline: getSession can hang on token refresh / locks — never block the shell.
        const { data } = await withTimeout(supabase.auth.getSession(), 2500)
        session.value = data.session
        user.value = data.session?.user ?? null
        if (data.session) {
          await bindWorkspace()
          await refreshProfile()
        } else profileReady.value = true
      } catch (err) {
        console.warn('[auth] init fell back to local/empty session', err)
        // Keep whatever we already have; router can still use cached session if set later.
        profileReady.value = true
      } finally {
        ready.value = true
      }

      supabase.auth.onAuthStateChange((_event, next) => {
        session.value = next
        user.value = next?.user ?? null
        if (next) {
          void bindWorkspace().then(() => refreshProfile())
        } else {
          orgType.value = null
          orgName.value = null
          profileReady.value = true
        }
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
    await bindWorkspace()
    await refreshProfile()
  }

  async function bindWorkspace() {
    const uid = user.value?.id
    const oid = orgId.value
    if (!uid || !oid) return
    await bindLocalOwner(uid, oid)
  }

  async function refreshProfile() {
    if (!session.value) {
      orgType.value = null
      orgName.value = null
      profileReady.value = true
      return
    }
    try {
      const me = await withTimeout(apiFetch<MeResponse>('/api/me'), 2500)
      orgType.value = me.organization?.orgType ?? null
      orgName.value = me.organization?.name ?? null
    } catch {
      orgType.value = null
      orgName.value = null
    } finally {
      profileReady.value = true
    }
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
    orgType.value = null
    orgName.value = null
    profileReady.value = true
  }

  return {
    session,
    user,
    ready,
    profileReady,
    error,
    isAuthenticated,
    orgId,
    orgRole,
    orgType,
    orgName,
    isPlatformAdmin,
    init,
    refreshProfile,
    signIn,
    updatePassword,
    signOut,
  }
})
