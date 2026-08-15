import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  isIosDevice,
  isStandaloneDisplay,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa-install'

const BANNER_DISMISS_KEY = 'opnameapp.pwa-install-banner-dismissed'

export const usePwaInstallStore = defineStore('pwa-install', () => {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installed = ref(false)
  const ios = ref(false)
  const bannerDismissed = ref(false)
  const prompting = ref(false)
  let started = false

  const canPrompt = computed(() => !installed.value && deferredPrompt.value !== null)
  const showBanner = computed(() => canPrompt.value && !bannerDismissed.value)
  const showIosHint = computed(() => !installed.value && ios.value)
  const showManualHint = computed(() => !installed.value && !ios.value && !canPrompt.value)

  function start() {
    if (started || typeof window === 'undefined') return
    started = true
    installed.value = isStandaloneDisplay()
    ios.value = isIosDevice()
    bannerDismissed.value = localStorage.getItem(BANNER_DISMISS_KEY) === '1'

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
  }

  function onBeforeInstallPrompt(event: Event) {
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
  }

  function onAppInstalled() {
    installed.value = true
    deferredPrompt.value = null
  }

  function dismissBanner() {
    bannerDismissed.value = true
    localStorage.setItem(BANNER_DISMISS_KEY, '1')
  }

  async function promptInstall() {
    const event = deferredPrompt.value
    if (!event) return
    prompting.value = true
    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      if (outcome === 'accepted') {
        installed.value = true
      }
      deferredPrompt.value = null
    } finally {
      prompting.value = false
    }
  }

  return {
    installed,
    ios,
    canPrompt,
    showBanner,
    showIosHint,
    showManualHint,
    prompting,
    start,
    dismissBanner,
    promptInstall,
  }
})
