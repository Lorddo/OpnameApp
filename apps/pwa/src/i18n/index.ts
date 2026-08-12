import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import nl from './locales/nl.json'

export type MessageSchema = typeof nl

export const i18n = createI18n<[MessageSchema], 'nl' | 'en'>({
  legacy: false,
  locale: 'nl',
  fallbackLocale: 'en',
  messages: {
    nl,
    en,
  },
})

export function setupI18n(app: App) {
  app.use(i18n)
}
