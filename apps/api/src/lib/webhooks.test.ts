import { describe, expect, it } from 'vitest'
import { parseInspectionTemplate } from '@opnameapp/core'
import bbmiTemplate from '../../../../templates/bbmi/bbmi-1.0.0.json'
import {
  dedupeKeyForCompletedAt,
  evaluateInspectionReadiness,
  type InspectionRow,
  type ObservationRow,
  type PhotoRow,
  type RoomRow,
} from './inspection-readiness.js'
import {
  buildCompletedPayload,
  nextAttemptAt,
  signPayload,
  WEBHOOK_BACKOFF_MS,
  WEBHOOK_MAX_ATTEMPTS,
} from './webhooks.js'

const bbmi = parseInspectionTemplate(bbmiTemplate)

function baseInspection(overrides: Partial<InspectionRow> = {}): InspectionRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    property_id: '22222222-2222-2222-2222-222222222222',
    owner_org_id: '33333333-3333-3333-3333-333333333333',
    client_org_id: null,
    status: 'completed',
    completed_at: '2026-08-14T10:11:58.002Z',
    inspection_template_pins: [{ template_key: 'bbmi', template_version: '1.0.0' }],
    ...overrides,
  }
}

describe('signPayload', () => {
  it('is deterministic for the same inputs', async () => {
    const a = await signPayload('test-secret', 1723631518, '{"type":"inspection.completed"}')
    const b = await signPayload('test-secret', 1723631518, '{"type":"inspection.completed"}')
    expect(a).toBe(b)
    expect(a).toMatch(/^t=1723631518,v1=[0-9a-f]{64}$/)
  })

  it('changes when body or timestamp changes', async () => {
    const base = await signPayload('test-secret', 100, 'body-a')
    const otherBody = await signPayload('test-secret', 100, 'body-b')
    const otherTs = await signPayload('test-secret', 101, 'body-a')
    expect(base).not.toBe(otherBody)
    expect(base).not.toBe(otherTs)
  })
})

describe('evaluateInspectionReadiness', () => {
  const room: RoomRow = { id: 'room-1', room_type: 'serre' }

  it('rejects when not completed', () => {
    const result = evaluateInspectionReadiness({
      inspection: baseInspection({ status: 'in_progress', completed_at: null }),
      rooms: [room],
      observations: [],
      photos: [],
      templates: [bbmi],
    })
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('not_completed')
  })

  it('rejects missing answers for visible questions', () => {
    const result = evaluateInspectionReadiness({
      inspection: baseInspection(),
      rooms: [room],
      observations: [],
      photos: [],
      templates: [bbmi],
    })
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('missing_answers')
  })

  it('rejects photos without uploaded_at', () => {
    const obs: ObservationRow = {
      id: 'obs-1',
      subject_id: 'room-1',
      attribute_key: 'room.afgeslotenRuimte',
      value: false,
    }
    const photo: PhotoRow = {
      id: 'photo-1',
      observation_id: 'obs-1',
      uploaded_at: null,
    }
    const result = evaluateInspectionReadiness({
      inspection: baseInspection(),
      rooms: [room],
      observations: [obs],
      photos: [photo],
      templates: [bbmi],
    })
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('photos_not_uploaded')
  })

  it('is ready when answers complete and photos uploaded (or none)', () => {
    const obs: ObservationRow = {
      id: 'obs-1',
      subject_id: 'room-1',
      attribute_key: 'room.afgeslotenRuimte',
      value: false,
    }
    const result = evaluateInspectionReadiness({
      inspection: baseInspection(),
      rooms: [room],
      observations: [obs],
      photos: [],
      templates: [bbmi],
    })
    expect(result.reasons).toEqual([])
    expect(result.ready).toBe(true)
  })

  it('flags template_not_found when pin has no template', () => {
    const result = evaluateInspectionReadiness({
      inspection: baseInspection({
        inspection_template_pins: [{ template_key: 'wws', template_version: '1.0.0' }],
      }),
      rooms: [],
      observations: [],
      photos: [],
      templates: [bbmi],
    })
    expect(result.ready).toBe(false)
    expect(result.reasons).toContain('template_not_found')
  })
})

describe('dedupeKeyForCompletedAt', () => {
  it('uses completed_at so reopen yields a new key', () => {
    const first = dedupeKeyForCompletedAt('2026-08-14T10:11:58.002Z')
    const second = dedupeKeyForCompletedAt('2026-08-14T12:00:00.000Z')
    expect(first).toBe('2026-08-14T10:11:58.002Z')
    expect(first).not.toBe(second)
  })
})

describe('nextAttemptAt / backoff', () => {
  it('returns null after max attempts', () => {
    expect(nextAttemptAt(WEBHOOK_MAX_ATTEMPTS)).toBeNull()
  })

  it('applies backoff schedule from attempt index', () => {
    const from = new Date('2026-08-14T00:00:00.000Z')
    expect(nextAttemptAt(0, from)?.toISOString()).toBe('2026-08-14T00:00:00.000Z')
    expect(nextAttemptAt(1, from)?.toISOString()).toBe('2026-08-14T00:01:00.000Z')
    expect(nextAttemptAt(2, from)?.toISOString()).toBe('2026-08-14T00:05:00.000Z')
    expect(WEBHOOK_BACKOFF_MS).toHaveLength(7)
  })
})

describe('buildCompletedPayload', () => {
  it('includes dossierUrl and revision', () => {
    const payload = buildCompletedPayload({
      eventId: 'evt-1',
      inspection: baseInspection(),
      photoCount: 2,
      revision: 2,
      dossierBaseUrl: 'https://api.example',
    })
    expect(payload.type).toBe('inspection.completed')
    expect(payload.revision).toBe(2)
    expect(payload.data.dossierUrl).toBe(
      'https://api.example/api/exports/properties/22222222-2222-2222-2222-222222222222/dossier',
    )
    expect(payload.data.templates).toEqual([{ templateKey: 'bbmi', templateVersion: '1.0.0' }])
  })
})
