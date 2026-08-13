import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabasePublishableKey, supabaseSecretKey, type Env } from '../env.js'

/** User-scoped client so PostgREST/RLS see auth.uid() + JWT claims. */
export function createUserClient(env: Env, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, supabasePublishableKey(env), {
    // Required: without this, supabase-js falls back to the publishable key as Bearer
    // and RLS helpers see auth.uid() = null.
    accessToken: async () => accessToken,
  })
}

export function createServiceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, supabaseSecretKey(env), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
