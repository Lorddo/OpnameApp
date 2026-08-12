export type ThemeId = 'pranimate' | 'slate'

const THEME_STORAGE_KEY = 'opnameapp.theme'

export function resolveTheme(hostname = window.location.hostname): ThemeId {
  // White-label hook: map hostnames to theme ids later.
  if (hostname.endsWith('.example-client.test')) {
    return 'slate'
  }
  return 'pranimate'
}

export function applyTheme(theme: ThemeId = resolveTheme()) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

export function loadStoredTheme(): ThemeId | null {
  const value = localStorage.getItem(THEME_STORAGE_KEY)
  if (value === 'pranimate' || value === 'slate') {
    return value
  }
  return null
}

export function initTheme() {
  applyTheme(loadStoredTheme() ?? resolveTheme())
}
