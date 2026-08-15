import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseSecretKey, type Env } from '../env.js'

export function createServiceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, supabaseSecretKey(env), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
