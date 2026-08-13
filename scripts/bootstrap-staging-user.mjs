/**
 * One-shot staging bootstrap: tenant + inspection org + invite user.
 * Reads repo-root .env and apps/api/.dev.vars. Never prints secrets.
 *
 * Usage: node scripts/bootstrap-staging-user.mjs jordi@example.nl
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STAGING_REDIRECT = 'https://opnameapp-pwa.lorddo3066.workers.dev/auth/callback'
const TENANT_NAME = 'Pranimate'
const ORG_NAME = 'Staging inspectie'
const ORG_EXTERNAL_ID = 'staging-inspection'

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function loadEnv() {
  return {
    ...parseEnvFile(resolve(root, '.env')),
    ...parseEnvFile(resolve(root, 'apps/api/.dev.vars')),
  }
}

async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function restHeaders(secret, extra = {}) {
  return {
    apikey: secret,
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function rest(url, secret, path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: restHeaders(secret, {
      Prefer: method === 'GET' ? 'return=representation' : 'return=representation',
      ...headers,
    }),
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const msg = json?.message || json?.hint || json?.error_description || text || res.statusText
    throw new Error(`${method} ${path}: ${res.status} ${msg}`)
  }
  return json
}

async function authAdmin(url, secret, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/admin/${path}`, {
    method,
    headers: restHeaders(secret),
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`auth ${path}: ${res.status} ${json?.msg || json?.message || JSON.stringify(json)}`)
  }
  return json
}

const email = (process.argv[2] || '').trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/bootstrap-staging-user.mjs <email>')
  process.exit(1)
}

const env = loadEnv()
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY (or SERVICE_ROLE) in .env or apps/api/.dev.vars')
  process.exit(1)
}

let orgs
try {
  orgs = await rest(url, secret, 'organizations?select=id,name,org_type,external_id&limit=50')
} catch (err) {
  console.error('Remote schema probe failed:', err.message)
  console.error('Apply migrations first: npx supabase db push --linked')
  process.exit(2)
}

const tenants = await rest(url, secret, 'tenants?select=id,name&limit=50')
let tenantId
const existingTenant = (tenants ?? []).find((t) => t.name === TENANT_NAME) ?? tenants?.[0]
if (existingTenant) {
  tenantId = existingTenant.id
  console.log('Tenant exists:', existingTenant.name, tenantId)
} else {
  const created = await rest(url, secret, 'tenants', {
    method: 'POST',
    body: { name: TENANT_NAME },
    headers: { Prefer: 'return=representation' },
  })
  tenantId = created[0].id
  console.log('Created tenant:', TENANT_NAME, tenantId)
}

let org = (orgs ?? []).find((o) => o.external_id === ORG_EXTERNAL_ID || o.name === ORG_NAME)
if (!org) {
  const created = await rest(url, secret, 'organizations', {
    method: 'POST',
    body: {
      tenant_id: tenantId,
      name: ORG_NAME,
      org_type: 'inspection',
      external_id: ORG_EXTERNAL_ID,
    },
  })
  org = created[0]
  console.log('Created org:', org.name, org.id)
} else {
  console.log('Org exists:', org.name, org.id)
}

if (env.PLATFORM_ADMIN_API_KEY) {
  const rawKey = env.PLATFORM_ADMIN_API_KEY
  const parts = rawKey.split('_')
  if (parts[0] === 'opk' && parts[1]) {
    const prefix = parts[1]
    const existingKey = await rest(
      url,
      secret,
      `api_keys?select=id&key_prefix=eq.${prefix}&limit=1`,
    )
    if (!existingKey?.length) {
      const keyHash = await sha256Hex(rawKey)
      await rest(url, secret, 'api_keys', {
        method: 'POST',
        body: {
          org_id: org.id,
          name: 'staging-bootstrap',
          key_prefix: prefix,
          key_hash: keyHash,
          scopes: [],
        },
      })
      console.log('Stored hashed platform API key (prefix only):', prefix)
    } else {
      console.log('Platform API key already stored (prefix):', prefix)
    }
  }
}

const listed = await authAdmin(url, secret, 'users?page=1&per_page=200')
let user = (listed.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email)
const appMetadata = { org_id: org.id, org_role: 'admin' }
const displayName = email.split('@')[0]
let actionLink = null

if (user) {
  await authAdmin(url, secret, `users/${user.id}`, {
    method: 'PUT',
    body: {
      app_metadata: { ...(user.app_metadata ?? {}), ...appMetadata },
      user_metadata: { ...(user.user_metadata ?? {}), display_name: displayName },
      email_confirm: true,
    },
  })
  const linkData = await authAdmin(url, secret, 'generate_link', {
    method: 'POST',
    body: {
      type: 'recovery',
      email,
      redirect_to: STAGING_REDIRECT,
    },
  })
  actionLink = linkData.action_link ?? linkData.properties?.action_link ?? null
  console.log('Updated existing user:', user.id)
} else {
  const linkData = await authAdmin(url, secret, 'generate_link', {
    method: 'POST',
    body: {
      type: 'invite',
      email,
      data: { display_name: displayName },
      redirect_to: STAGING_REDIRECT,
    },
  })
  user = linkData.user
  actionLink = linkData.action_link ?? linkData.properties?.action_link ?? null
  if (!user?.id) {
    console.error('Invite did not return a user')
    process.exit(2)
  }
  await authAdmin(url, secret, `users/${user.id}`, {
    method: 'PUT',
    body: {
      app_metadata: appMetadata,
      user_metadata: { display_name: displayName },
      email_confirm: true,
    },
  })
  console.log('Created invited user:', user.id)
}

await rest(url, secret, 'profiles?on_conflict=id', {
  method: 'POST',
  body: { id: user.id, display_name: displayName },
  headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
})

await rest(url, secret, 'org_members?on_conflict=org_id,user_id', {
  method: 'POST',
  body: { org_id: org.id, user_id: user.id, role: 'admin' },
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
})

console.log('Member linked as admin in', ORG_NAME)
console.log('Redirect:', STAGING_REDIRECT)
console.log('---')
console.log('Open this link once (sets password). Re-running this script invalidates it:')
console.log(actionLink ?? '(no actionLink returned)')
