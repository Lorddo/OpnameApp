import { describe, expect, it } from 'vitest'
import {
  answersFromDossier,
  bundleHasStructure,
  chooseFlowStep,
  hydrateBundleFromLocal,
  shouldPreferLocalBundle,
  type InspectionDossierPayload,
} from './inspection-hydrate'

describe('chooseFlowStep', () => {
  it('opens the checklist when editing a completed inspection that has structure', () => {
    expect(
      chooseFlowStep({
        status: 'completed',
        hasStructure: true,
        keepStructureStep: false,
        editing: true,
      }),
    ).toBe(3)
  })

  it('stays on the structure step when floors or rooms are missing', () => {
    expect(
      chooseFlowStep({
        status: 'in_progress',
        hasStructure: false,
        keepStructureStep: false,
        editing: true,
      }),
    ).toBe(2)
  })

  it('shows the completed step only when not editing', () => {
    expect(
      chooseFlowStep({
        status: 'synced',
        hasStructure: true,
        keepStructureStep: false,
        editing: false,
      }),
    ).toBe(4)
  })
})

describe('shouldPreferLocalBundle', () => {
  it('does not prefer an empty local cache while online (synced pull has no floors/rooms)', () => {
    expect(
      shouldPreferLocalBundle({
        online: true,
        hasStructure: false,
        syncStatus: 'pending',
      }),
    ).toBe(false)
  })

  it('prefers local when structure exists and the inspection has pending writes', () => {
    expect(
      shouldPreferLocalBundle({
        online: true,
        hasStructure: true,
        syncStatus: 'pending',
      }),
    ).toBe(true)
  })
})

describe('answersFromDossier', () => {
  it('loads room answers from the dossier observations the user already saw', () => {
    const dossier: InspectionDossierPayload = {
      property: { postcode: '1234AB', house_number: '10', house_number_addition: null },
      floors: [{ id: 'f1', label: 'Begane grond', sort_order: 0 }],
      rooms: [{ id: 'r1', floor_id: 'f1', room_type: 'woonkamer', label: null }],
      inspections: [{ id: 'i1', status: 'completed' }],
      observations: [
        {
          id: 'o1',
          inspection_id: 'i1',
          subject_type: 'room',
          subject_id: 'r1',
          attribute_key: 'room.vloer',
          value: 'laminaat',
        },
      ],
      photos: [],
    }

    expect(bundleHasStructure(dossier.floors, dossier.rooms)).toBe(true)
    expect(answersFromDossier(dossier, 'i1')).toEqual({
      bySubject: { 'room:r1': { vloer: 'laminaat' } },
      obsIds: { 'room:r1|room.vloer': 'o1' },
    })
  })

  it('fills missing answers from facts when observations are empty', () => {
    const dossier: InspectionDossierPayload = {
      property: { id: 'p1', postcode: '1234AB', house_number: '10', house_number_addition: null },
      floors: [],
      rooms: [],
      inspections: [{ id: 'i1', status: 'in_progress' }],
      observations: [],
      facts: [
        {
          source_observation_id: 'o2',
          subject_type: 'room',
          subject_id: 'r1',
          attribute_key: 'room.wanden',
          value: 'stuc',
        },
      ],
      photos: [],
    }
    expect(answersFromDossier(dossier, 'i1')).toEqual({
      bySubject: { 'room:r1': { wanden: 'stuc' } },
      obsIds: { 'room:r1|room.wanden': 'o2' },
    })
  })

  it('lets inspection observations win over facts, including property answers', () => {
    const dossier: InspectionDossierPayload = {
      property: { id: 'p1', postcode: '1234AB', house_number: '10', house_number_addition: null },
      floors: [],
      rooms: [],
      inspections: [{ id: 'i1', status: 'in_progress' }],
      observations: [
        {
          id: 'o4',
          inspection_id: 'i1',
          subject_type: 'property',
          subject_id: 'p1',
          attribute_key: 'property.energieLabel',
          value: false,
        },
      ],
      facts: [
        {
          source_observation_id: 'o3',
          subject_type: 'property',
          subject_id: 'p1',
          attribute_key: 'property.energieLabel',
          value: true,
        },
        {
          source_observation_id: 'o5',
          subject_type: 'property',
          subject_id: 'p1',
          attribute_key: 'property.wozWaardeOnlineOphalen',
          value: true,
        },
      ],
      photos: [],
    }
    expect(answersFromDossier(dossier, 'i1')).toEqual({
      bySubject: {
        'property:p1': { energieLabel: false, wozWaardeOnlineOphalen: true },
      },
      obsIds: {
        'property:p1|property.energieLabel': 'o4',
        'property:p1|property.wozWaardeOnlineOphalen': 'o5',
      },
    })
  })
})

describe('hydrateBundleFromLocal', () => {
  it('maps a local Dexie bundle into hydrate shape', () => {
    const local = {
      inspection: {
        id: 'i1',
        propertyId: 'p1',
        status: 'in_progress',
        startedAt: null,
        completedAt: null,
        templates: [{ templateKey: 'bbmi', templateVersion: '1.0.0' }],
        updatedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
        lastSyncError: null,
      },
      property: {
        id: 'p1',
        postcode: '1234 AB',
        houseNumber: '10',
        houseNumberAddition: null,
        city: null,
        propertyType: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        syncStatus: 'synced' as const,
      },
      floors: [
        {
          id: 'f1',
          propertyId: 'p1',
          label: 'Begane grond',
          sortOrder: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced' as const,
        },
      ],
      rooms: [
        {
          id: 'r1',
          propertyId: 'p1',
          floorId: 'f1',
          roomType: 'woonkamer',
          label: null,
          sortOrder: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced' as const,
        },
      ],
      observations: [
        {
          id: 'o1',
          propertyId: 'p1',
          inspectionId: 'i1',
          attributeKey: 'room.vloer',
          subjectType: 'room' as const,
          subjectId: 'r1',
          value: 'laminaat',
          visibility: 'private' as const,
          deviceId: 'd1',
          updatedAt: '2026-01-01T00:00:00.000Z',
          syncStatus: 'synced' as const,
        },
      ],
      photos: [],
    }

    const bundle = hydrateBundleFromLocal(local)
    expect(bundle).toMatchObject({
      inspectionId: 'i1',
      propertyId: 'p1',
      postcode: '1234 AB',
      houseNumber: '10',
      answersBySubject: { 'room:r1': { vloer: 'laminaat' } },
      floors: [{ id: 'f1', label: 'Begane grond', sortOrder: 0 }],
    })
  })

  it('returns null when inspection or property is missing', () => {
    expect(hydrateBundleFromLocal({ inspection: null, property: null, floors: [], rooms: [], observations: [], photos: [] } as never)).toBeNull()
  })
})
