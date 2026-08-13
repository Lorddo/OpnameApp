/** Cloudflare Worker bindings for the OpnameApp API. */
export type Env = {
  PHOTOS_BUCKET: R2Bucket
  SUPABASE_URL: string
  /** Preferred: sb_publishable_... (legacy anon still accepted) */
  SUPABASE_PUBLISHABLE_KEY?: string
  SUPABASE_ANON_KEY?: string
  /** Preferred: sb_secret_... (legacy service_role still accepted) */
  SUPABASE_SECRET_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  /** Optional HS256 fallback for local/dev when JWKS is empty */
  SUPABASE_JWT_SECRET?: string
  CORS_ORIGIN?: string
  /** Where invite emails should land (PWA), e.g. https://app.example/login */
  INVITE_REDIRECT_URL?: string
}

export function supabasePublishableKey(env: Env): string {
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) is required')
  return key
}

export function supabaseSecretKey(env: Env): string {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) is required')
  return key
}
