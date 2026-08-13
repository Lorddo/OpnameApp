import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !publishableKey) {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing — auth will fail until configured',
  )
}

export const supabase = createClient(
  url || 'http://127.0.0.1:54321',
  publishableKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      // Avoid background refresh races while offline; session still loads from storage.
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'opnameapp.auth',
    },
  },
)