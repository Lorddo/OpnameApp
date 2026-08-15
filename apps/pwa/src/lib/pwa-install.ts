/** Minimal `beforeinstallprompt` surface — not in the default TypeScript DOM lib. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

export type MediaQueryLike = { matches: boolean }

export function isStandaloneDisplay(options?: {
  matchMedia?: (query: string) => MediaQueryLike
  standalone?: boolean
}): boolean {
  const matchMedia = options?.matchMedia ?? ((query: string) => window.matchMedia(query))
  if (matchMedia('(display-mode: standalone)').matches) return true
  return Boolean(
    options?.standalone ?? (navigator as Navigator & { standalone?: boolean }).standalone,
  )
}

export function isIosDevice(options?: {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}): boolean {
  const userAgent = options?.userAgent ?? navigator.userAgent
  const platform = options?.platform ?? navigator.platform
  const maxTouchPoints = options?.maxTouchPoints ?? navigator.maxTouchPoints
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true
  // iPadOS 13+ reports as MacIntel in Safari.
  return platform === 'MacIntel' && maxTouchPoints > 1
}
