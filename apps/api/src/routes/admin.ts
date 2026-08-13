import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { createServiceClient } from '../lib/supabase.js'
import { ApiError } from '../lib/errors.js'
import {
  assertDashboardCaller,
  assertScope,
  ensureOrgMember,
  findAuthUserByEmail,
  loadCallerOrg,
} from '../lib/admin.js'

export const adminRoutes = new Hono<AppEnv>()
adminRoutes.use('*', requireAuth)

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
      /** Explicit org UUID — only allowed for platform callers or own org */
      id: z.string().uuid().optional(),
    })
    .optional(),
})

/**
 * Dashboard provisioning: ensure org + invite/link user + org_members + app_metadata.
 * Auth: API key (preferred) or org admin JWT.
 */
adminRoutes.post('/provision-inspector', async (c) => {
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
  // Must be allowlisted in Supabase Auth → URL Configuration
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

    // Fresh recovery link only — do not also call inviteUserByEmail (that invalidates this link).
    const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (linkError) throw new ApiError(400, 'auth_error', linkError.message)
    actionLink = linkData.properties?.action_link ?? null
  } else if (body.sendInvite) {
    // generateLink creates the user and returns the ONLY valid link.
    // Do not call inviteUserByEmail afterwards — it issues a new token and expires this one.
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

const assignSchema = z.object({
  assignedUserId: z.string().uuid().optional(),
  assignedUserEmail: z.string().email().optional(),
  clientOrgId: z.string().uuid().optional().nullable(),
  templates: z
    .array(
      z.object({
        templateKey: z.string().min(1),
        templateVersion: z.string().min(1),
      }),
    )
    .min(1),
  property: z.object({
    id: z.string().uuid().optional(),
    postcode: z.string().min(1),
    houseNumber: z.string().min(1),
    houseNumberAddition: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    homeOrgId: z.string().uuid().optional(),
  }),
  inspection: z
    .object({
      id: z.string().uuid().optional(),
      status: z.enum(['draft', 'assigned', 'in_progress']).default('assigned'),
    })
    .default({ status: 'assigned' }),
  /** When true, also create property_assignments for the inspection org */
  assignOrgAccess: z.boolean().default(true),
})

/**
 * Create property + inspection (+ optional org assignment) for dashboard dispatch.
 */
adminRoutes.post('/assign-inspection', async (c) => {
  const auth = c.get('auth')!
  assertDashboardCaller(auth)
  assertScope(auth, 'assignments:write')

  const body = assignSchema.parse(await c.req.json())
  const service = createServiceClient(c.env)
  const caller = await loadCallerOrg(c.env, auth)

  // Inspection owner org = caller's org (dashboard key scoped to inspection bureau),
  // unless caller is platform and homeOrgId/client points elsewhere — MVP: owner = auth.orgId
  // when caller is inspection; when platform, require organization via property.homeOrgId ownership.
  let ownerOrgId = auth.orgId
  if (caller.org_type === 'platform') {
    // Platform keys must target an inspection org via homeOrgId or we keep platform as owner (unusual).
    // Prefer: property.homeOrgId is client; owner is still the assigned inspection org.
    // For MVP platform dispatch, require assigned user and use that user's org from membership.
    if (!body.assignedUserId && !body.assignedUserEmail) {
      throw new ApiError(400, 'validation_error', 'assignedUserId or assignedUserEmail required for platform keys')
    }
  }

  let assignedUserId = body.assignedUserId ?? null
  if (!assignedUserId && body.assignedUserEmail) {
    const user = await findAuthUserByEmail(c.env, body.assignedUserEmail)
    if (!user) throw new ApiError(404, 'not_found', 'Assigned user email not found')
    assignedUserId = user.id
  }

  if (assignedUserId) {
    const { data: membership } = await service
      .from('org_members')
      .select('org_id')
      .eq('user_id', assignedUserId)
      .limit(1)
      .maybeSingle()

    if (caller.org_type === 'platform' && membership?.org_id) {
      ownerOrgId = membership.org_id as string
    } else if (caller.org_type !== 'platform' && membership && membership.org_id !== auth.orgId) {
      throw new ApiError(403, 'forbidden', 'Assigned user is not in caller organization')
    }
  }

  const homeOrgId = body.property.homeOrgId ?? ownerOrgId
  const propertyId = body.property.id ?? crypto.randomUUID()
  const inspectionId = body.inspection.id ?? crypto.randomUUID()

  const { data: property, error: propError } = await service
    .from('properties')
    .upsert(
      {
        id: propertyId,
        home_org_id: homeOrgId,
        created_by_org_id: auth.orgId,
        postcode: body.property.postcode,
        house_number: body.property.houseNumber,
        house_number_addition: body.property.houseNumberAddition ?? null,
        city: body.property.city ?? null,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()
  if (propError) throw new ApiError(400, 'db_error', propError.message)

  if (body.assignOrgAccess && ownerOrgId !== homeOrgId) {
    const { error: assignError } = await service.from('property_assignments').upsert(
      {
        property_id: propertyId,
        org_id: ownerOrgId,
        role: 'inspector',
        active_from: new Date().toISOString(),
        active_to: null,
      },
      { onConflict: 'property_id,org_id' },
    )
    if (assignError) throw new ApiError(400, 'db_error', assignError.message)
  }

  const { data: inspection, error: inspError } = await service
    .from('inspections')
    .upsert(
      {
        id: inspectionId,
        property_id: propertyId,
        owner_org_id: ownerOrgId,
        client_org_id: body.clientOrgId ?? (homeOrgId !== ownerOrgId ? homeOrgId : null),
        inspector_id: assignedUserId,
        assigned_user_id: assignedUserId,
        status: body.inspection.status,
        started_at: null,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()
  if (inspError) throw new ApiError(400, 'db_error', inspError.message)

  const pins = body.templates.map((t) => ({
    inspection_id: inspectionId,
    template_key: t.templateKey,
    template_version: t.templateVersion,
  }))
  const { error: pinError } = await service.from('inspection_template_pins').upsert(pins, {
    onConflict: 'inspection_id,template_key',
  })
  if (pinError) throw new ApiError(400, 'db_error', pinError.message)

  return c.json(
    {
      property,
      inspection,
      pins,
    },
    201,
  )
})

type OrgRow = {
  id: string
  tenant_id: string
  name: string
  org_type: 'inspection' | 'client' | 'platform'
  external_id: string | null
  _created?: boolean
}

async function resolveTargetOrg(
  service: ReturnType<typeof createServiceClient>,
  caller: Awaited<ReturnType<typeof loadCallerOrg>>,
  auth: { kind: string; orgId: string },
  organization:
    | {
        externalId?: string
        name?: string
        orgType?: 'inspection' | 'client' | 'platform'
        id?: string
      }
    | undefined,
): Promise<OrgRow> {
  // Same-org invite (no organization payload)
  if (!organization || (!organization.externalId && !organization.id && !organization.name)) {
    return { ...caller, _created: false }
  }

  if (organization.id) {
    if (organization.id !== caller.id && caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can provision into another org by id')
    }
    const { data, error } = await service
      .from('organizations')
      .select('id, tenant_id, name, org_type, external_id')
      .eq('id', organization.id)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)
    if (!data) throw new ApiError(404, 'not_found', 'Organization not found')
    if (data.tenant_id !== caller.tenant_id) {
      throw new ApiError(403, 'forbidden', 'Organization is outside caller tenant')
    }
    return { ...(data as OrgRow), _created: false }
  }

  if (organization.externalId) {
    const { data: existing, error } = await service
      .from('organizations')
      .select('id, tenant_id, name, org_type, external_id')
      .eq('tenant_id', caller.tenant_id)
      .eq('external_id', organization.externalId)
      .maybeSingle()
    if (error) throw new ApiError(500, 'db_error', error.message)

    if (existing) {
      if (existing.id !== caller.id && caller.org_type !== 'platform') {
        throw new ApiError(403, 'forbidden', 'Only platform keys can provision into another org')
      }
      if (organization.name && organization.name !== existing.name) {
        await service.from('organizations').update({ name: organization.name }).eq('id', existing.id)
        return { ...(existing as OrgRow), name: organization.name, _created: false }
      }
      return { ...(existing as OrgRow), _created: false }
    }

    if (caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can create organizations')
    }
    if (!organization.name) {
      throw new ApiError(400, 'validation_error', 'organization.name required when creating org')
    }

    const { data: created, error: createError } = await service
      .from('organizations')
      .insert({
        tenant_id: caller.tenant_id,
        name: organization.name,
        org_type: organization.orgType ?? 'inspection',
        external_id: organization.externalId,
      })
      .select('id, tenant_id, name, org_type, external_id')
      .single()
    if (createError) throw new ApiError(400, 'db_error', createError.message)
    return { ...(created as OrgRow), _created: true }
  }

  // Create by name only (platform)
  if (organization.name) {
    if (caller.org_type !== 'platform') {
      throw new ApiError(403, 'forbidden', 'Only platform keys can create organizations')
    }
    const { data: created, error: createError } = await service
      .from('organizations')
      .insert({
        tenant_id: caller.tenant_id,
        name: organization.name,
        org_type: organization.orgType ?? 'inspection',
      })
      .select('id, tenant_id, name, org_type, external_id')
      .single()
    if (createError) throw new ApiError(400, 'db_error', createError.message)
    return { ...(created as OrgRow), _created: true }
  }

  return { ...caller, _created: false }
}
