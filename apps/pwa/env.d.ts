/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_ENV: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_SUPABASE_URL: string
  /** Preferred: sb_publishable_... */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** Legacy alias for publishable / anon */
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_R2_PUBLIC_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
