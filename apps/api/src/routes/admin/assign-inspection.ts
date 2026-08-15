import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../../index.js'
import { createServiceClient } from '../../lib/supabase.js'
import { ApiError } from '../../lib/errors.js'
import {
  assertDashboardCaller,
  assertScope,
  findAuthUserByEmail,
  loadCallerOrg,
} from '../../lib/admin.js'
import { throwIfDbError } from '../../lib/db-result.js'
import { writeTemplatePins } from '../../lib/pins.js'
import { nlPostcodeSchema, templatePinSchema } from '../../lib/schemas.js'

export const assignInspectionRoutes = new Hono<AppEnv>()

const assignSchema = z.object({
  assignedUserId: z.string().uuid().optional(),
  assignedUserEmail: z.string().email().optional(),
  clientOrgId: z.string().uuid().optional().nullable(),
  templates: z.array(templatePinSchema).min(1),
  property: z.object({
    id: z.string().uuid().optional(),
    postcode: nlPostcodeSchema,
    houseNumber: z.string().min(1),
    houseNumberAddition: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    bagId: z.string().min(1).optional().nullable(),
    homeOrgId: z.string().uuid().optional(),
  }),
  inspection: z
    .object({
      id: z.string().uuid().optional(),
      status: z.enum(['draft', 'assigned', 'in_progress']).default('assigned'),
    })
    .default({ status: 'assigned' }),
  assignOrgAccess: z.boolean().default(true),
})

assignInspectionRoutes.post('/assign-inspection', async (c) => {
  const auth = c.get('auth')!
  assertDashboardCaller(auth)
  assertScope(auth, 'assignments:write')

  const body = assignSchema.parse(await c.req.json())
  const service = createServiceClient(c.env)
  const caller = await loadCallerOrg(c.env, auth)

  let ownerOrgId = auth.orgId
  if (caller.org_type === 'platform') {
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
        bag_id: body.property.bagId ?? null,
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single()
  throwIfDbError(propError, 400)

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
    throwIfDbError(assignError, 400)
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
  throwIfDbError(inspError, 400)

  await writeTemplatePins(service, inspectionId, body.templates, 'upsert')

  return c.json(
    {
      property,
      inspection,
      pins: body.templates,
    },
    201,
  )
})
