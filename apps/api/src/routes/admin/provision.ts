import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../index.js'
import { createServiceClient } from '../../lib/supabase.js'
import { ApiError } from '../../lib/errors.js'
import {
  assertDashboardCaller,
  assertScope,
  ensureOrgMember,
  findAuthUserByEmail,
  loadCallerOrg,
  resolveTargetOrg,
} from '../../lib/admin.js'

export const provisionRoutes = new Hono<AppEnv>()

const provisionSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).optional(),
  role: z.enum(['inspector', 'admin']).default('inspector'),
  sendInvite: z.boolean().default(true),
  organization: z
    .object({
      externalId: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      orgType: z.enum(['inspection', 'client', 'platform']).default('inspection'),
      id: z.string().uuid().optional(),
    })
    .optional(),
})

provisionRoutes.post('/provision-inspector', async (c) => {
  const auth = c.get('auth')!
  assertDashboardCaller(auth)
  assertScope(auth, 'provision:users')

  const body = provisionSchema.parse(await c.req.json())
  const service = createServiceClient(c.env)
  const caller = await loadCallerOrg(c.env, auth)

  const org = await resolveTargetOrg(service, caller, auth, body.organization)

  const email = body.email.trim().toLowerCase()
  const displayName = body.displayName ?? email.split('@')[0]!
  const appMetadata = {
    org_id: org.id,
    org_role: body.role,
  }

  let userId: string
  let invited = false
  let created = false
  let actionLink: string | null = null
  let emailSent = false

  const existing = await findAuthUserByEmail(c.env, email)
  const redirectTo = c.env.INVITE_REDIRECT_URL || 'http://localhost:5173/auth/callback'

  if (existing) {
    userId = existing.id
    const { error } = await service.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...(existing.app_metadata ?? {}),
        ...appMetadata,
      },
      user_metadata: {
        ...(existing.user_metadata ?? {}),
        display_name: displayName,
      },
      email_confirm: true,
    })
    if (error) throw new ApiError(400, 'auth_error', error.message)

    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (linkError) throw new ApiError(400, 'auth_error', linkError.message)
    actionLink = linkData.properties?.action_link ?? null
  } else if (body.sendInvite) {
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { display_name: displayName },
        redirectTo,
      },
    })
    if (linkError || !linkData.user) {
      throw new ApiError(400, 'auth_error', linkError?.message ?? 'Invite link generation failed')
    }
    userId = linkData.user.id
    created = true
    invited = true
    actionLink = linkData.properties?.action_link ?? null

    const { error: metaError } = await service.auth.admin.updateUserById(userId, {
      app_metadata: appMetadata,
      user_metadata: { display_name: displayName },
      email_confirm: true,
    })
    if (metaError) throw new ApiError(400, 'auth_error', metaError.message)
    emailSent = false
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { display_name: displayName },
    })
    if (error || !data.user) {
      throw new ApiError(400, 'auth_error', error?.message ?? 'Create user failed')
    }
    userId = data.user.id
    created = true
  }

  await ensureOrgMember(service, org.id, userId, body.role)

  return c.json(
    {
      organization: {
        id: org.id,
        name: org.name,
        orgType: org.org_type,
        externalId: org.external_id,
        created: org._created === true,
      },
      user: {
        id: userId,
        email,
        role: body.role,
        created,
        invited,
        emailSent,
        actionLink,
        note: actionLink
          ? 'Open actionLink once immediately. Re-running provision invalidates previous links. Add the redirect URL in Supabase Auth → URL Configuration.'
          : undefined,
      },
    },
    created || org._created ? 201 : 200,
  )
})
