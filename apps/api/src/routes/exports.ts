import { Hono } from 'hono'
import type { AppEnv } from '../index.js'
import { requireAuth } from '../middleware/auth.js'
import { dbForAuth, assertPropertyAccess } from '../lib/db.js'
import { ApiError } from '../lib/errors.js'
import {
  evaluateRoomCompleteness,
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
  if (error) throw new ApiError(500, 'db_error', error.message)
  if (!property) throw new ApiError(404, 'not_found', 'Property not found')

  const [floors, rooms, assets, inspections, observations, photos, facts] = await Promise.all([
    db.from('floors').select('*').eq('property_id', propertyId),
    db.from('rooms').select('*').eq('property_id', propertyId),
    db.from('assets').select('*').eq('property_id', propertyId),
    db
      .from('inspections')
      .select('*, inspection_template_pins(template_key, template_version)')
      .eq('property_id', propertyId),
    db.from('observations').select('*').eq('property_id', propertyId),
    db.from('photos').select('id, storage_provider, storage_key, observation_id, checksum, owner_org_id')
      .eq('property_id', propertyId),
    db.from('facts').select('*').eq('property_id', propertyId),
  ])

  const pins = (inspections.data ?? []).flatMap((inspection) => {
    const rows = (inspection.inspection_template_pins ?? []) as Array<{
      template_key: string
      template_version: string
    }>
    return rows.map((pin) => ({ inspectionId: inspection.id as string, ...pin }))
  })

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
    const roomCompleteness = (rooms.data ?? []).map((room) => {
      const answers: Record<string, unknown> = {}
      for (const obs of observations.data ?? []) {
        if (obs.subject_id !== room.id) continue
        const key = String(obs.attribute_key).split('.')[1]
        if (key) answers[key] = obs.value
      }
      const photosByAttribute: Record<string, number> = {}
      for (const photo of photos.data ?? []) {
        if (!photo.observation_id) continue
        const obs = (observations.data ?? []).find((o) => o.id === photo.observation_id)
        if (!obs || obs.subject_id !== room.id) continue
        const attr = String(obs.attribute_key)
        photosByAttribute[attr] = (photosByAttribute[attr] ?? 0) + 1
      }
      return evaluateRoomCompleteness(template, room.room_type, answers, photosByAttribute)
    })

    completeness[`${pin.template_key}@${pin.template_version}`] = {
      inspectionId: pin.inspectionId,
      rooms: roomCompleteness,
    }
  }

  return c.json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    property: property,
    floors: floors.data ?? [],
    rooms: rooms.data ?? [],
    assets: assets.data ?? [],
    inspections: inspections.data ?? [],
    observations: observations.data ?? [],
    facts: facts.data ?? [],
    photos: photos.data ?? [],
    completeness,
  })
})
