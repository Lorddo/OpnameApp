/** Cloudflare Worker bindings for the OpnameApp API. */
export type Env = {
  PHOTOS_BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_JWT_SECRET?: string
  CORS_ORIGIN?: string
}
