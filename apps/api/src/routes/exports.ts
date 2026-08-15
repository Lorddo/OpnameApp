import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth, assertPropertyAccess } from '../lib/db.js'
import { throwIfDbError, requireRow } from '../lib/db-result.js'
import { buildCompletenessMaps } from '../lib/inspection-readiness.js'
import { loadPropertyStructure } from '../lib/property-bundle.js'
import {
  evaluateTemplateCompleteness,
  parseInspectionTemplate,
  type InspectionTemplate,
} from '@opnameapp/core'

export const exportsRoutes = new Hono<AppEnv>()
exportsRoutes.use('*', requireAuth)

exportsRoutes.get('/properties/:id/dossier', async (c) => {
  const auth = c.get('auth')!
  const db = dbForAuth(c.env, auth)
  const propertyId = c.req.param('id')
  await assertPropertyAccess(db, auth, propertyId)

  const { data: property, error } = await db.from('properties').select('*').eq('id', propertyId).maybeSingle()
  throwIfDbError(error)
  requireRow(property, 'Property not found')

  const [{ floors, rooms, assets }, inspections, observations, photos, facts] = await Promise.all([
    loadPropertyStructure(db, propertyId),
    db
      .from('inspections')
      .select('*, inspection_template_pins(template_key, template_version)')
      .eq('property_id', propertyId),
    db.from('observations').select('*').eq('property_id', propertyId),
    db
      .from('photos')
      .select(
        'id, storage_provider, storage_key, observation_id, checksum, owner_org_id, uploaded_at, source_inspection_id',
      )
      .eq('property_id', propertyId),
    db.from('facts').select('*').eq('property_id', propertyId),
  ])

  throwIfDbError(inspections.error)
  throwIfDbError(observations.error)
  throwIfDbError(photos.error)
  throwIfDbError(facts.error)

  const pins = (inspections.data ?? []).flatMap((inspection) => {
    const rows = (inspection.inspection_template_pins ?? []) as Array<{
      template_key: string
      template_version: string
    }>
    return rows.map((pin) => ({
      inspectionId: inspection.id as string,
      ...pin,
    }))
  })

  const roomRows = rooms.map((room) => ({
    id: room.id as string,
    room_type: room.room_type as string,
  }))

  const completeness: Record<string, unknown> = {}
  for (const pin of pins) {
    const { data: templateRow } = await db
      .from('inspection_templates')
      .select('config')
      .eq('template_key', pin.template_key)
      .eq('version', pin.template_version)
      .maybeSingle()
    if (!templateRow?.config) continue

    const template = parseInspectionTemplate(templateRow.config) as InspectionTemplate
    const inspectionObs = (observations.data ?? []).filter((o) => o.inspection_id === pin.inspectionId)
    const inspectionPhotos = (photos.data ?? []).filter(
      (p) => p.source_inspection_id === pin.inspectionId,
    )
    const { answersByRoomId, photosByRoomId, propertyAnswers, propertyPhotos } =
      buildCompletenessMaps(
        roomRows,
        inspectionObs.map((o) => ({
          id: o.id as string,
          subject_id: o.subject_id as string,
          subject_type: (o.subject_type as string | undefined) ?? undefined,
          attribute_key: String(o.attribute_key),
          value: o.value,
        })),
        inspectionPhotos.map((p) => ({
          id: p.id as string,
          observation_id: (p.observation_id as string | null) ?? null,
          uploaded_at: (p.uploaded_at as string | null) ?? null,
        })),
        propertyId,
      )

    completeness[`${pin.template_key}@${pin.template_version}`] = {
      inspectionId: pin.inspectionId,
      ...evaluateTemplateCompleteness(
        template,
        roomRows.map((room) => ({ id: room.id, roomType: room.room_type })),
        answersByRoomId,
        photosByRoomId,
        { propertyAnswers, propertyPhotos },
      ),
    }
  }

  return c.json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    property,
    floors,
    rooms,
    assets,
    inspections: inspections.data ?? [],
    observations: observations.data ?? [],
    facts: facts.data ?? [],
    photos: photos.data ?? [],
    completeness,
  })
})
