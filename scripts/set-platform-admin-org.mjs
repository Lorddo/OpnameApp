/**
 * Point an existing admin JWT at the platform org (keeps other memberships).
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EMAIL = (process.argv[2] || 'jordi@jbaudoin.nl').trim().toLowerCase()

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[trimmed.slice(0, eq).trim()] = value
  }
  return out
}

const env = {
  ...parseEnvFile(resolve(root, '.env')),
  ...parseEnvFile(resolve(root, 'apps/api/.dev.vars')),
}
const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !secret) {
  console.error('Missing SUPABASE_URL / SUPABASE_SECRET_KEY')
  process.exit(1)
}

const headers = {
  apikey: secret,
  Authorization: `Bearer ${secret}`,
  'Content-Type': 'application/json',
}

const orgsRes = await fetch(`${url}/rest/v1/organizations?select=id,name,org_type&org_type=eq.platform&limit=10`, {
  headers,
})
const orgs = await orgsRes.json()
const platform = (orgs ?? []).find((o) => o.org_type === 'platform')
if (!platform) {
  console.error('No platform organization found')
  process.exit(2)
}

const usersRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers })
const users = await usersRes.json()
const user = (users.users ?? []).find((u) => (u.email ?? '').toLowerCase() === EMAIL)
if (!user) {
  console.error('User not found:', EMAIL)
  process.exit(2)
}

const putRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    app_metadata: {
      ...(user.app_metadata ?? {}),
      org_id: platform.id,
      org_role: 'admin',
    },
  }),
})
if (!putRes.ok) {
  console.error('Update failed:', putRes.status, await putRes.text())
  process.exit(2)
}

await fetch(`${url}/rest/v1/org_members?on_conflict=org_id,user_id`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ org_id: platform.id, user_id: user.id, role: 'admin' }),
})

console.log('Active org set to', platform.name, platform.id)
console.log('Sign out and sign in again so the JWT refreshes.')
