import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'
import { apiFetch } from '@/lib/api'
import { resolvePhotoPreviewUrl } from '@/lib/photo-preview'
import {
  loadTemplateConfigs as fetchTemplateConfigs,
  nextSelectedTemplates,
} from '@/lib/templates'
import { newId } from '@/db/ids'
import {
  addAssetLocal,
  addFloorLocal,
  addRoomLocal,
  cacheSyncedStructureLocal,
  completeInspectionLocal,
  createInspectionLocal,
  createPropertyLocal,
  getLocalInspectionBundle,
  removeAssetLocal,
  removeFloorLocal,
  removePhotoLocal,
  removeRoomLocal,
  reopenInspectionLocal,
  saveObservationsLocal,
  savePhotoLocal,
  updateInspectionTemplatesLocal,
} from '@/db/repository'
import type { InspectionTemplate, Visibility } from '@opnameapp/core'
import {
  applyNoneOfTheseDefaults,
  clearHiddenAnswers,
  clearHiddenAssetAnswers,
  clearHiddenQuestionAnswers,
  evaluateMergedAssetCompleteness,
  evaluateMergedPropertyCompleteness,
  evaluateMergedRoomCompleteness,
  evaluateTemplateCompleteness,
  exclusiveAssetTypeIdsForTemplate,
  exclusiveAttributeKeysForTemplate,
  exclusiveRoomTypeIdsForTemplate,
  formatNlPostcode,
  isCompleteNlPostcode,
  listMergedVisibleAssetQuestions,
  listMergedVisiblePropertyQuestions,
  listMergedVisibleQuestions,
  mergeTemplates,
  observationMapKey,
  parseSubjectAnswerKey,
  subjectAnswerKey,
} from '@opnameapp/core'
import {
  attributeQuestionKey,
  bundleHasStructure,
  chooseFlowStep,
  hydrateBundleFromApi,
  hydrateBundleFromDossier,
  hydrateBundleFromLocal,
  shouldPreferLocalBundle,
  type HydrateBundle,
  type InspectionDossierPayload,
} from '@/stores/inspection-hydrate'

const METERKAST_ROOM_TYPE_ID = 'meterkast'
const GEVEL_ASSET_TYPE = 'gevel'
const DAK_ASSET_TYPE = 'dak'
const VLOER_ASSET_TYPE = 'vloer'
export const PROPERTY_TAB_ID = '__property__'

const DEFAULT_GEVELS = [
  { zijde: 'voor', label: 'Voorgevel' },
  { zijde: 'linkerzij', label: 'Linkergevel' },
  { zijde: 'achter', label: 'Achtergevel' },
  { zijde: 'rechterzij', label: 'Rechtergevel' },
] as const

function compareRoomTypeOrder(a: { id: string; label: string }, b: { id: string; label: string }) {
  if (a.id === METERKAST_ROOM_TYPE_ID && b.id !== METERKAST_ROOM_TYPE_ID) return -1
  if (b.id === METERKAST_ROOM_TYPE_ID && a.id !== METERKAST_ROOM_TYPE_ID) return 1
  return a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' })
}

export type FlowPhoto = {
  id: string
  subjectType: 'property' | 'floor' | 'room' | 'asset'
  subjectId: string
  attributeKey: string
  observationId: string | null
  previewUrl: string | null
}

export const PRESET_FLOORS = [
  'Begane grond',
  '1e verdieping',
  '2e verdieping',
  '3e verdieping',
  'Zolder',
  'Kelder',
] as const

export const useInspectionFlowStore = defineStore('inspectionFlow', () => {
  const step = ref(1)
  const propertyId = ref<string | null>(null)
  const inspectionId = ref<string | null>(null)
  const postcodeInput = ref('')
  const postcode = computed({
    get: () => postcodeInput.value,
    set: (value: string) => {
      postcodeInput.value = formatNlPostcode(value)
    },
  })
  const postcodeIsComplete = computed(() => isCompleteNlPostcode(postcode.value))
  const houseNumber = ref('')
  const houseNumberAddition = ref('')
  const selectedTemplates = ref<Array<{ templateKey: string; templateVersion: string }>>([])
  const templateConfigs = ref<InspectionTemplate[]>([])
  const floors = ref<Array<{ id: string; label: string; sortOrder: number }>>([])
  const rooms = ref<
    Array<{ id: string; floorId: string; roomType: string; label: string | null }>
  >([])
  const assets = ref<
    Array<{ id: string; floorId: string | null; assetType: string; label: string | null }>
  >([])
  const activeFloorId = ref<string | null>(null)
  const answersBySubject = ref<Record<string, Record<string, unknown>>>({})
  /** Stable observation ids keyed by `${subjectType}:${subjectId}|${attributeKey}`. */
  const observationIdsByKey = ref<Record<string, string>>({})
  const photos = ref<FlowPhoto[]>([])
  const saving = ref(false)
  const loading = ref(false)
  const uploadingPhotoKey = ref<string | null>(null)
  const error = ref<string | null>(null)

  const merged = computed(() =>
    templateConfigs.value.length ? mergeTemplates(templateConfigs.value) : null,
  )

  const sortedRoomTypes = computed(() =>
    [...(merged.value?.roomTypes ?? [])].sort(compareRoomTypeOrder),
  )

  const activeFloor = computed(() => floors.value.find((f) => f.id === activeFloorId.value) ?? null)

  const floorAssetTypes = computed(() =>
    (merged.value?.assetTypes ?? []).filter((at) => at.location === 'floor'),
  )
  const propertyAssetTypes = computed(() =>
    (merged.value?.assetTypes ?? []).filter((at) => at.location === 'property'),
  )
  const hasRoomTypes = computed(() => (merged.value?.roomTypes.length ?? 0) > 0)
  const hasPropertyTab = computed(
    () =>
      (merged.value?.propertyQuestions.length ?? 0) > 0 || propertyAssetTypes.value.length > 0,
  )
  const isPropertyTab = computed(() => activeFloorId.value === PROPERTY_TAB_ID)

  const roomsOnActiveFloor = computed(() => {
    const labels = new Map(
      (merged.value?.roomTypes ?? []).map((rt) => [rt.id, rt.label] as const),
    )
    return rooms.value
      .map((room, index) => ({ room, index }))
      .filter(({ room }) => room.floorId === activeFloorId.value)
      .sort((a, b) => {
        const byType = compareRoomTypeOrder(
          { id: a.room.roomType, label: labels.get(a.room.roomType) ?? a.room.roomType },
          { id: b.room.roomType, label: labels.get(b.room.roomType) ?? b.room.roomType },
        )
        return byType !== 0 ? byType : a.index - b.index
      })
      .map(({ room }) => room)
  })

  const assetsOnActiveFloor = computed(() =>
    assets.value
      .filter((asset) => asset.floorId === activeFloorId.value)
      .slice()
      .sort((a, b) => {
        const typeOrder = floorAssetTypes.value.findIndex((at) => at.id === a.assetType)
          - floorAssetTypes.value.findIndex((at) => at.id === b.assetType)
        return typeOrder !== 0 ? typeOrder : a.id.localeCompare(b.id)
      }),
  )

  const propertyAssets = computed(() =>
    assets.value
      .filter((asset) => asset.floorId == null)
      .slice()
      .sort((a, b) => {
        const typeOrder = propertyAssetTypes.value.findIndex((at) => at.id === a.assetType)
          - propertyAssetTypes.value.findIndex((at) => at.id === b.assetType)
        return typeOrder !== 0 ? typeOrder : a.id.localeCompare(b.id)
      }),
  )

  function photosByAttributeForSubject(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
  ): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const photo of photos.value) {
      if (photo.subjectType !== subjectType || photo.subjectId !== subjectId) continue
      counts[photo.attributeKey] = (counts[photo.attributeKey] ?? 0) + 1
    }
    return counts
  }

  function propertyAnswers(): Record<string, unknown> {
    if (!propertyId.value) return {}
    return answersBySubject.value[subjectAnswerKey('property', propertyId.value)] ?? {}
  }

  function roomAnswers(roomId: string): Record<string, unknown> {
    return answersBySubject.value[subjectAnswerKey('room', roomId)] ?? {}
  }

  function assetAnswers(assetId: string): Record<string, unknown> {
    return answersBySubject.value[subjectAnswerKey('asset', assetId)] ?? {}
  }

  const propertyCompleteness = computed(() => {
    if (!merged.value) {
      return {
        visibleCount: 0,
        answeredCount: 0,
        missingAttributeKeys: [] as string[],
        missingPhotoAttributeKeys: [] as string[],
        isComplete: true,
      }
    }
    return evaluateMergedPropertyCompleteness(
      merged.value,
      propertyAnswers(),
      propertyId.value ? photosByAttributeForSubject('property', propertyId.value) : {},
    )
  })

  const roomCompleteness = computed(() => {
    if (!merged.value) return []
    const property = propertyAnswers()
    return rooms.value.flatMap((room) => {
      try {
        const result = evaluateMergedRoomCompleteness(
          merged.value!,
          room.roomType,
          roomAnswers(room.id),
          photosByAttributeForSubject('room', room.id),
          property,
        )
        return [
          {
            roomId: room.id,
            floorId: room.floorId,
            missingAttributeKeys: result.missingAttributeKeys,
            missingPhotoAttributeKeys: result.missingPhotoAttributeKeys,
            visibleCount: result.visibleCount,
            answeredCount: result.answeredCount,
          },
        ]
      } catch {
        return []
      }
    })
  })

  const assetCompleteness = computed(() => {
    if (!merged.value) return []
    const property = propertyAnswers()
    return assets.value.flatMap((asset) => {
      try {
        const result = evaluateMergedAssetCompleteness(
          merged.value!,
          asset.assetType,
          assetAnswers(asset.id),
          photosByAttributeForSubject('asset', asset.id),
          property,
        )
        return [
          {
            assetId: asset.id,
            floorId: asset.floorId,
            missingAttributeKeys: result.missingAttributeKeys,
            missingPhotoAttributeKeys: result.missingPhotoAttributeKeys,
            visibleCount: result.visibleCount,
            answeredCount: result.answeredCount,
          },
        ]
      } catch {
        return []
      }
    })
  })

  const missingAnswerCount = computed(
    () =>
      propertyCompleteness.value.missingAttributeKeys.length +
      roomCompleteness.value.reduce((sum, room) => sum + room.missingAttributeKeys.length, 0) +
      assetCompleteness.value.reduce((sum, asset) => sum + asset.missingAttributeKeys.length, 0),
  )

  const missingPhotoCount = computed(
    () =>
      propertyCompleteness.value.missingPhotoAttributeKeys.length +
      roomCompleteness.value.reduce((sum, room) => sum + room.missingPhotoAttributeKeys.length, 0) +
      assetCompleteness.value.reduce((sum, asset) => sum + asset.missingPhotoAttributeKeys.length, 0),
  )

  const requiredVloerMissing = computed(() => {
    if (!merged.value?.assetTypes?.some((at) => at.id === VLOER_ASSET_TYPE)) return false
    if (propertyAnswers().onderkant !== 'grond') return false
    return !assets.value.some((asset) => asset.assetType === VLOER_ASSET_TYPE)
  })

  const answersComplete = computed(
    () =>
      (!hasRoomTypes.value || rooms.value.length > 0) &&
      !requiredVloerMissing.value &&
      missingAnswerCount.value === 0 &&
      missingPhotoCount.value === 0,
  )

  const templateCompleteness = computed(() =>
    templateConfigs.value.map((tpl) =>
      evaluateTemplateCompleteness(
        tpl,
        rooms.value.map((room) => ({ id: room.id, roomType: room.roomType })),
        Object.fromEntries(rooms.value.map((room) => [room.id, roomAnswers(room.id)] as const)),
        Object.fromEntries(
          rooms.value.map(
            (room) => [room.id, photosByAttributeForSubject('room', room.id)] as const,
          ),
        ),
        {
          propertyAnswers: propertyAnswers(),
          propertyPhotos: propertyId.value
            ? photosByAttributeForSubject('property', propertyId.value)
            : {},
          assets: assets.value.map((asset) => ({ id: asset.id, assetType: asset.assetType })),
          answersByAssetId: Object.fromEntries(
            assets.value.map((asset) => [asset.id, assetAnswers(asset.id)] as const),
          ),
          photosByAssetId: Object.fromEntries(
            assets.value.map(
              (asset) => [asset.id, photosByAttributeForSubject('asset', asset.id)] as const,
            ),
          ),
        },
      ),
    ),
  )

  function missingKeysForSubject(subjectType: FlowPhoto['subjectType'], subjectId: string) {
    if (subjectType === 'property') return propertyCompleteness.value.missingAttributeKeys
    if (subjectType === 'asset') {
      return (
        assetCompleteness.value.find((asset) => asset.assetId === subjectId)?.missingAttributeKeys ??
        []
      )
    }
    return roomCompleteness.value.find((room) => room.roomId === subjectId)?.missingAttributeKeys ?? []
  }

  function missingPhotoKeysForSubject(subjectType: FlowPhoto['subjectType'], subjectId: string) {
    if (subjectType === 'property') return propertyCompleteness.value.missingPhotoAttributeKeys
    if (subjectType === 'asset') {
      return (
        assetCompleteness.value.find((asset) => asset.assetId === subjectId)
          ?.missingPhotoAttributeKeys ?? []
      )
    }
    return (
      roomCompleteness.value.find((room) => room.roomId === subjectId)?.missingPhotoAttributeKeys ??
      []
    )
  }

  function missingKeysForRoom(roomId: string) {
    return missingKeysForSubject('room', roomId)
  }

  function missingPhotoKeysForRoom(roomId: string) {
    return missingPhotoKeysForSubject('room', roomId)
  }

  function floorHasMissingAnswers(floorId: string) {
    const roomsMissing = roomCompleteness.value.some(
      (room) =>
        room.floorId === floorId &&
        (room.missingAttributeKeys.length > 0 || room.missingPhotoAttributeKeys.length > 0),
    )
    const assetsMissing = assetCompleteness.value.some(
      (asset) =>
        asset.floorId === floorId &&
        (asset.missingAttributeKeys.length > 0 || asset.missingPhotoAttributeKeys.length > 0),
    )
    return roomsMissing || assetsMissing
  }

  const propertyTabHasMissing = computed(() => {
    const propMissing =
      propertyCompleteness.value.missingAttributeKeys.length > 0 ||
      propertyCompleteness.value.missingPhotoAttributeKeys.length > 0
    const assetsMissing = assetCompleteness.value.some(
      (asset) =>
        asset.floorId == null &&
        (asset.missingAttributeKeys.length > 0 || asset.missingPhotoAttributeKeys.length > 0),
    )
    return propMissing || assetsMissing
  })

  const structureHints = computed(() => {
    const hints: string[] = []
    const view = merged.value
    if (!view?.assetTypes?.length) return hints
    const gevelType = view.assetTypes.find((at) => at.id === GEVEL_ASSET_TYPE)
    const dakType = view.assetTypes.find((at) => at.id === DAK_ASSET_TYPE)
    const vloerType = view.assetTypes.find((at) => at.id === VLOER_ASSET_TYPE)
    if (gevelType) {
      for (const floor of floors.value) {
        const hasGevel = assets.value.some(
          (asset) => asset.floorId === floor.id && asset.assetType === GEVEL_ASSET_TYPE,
        )
        if (!hasGevel) hints.push(`hintNoFacades:${floor.id}`)
      }
    }
    if (dakType) {
      const bovenkant = propertyAnswers().bovenkant
      const hasDak = assets.value.some((asset) => asset.assetType === DAK_ASSET_TYPE)
      if (bovenkant === 'buiten' && !hasDak) hints.push('hintRoofOutside')
      if (bovenkant === 'verwarmdeRuimte') hints.push('hintRoofHeated')
    }
    if (vloerType && propertyAnswers().onderkant === 'grond') {
      const hasVloer = assets.value.some((asset) => asset.assetType === VLOER_ASSET_TYPE)
      if (!hasVloer) hints.push('hintFloorGround')
    }
    return hints
  })

  function photosForQuestion(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
    attributeKey: string,
  ) {
    return photos.value.filter(
      (p) =>
        p.subjectType === subjectType && p.subjectId === subjectId && p.attributeKey === attributeKey,
    )
  }

  function revokePhotoPreviews() {
    for (const photo of photos.value) {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    }
  }

  function questionsForRoom(roomId: string) {
    if (!merged.value) return []
    const room = rooms.value.find((r) => r.id === roomId)
    if (!room) return []
    return listMergedVisibleQuestions(
      merged.value,
      room.roomType,
      roomAnswers(roomId),
      propertyAnswers(),
    )
  }

  function questionsForProperty() {
    if (!merged.value) return []
    return listMergedVisiblePropertyQuestions(merged.value, propertyAnswers())
  }

  function questionsForAsset(assetId: string) {
    if (!merged.value) return []
    const asset = assets.value.find((a) => a.id === assetId)
    if (!asset) return []
    return listMergedVisibleAssetQuestions(
      merged.value,
      asset.assetType,
      assetAnswers(assetId),
      propertyAnswers(),
    )
  }

  function writeSubjectAnswers(subjectKey: string, answers: Record<string, unknown>) {
    answersBySubject.value = { ...answersBySubject.value, [subjectKey]: answers }
  }

  function fillChecklistDefaults(roomId?: string) {
    const view = merged.value
    if (!view) return
    if (propertyId.value) {
      const key = subjectAnswerKey('property', propertyId.value)
      const current = answersBySubject.value[key] ?? {}
      const filled = applyNoneOfTheseDefaults(questionsForProperty(), current)
      if (filled !== current) writeSubjectAnswers(key, filled)
    }
    const targets = roomId ? rooms.value.filter((room) => room.id === roomId) : rooms.value
    for (const room of targets) {
      const key = subjectAnswerKey('room', room.id)
      const current = answersBySubject.value[key] ?? {}
      const filled = applyNoneOfTheseDefaults(questionsForRoom(room.id), current)
      if (filled !== current) writeSubjectAnswers(key, filled)
    }
    for (const asset of assets.value) {
      const key = subjectAnswerKey('asset', asset.id)
      const current = answersBySubject.value[key] ?? {}
      const filled = applyNoneOfTheseDefaults(questionsForAsset(asset.id), current)
      if (filled !== current) writeSubjectAnswers(key, filled)
    }
  }

  function reset() {
    revokePhotoPreviews()
    step.value = 1
    propertyId.value = null
    inspectionId.value = null
    postcode.value = ''
    houseNumber.value = ''
    houseNumberAddition.value = ''
    selectedTemplates.value = []
    templateConfigs.value = []
    floors.value = []
    rooms.value = []
    assets.value = []
    activeFloorId.value = null
    answersBySubject.value = {}
    observationIdsByKey.value = {}
    photos.value = []
    uploadingPhotoKey.value = null
    error.value = null
  }

  async function loadTemplateConfigs() {
    templateConfigs.value = await fetchTemplateConfigs(selectedTemplates.value)
  }

  async function persistSelectedTemplates() {
    if (!inspectionId.value) return
    await updateInspectionTemplatesLocal(inspectionId.value, selectedTemplates.value)
  }

  async function discardAnswersForAttributeKeys(attributeKeys: string[]) {
    if (!attributeKeys.length) return
    const keySet = new Set(attributeKeys)
    const questionKeys = new Set(attributeKeys.map(attributeQuestionKey))

    const nextAnswers: Record<string, Record<string, unknown>> = {}
    for (const [subjectKey, answers] of Object.entries(answersBySubject.value)) {
      const filtered = Object.fromEntries(
        Object.entries(answers).filter(([questionKey]) => !questionKeys.has(questionKey)),
      )
      nextAnswers[subjectKey] = filtered
    }
    answersBySubject.value = nextAnswers

    const nextObs = { ...observationIdsByKey.value }
    const droppedObs: Array<{
      id: string
      subjectType: FlowPhoto['subjectType']
      subjectId: string
      attributeKey: string
    }> = []
    for (const [mapKey, obsId] of Object.entries(nextObs)) {
      const sep = mapKey.indexOf('|')
      const subjectPart = mapKey.slice(0, sep)
      const attributeKey = mapKey.slice(sep + 1)
      if (!keySet.has(attributeKey)) continue
      const parsed = parseSubjectAnswerKey(subjectPart)
      if (!parsed) continue
      droppedObs.push({
        id: obsId,
        subjectType: parsed.subjectType as FlowPhoto['subjectType'],
        subjectId: parsed.subjectId,
        attributeKey,
      })
      delete nextObs[mapKey]
    }
    observationIdsByKey.value = nextObs

    const removedPhotos = photos.value.filter((p) => keySet.has(p.attributeKey))
    for (const photo of removedPhotos) {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    }
    photos.value = photos.value.filter((p) => !keySet.has(p.attributeKey))

    if (droppedObs.length && propertyId.value && inspectionId.value) {
      await saveObservationsLocal(
        droppedObs.map((o) => ({
          id: o.id,
          propertyId: propertyId.value!,
          inspectionId: inspectionId.value!,
          attributeKey: o.attributeKey,
          subjectType: o.subjectType,
          subjectId: o.subjectId,
          value: null,
          visibility: 'private',
        })),
      )
    }
  }

  const selectedTemplateKeys = computed(() =>
    selectedTemplates.value.map((row) => row.templateKey),
  )

  async function setTemplateEnabled(
    templateKey: string,
    templateVersion: string,
    enabled: boolean,
  ) {
    const next = nextSelectedTemplates(
      selectedTemplates.value,
      { templateKey, templateVersion },
      enabled,
    )
    if (!next) return

    if (!inspectionId.value) {
      selectedTemplates.value = next
      return
    }

    saving.value = true
    error.value = null
    const previous = selectedTemplates.value
    const previousConfigs = templateConfigs.value
    try {
      if (!enabled) {
        const mergedView = merged.value
        const exclusiveKeys = mergedView
          ? exclusiveAttributeKeysForTemplate(mergedView, templateKey)
          : []
        const exclusiveRoomTypes = mergedView
          ? exclusiveRoomTypeIdsForTemplate(mergedView, templateKey)
          : []
        const exclusiveAssetTypes = mergedView
          ? exclusiveAssetTypeIdsForTemplate(mergedView, templateKey)
          : []
        for (const room of rooms.value.filter((r) => exclusiveRoomTypes.includes(r.roomType))) {
          await removeRoom(room.id)
        }
        for (const asset of assets.value.filter((a) => exclusiveAssetTypes.includes(a.assetType))) {
          await removeAsset(asset.id)
        }
        await discardAnswersForAttributeKeys(exclusiveKeys)
      }
      selectedTemplates.value = next
      await loadTemplateConfigs()
      if (enabled) fillChecklistDefaults()
      await persistSelectedTemplates()
    } catch (err) {
      selectedTemplates.value = previous
      templateConfigs.value = previousConfigs
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
    if (enabled) {
      await ensureDefaultFacadesForAllFloors()
      await ensureDefaultVloerIfNeeded()
    }
  }

  async function startInspection() {
    if (!selectedTemplates.value.length) return
    saving.value = true
    error.value = null
    try {
      await loadTemplateConfigs()
      const property = await createPropertyLocal({
        postcode: postcode.value,
        houseNumber: houseNumber.value,
        houseNumberAddition: houseNumberAddition.value || null,
      })
      const inspection = await createInspectionLocal({
        propertyId: property.id,
        status: 'in_progress',
        templates: selectedTemplates.value.map((t) => ({
          templateKey: t.templateKey,
          templateVersion: t.templateVersion,
        })),
      })

      propertyId.value = property.id
      inspectionId.value = inspection.id
      step.value = 2
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  function applyChosenStep(
    status: string,
    keepStructureStep: boolean,
    editing: boolean,
  ) {
    const hasStructure = bundleHasStructure(floors.value, rooms.value)
    step.value = chooseFlowStep({ status, hasStructure, keepStructureStep, editing })
    if (step.value === 3) {
      selectDefaultChecklistTab()
    }
  }

  async function hydrateFlowFromBundle(
    bundle: HydrateBundle,
    opts: { keepStructureStep: boolean; editing: boolean; requireTemplates?: boolean },
  ) {
    inspectionId.value = bundle.inspectionId
    propertyId.value = bundle.propertyId
    selectedTemplates.value = bundle.templates
    postcode.value = bundle.postcode
    houseNumber.value = bundle.houseNumber
    houseNumberAddition.value = bundle.houseNumberAddition

    if (selectedTemplates.value.length) {
      try {
        await loadTemplateConfigs()
      } catch (err) {
        if (opts.requireTemplates) throw err
      }
    }

    floors.value = bundle.floors
    rooms.value = bundle.rooms
    assets.value = bundle.assets
    answersBySubject.value = bundle.answersBySubject
    observationIdsByKey.value = bundle.observationIdsByKey
    fillChecklistDefaults()

    const loadedPhotos: FlowPhoto[] = []
    for (const row of bundle.photos) {
      loadedPhotos.push({
        ...row,
        previewUrl: await resolvePhotoPreviewUrl(row.id),
      })
    }
    photos.value = loadedPhotos

    if (bundle.structureToCache) {
      await cacheSyncedStructureLocal(bundle.structureToCache)
    }

    applyChosenStep(bundle.status, opts.keepStructureStep, opts.editing)
    if (step.value === 3) {
      await ensureDefaultFacadesForAllFloors()
      await ensureDefaultVloerIfNeeded()
    }
  }

  async function resumeInspection(
    targetInspectionId: string,
    opts?: { editing?: boolean; dossier?: InspectionDossierPayload },
  ) {
    const keepStructureStep =
      inspectionId.value === targetInspectionId && step.value === 2
    const editing = opts?.editing ?? false
    loading.value = true
    error.value = null
    try {
      reset()

      if (opts?.dossier && bundleHasStructure(opts.dossier.floors, opts.dossier.rooms)) {
        const local = await getLocalInspectionBundle(targetInspectionId)
        const bundle = hydrateBundleFromDossier(targetInspectionId, opts.dossier, local)
        if (bundle) {
          await hydrateFlowFromBundle(bundle, { keepStructureStep: false, editing })
          return
        }
      }

      const localPreview = await getLocalInspectionBundle(targetInspectionId)
      const preferLocal = shouldPreferLocalBundle({
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        hasStructure: bundleHasStructure(localPreview?.floors, localPreview?.rooms),
        syncStatus: localPreview?.inspection?.syncStatus,
      })

      if (preferLocal && localPreview) {
        const bundle = hydrateBundleFromLocal(localPreview)
        if (bundle) {
          await hydrateFlowFromBundle(bundle, { keepStructureStep, editing })
          return
        }
      }

      const { inspection } = await apiFetch<{
        inspection: {
          id: string
          property_id: string
          status: string
          inspection_template_pins?: Array<{ template_key: string; template_version: string }>
        }
      }>(`/api/inspections/${targetInspectionId}`)

      const structure = await apiFetch<{
        property: {
          postcode: string
          house_number: string
          house_number_addition: string | null
        }
        floors: Array<{ id: string; label: string; sort_order: number; updated_at?: string }>
        rooms: Array<{
          id: string
          floor_id: string
          room_type: string
          label: string | null
          sort_order?: number
          updated_at?: string
        }>
        assets?: Array<{
          id: string
          floor_id?: string | null
          asset_type: string
          label: string | null
          sort_order?: number
          updated_at?: string
        }>
      }>(`/api/properties/${inspection.property_id}`)

      const { observations } = await apiFetch<{
        observations: Array<{
          id: string
          subject_type: string
          subject_id: string
          attribute_key: string
          value: unknown
          inspection_id?: string
          property_id?: string
          updated_at?: string
          visibility?: Visibility
          device_id?: string | null
        }>
      }>(`/api/observations?inspectionId=${inspection.id}`)

      const { photos: photoRows } = await apiFetch<{
        photos: Array<{
          id: string
          observation_id: string | null
          subject_id: string | null
          subject_type?: string | null
          source_inspection_id: string | null
          checksum?: string | null
          storage_key?: string | null
        }>
      }>(`/api/photos?propertyId=${inspection.property_id}&inspectionId=${inspection.id}`)

      const bundle = hydrateBundleFromApi(
        {
          inspection,
          structure,
          observations: observations ?? [],
          photos: photoRows ?? [],
        },
        localPreview?.inspection,
      )
      await hydrateFlowFromBundle(bundle, {
        keepStructureStep,
        editing,
        requireTemplates: true,
      })
    } catch (err) {
      const local = await getLocalInspectionBundle(targetInspectionId)
      const bundle = local ? hydrateBundleFromLocal(local) : null
      if (bundle) {
        await hydrateFlowFromBundle(bundle, { keepStructureStep, editing })
        error.value = null
        return
      }
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      loading.value = false
    }
  }

  function hasFloorLabel(label: string) {
    return floors.value.some((f) => f.label.toLowerCase() === label.toLowerCase())
  }

  async function addFloor(label: string) {
    const trimmed = label.trim()
    if (!propertyId.value || !trimmed || hasFloorLabel(trimmed)) return
    const isFirstFloor = floors.value.length === 0
    const row = await addFloorLocal({
      propertyId: propertyId.value,
      label: trimmed,
      sortOrder: floors.value.length,
    })
    floors.value.push({ id: row.id, label: row.label, sortOrder: row.sortOrder })
    if (
      isFirstFloor &&
      merged.value?.roomTypes.some((rt) => rt.id === METERKAST_ROOM_TYPE_ID)
    ) {
      await addRoom(row.id, METERKAST_ROOM_TYPE_ID)
    }
    await ensureDefaultFacades(row.id)
  }

  async function removeFloor(floorId: string) {
    if (!propertyId.value) return
    await removeFloorLocal(propertyId.value, floorId)
    floors.value = floors.value.filter((f) => f.id !== floorId)
    rooms.value = rooms.value.filter((r) => r.floorId !== floorId)
    assets.value = assets.value.filter((a) => a.floorId !== floorId)
    if (activeFloorId.value === floorId) {
      activeFloorId.value = hasPropertyTab.value
        ? PROPERTY_TAB_ID
        : floors.value[0]?.id ?? null
    }
  }

  function roomsOfType(floorId: string, roomType: string) {
    return rooms.value.filter((r) => r.floorId === floorId && r.roomType === roomType)
  }

  async function toggleRoomType(floorId: string, roomType: string) {
    const existing = roomsOfType(floorId, roomType)
    if (existing.length) {
      for (const room of existing) {
        await removeRoom(room.id)
      }
      return
    }
    await addRoom(floorId, roomType)
  }

  async function addRoom(floorId: string, roomType: string, label?: string) {
    if (!propertyId.value) return
    const row = await addRoomLocal({
      propertyId: propertyId.value,
      floorId,
      roomType,
      label: label ?? null,
      sortOrder: rooms.value.filter((r) => r.floorId === floorId).length,
    })
    rooms.value.push({
      id: row.id,
      floorId: row.floorId,
      roomType: row.roomType,
      label: row.label,
    })
    fillChecklistDefaults(row.id)
  }

  async function removeRoom(roomId: string) {
    if (!propertyId.value) return
    await removeRoomLocal(propertyId.value, roomId)
    rooms.value = rooms.value.filter((r) => r.id !== roomId)
    const next = { ...answersBySubject.value }
    delete next[subjectAnswerKey('room', roomId)]
    answersBySubject.value = next
    const nextObs = { ...observationIdsByKey.value }
    const prefix = `${subjectAnswerKey('room', roomId)}|`
    for (const key of Object.keys(nextObs)) {
      if (key.startsWith(prefix)) delete nextObs[key]
    }
    observationIdsByKey.value = nextObs
    const removed = photos.value.filter((p) => p.subjectType === 'room' && p.subjectId === roomId)
    for (const photo of removed) {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    }
    photos.value = photos.value.filter(
      (p) => !(p.subjectType === 'room' && p.subjectId === roomId),
    )
  }

  async function addAsset(assetType: string, floorId?: string | null, label?: string) {
    if (!propertyId.value) return
    const onFloor = floorId ?? null
    const row = await addAssetLocal({
      propertyId: propertyId.value,
      floorId: onFloor,
      assetType,
      label: label ?? null,
      sortOrder: assets.value.filter((a) => a.floorId === onFloor && a.assetType === assetType)
        .length,
    })
    assets.value.push({
      id: row.id,
      floorId: row.floorId,
      assetType: row.assetType,
      label: row.label,
    })
    fillChecklistDefaults()
    return row
  }

  async function persistSubjectAnswers(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
    answers: Record<string, unknown>,
  ) {
    if (!propertyId.value || !inspectionId.value || !Object.keys(answers).length) return
    const nextObsIds = { ...observationIdsByKey.value }
    const observations = Object.entries(answers).map(([questionKey, value]) => {
      const attributeKey = `${subjectType}.${questionKey}`
      const mapKey = observationMapKey(subjectType, subjectId, attributeKey)
      const id = nextObsIds[mapKey] ?? newId()
      nextObsIds[mapKey] = id
      return {
        id,
        propertyId: propertyId.value!,
        inspectionId: inspectionId.value!,
        attributeKey,
        subjectType,
        subjectId,
        value,
        visibility: 'private' as const,
      }
    })
    observationIdsByKey.value = nextObsIds
    await saveObservationsLocal(observations)
  }

  function floorHasDefaultGevel(floorId: string, zijde: string, label: string) {
    return assets.value.some((asset) => {
      if (asset.floorId !== floorId || asset.assetType !== GEVEL_ASSET_TYPE) return false
      const answered = assetAnswers(asset.id).gevelZijde
      const assetLabel = asset.label?.trim().toLowerCase()
      return answered === zijde || assetLabel === label.toLowerCase()
    })
  }

  async function ensureDefaultFacades(floorId: string) {
    if (!merged.value?.assetTypes?.some((at) => at.id === GEVEL_ASSET_TYPE)) return
    for (const preset of DEFAULT_GEVELS) {
      if (floorHasDefaultGevel(floorId, preset.zijde, preset.label)) continue
      const row = await addAsset(GEVEL_ASSET_TYPE, floorId, preset.label)
      if (!row) continue
      setAnswer('asset', row.id, 'gevelZijde', preset.zijde)
      await persistSubjectAnswers('asset', row.id, assetAnswers(row.id))
    }
  }

  async function ensureDefaultFacadesForAllFloors() {
    for (const floor of floors.value) {
      await ensureDefaultFacades(floor.id)
    }
  }

  async function ensureDefaultVloerIfNeeded() {
    if (!merged.value?.assetTypes?.some((at) => at.id === VLOER_ASSET_TYPE)) return
    if (propertyAnswers().onderkant !== 'grond') return
    if (assets.value.some((asset) => asset.assetType === VLOER_ASSET_TYPE)) return
    const firstFloor = floors.value[0]
    if (!firstFloor) return
    await addAsset(VLOER_ASSET_TYPE, firstFloor.id)
  }

  async function removeAsset(assetId: string) {
    if (!propertyId.value) return
    await removeAssetLocal(propertyId.value, assetId)
    assets.value = assets.value.filter((a) => a.id !== assetId)
    const next = { ...answersBySubject.value }
    delete next[subjectAnswerKey('asset', assetId)]
    answersBySubject.value = next
    const nextObs = { ...observationIdsByKey.value }
    const prefix = `${subjectAnswerKey('asset', assetId)}|`
    for (const key of Object.keys(nextObs)) {
      if (key.startsWith(prefix)) delete nextObs[key]
    }
    observationIdsByKey.value = nextObs
    const removed = photos.value.filter((p) => p.subjectType === 'asset' && p.subjectId === assetId)
    for (const photo of removed) {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    }
    photos.value = photos.value.filter(
      (p) => !(p.subjectType === 'asset' && p.subjectId === assetId),
    )
  }

  async function duplicateAsset(assetId: string) {
    const source = assets.value.find((a) => a.id === assetId)
    if (!source || !propertyId.value) return
    const typeLabel =
      merged.value?.assetTypes.find((at) => at.id === source.assetType)?.label ?? source.assetType
    const base = source.label?.trim() || typeLabel
    const suffix = ' (kopie)'
    let label = `${base}${suffix}`
    let n = 2
    while (assets.value.some((a) => a.label === label)) {
      label = `${base}${suffix} ${n}`
      n += 1
    }
    const row = await addAsset(source.assetType, source.floorId, label)
    if (!row) return
    const copied = { ...assetAnswers(source.id) }
    writeSubjectAnswers(subjectAnswerKey('asset', row.id), copied)
    fillChecklistDefaults()
    if (inspectionId.value && Object.keys(copied).length) {
      const nextObsIds = { ...observationIdsByKey.value }
      const observations = Object.entries(copied).map(([questionKey, value]) => {
        const attributeKey = `asset.${questionKey}`
        const mapKey = observationMapKey('asset', row.id, attributeKey)
        const id = newId()
        nextObsIds[mapKey] = id
        return {
          id,
          propertyId: propertyId.value!,
          inspectionId: inspectionId.value!,
          attributeKey,
          subjectType: 'asset' as const,
          subjectId: row.id,
          value,
          visibility: 'private' as const,
        }
      })
      observationIdsByKey.value = nextObsIds
      await saveObservationsLocal(observations)
    }
    return row
  }

  function setAnswer(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
    questionKey: string,
    value: unknown,
  ) {
    if (!merged.value) return
    const subjectKey = subjectAnswerKey(subjectType, subjectId)
    const current = { ...(answersBySubject.value[subjectKey] ?? {}), [questionKey]: value }
    if (subjectType === 'property') {
      const cleared = clearHiddenQuestionAnswers(merged.value.propertyQuestions, current, {
        propertyAnswers: current,
      })
      writeSubjectAnswers(
        subjectKey,
        applyNoneOfTheseDefaults(listMergedVisiblePropertyQuestions(merged.value, cleared), cleared),
      )
      for (const room of rooms.value) {
        const roomKey = subjectAnswerKey('room', room.id)
        const roomCurrent = answersBySubject.value[roomKey] ?? {}
        const roomType = merged.value.roomTypes.find((rt) => rt.id === room.roomType)
        if (!roomType) continue
        const roomCleared = clearHiddenAnswers(roomType, roomCurrent, cleared)
        writeSubjectAnswers(
          roomKey,
          applyNoneOfTheseDefaults(
            listMergedVisibleQuestions(merged.value, room.roomType, roomCleared, cleared),
            roomCleared,
          ),
        )
      }
      if (questionKey === 'onderkant') {
        void ensureDefaultVloerIfNeeded()
      }
      return
    }
    if (subjectType === 'asset') {
      const asset = assets.value.find((a) => a.id === subjectId)
      if (!asset) return
      const assetType = merged.value.assetTypes.find((at) => at.id === asset.assetType)
      const property = propertyAnswers()
      const cleared = assetType ? clearHiddenAssetAnswers(assetType, current, property) : current
      writeSubjectAnswers(
        subjectKey,
        applyNoneOfTheseDefaults(
          listMergedVisibleAssetQuestions(merged.value, asset.assetType, cleared, property),
          cleared,
        ),
      )
      return
    }
    const room = rooms.value.find((r) => r.id === subjectId)
    if (!room) return
    const roomType = merged.value.roomTypes.find((rt: { id: string }) => rt.id === room.roomType)
    const property = propertyAnswers()
    const cleared = roomType ? clearHiddenAnswers(roomType, current, property) : current
    writeSubjectAnswers(
      subjectKey,
      applyNoneOfTheseDefaults(
        listMergedVisibleQuestions(merged.value, room.roomType, cleared, property),
        cleared,
      ),
    )
  }

  async function ensureObservation(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
    attributeKey: string,
  ) {
    if (!propertyId.value || !inspectionId.value) {
      throw new Error('No active inspection')
    }
    const mapKey = observationMapKey(subjectType, subjectId, attributeKey)
    const existing = observationIdsByKey.value[mapKey]
    if (existing) return existing

    const questionKey = attributeQuestionKey(attributeKey)
    const value =
      answersBySubject.value[subjectAnswerKey(subjectType, subjectId)]?.[questionKey] ?? null
    const id = newId()
    await saveObservationsLocal([
      {
        id,
        propertyId: propertyId.value,
        inspectionId: inspectionId.value,
        attributeKey,
        subjectType,
        subjectId,
        value,
        visibility: 'private',
      },
    ])
    observationIdsByKey.value = { ...observationIdsByKey.value, [mapKey]: id }
    return id
  }

  async function uploadPhoto(
    subjectType: FlowPhoto['subjectType'],
    subjectId: string,
    attributeKey: string,
    file: File,
  ) {
    if (!propertyId.value || !inspectionId.value) return
    const uploadKey = observationMapKey(subjectType, subjectId, attributeKey)
    uploadingPhotoKey.value = uploadKey
    error.value = null
    try {
      const observationId = await ensureObservation(subjectType, subjectId, attributeKey)
      const photo = await savePhotoLocal({
        propertyId: propertyId.value,
        observationId,
        subjectType,
        subjectId,
        sourceInspectionId: inspectionId.value,
        file,
        contentType: file.type || 'image/jpeg',
      })
      photos.value = [
        ...photos.value,
        {
          id: photo.id,
          subjectType,
          subjectId,
          attributeKey,
          observationId,
          previewUrl: URL.createObjectURL(file),
        },
      ]
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      uploadingPhotoKey.value = null
    }
  }

  async function removePhoto(photoId: string) {
    if (!propertyId.value) return
    const photo = photos.value.find((p) => p.id === photoId)
    if (!photo) return
    if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    photos.value = photos.value.filter((p) => p.id !== photoId)
    error.value = null
    try {
      await removePhotoLocal(propertyId.value, photoId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    }
  }

  async function saveAllAnswers() {
    if (!propertyId.value || !inspectionId.value) return
    saving.value = true
    error.value = null
    try {
      fillChecklistDefaults()
      const nextObsIds = { ...observationIdsByKey.value }
      const observations = Object.entries(answersBySubject.value).flatMap(
        ([subjectKey, answers]) => {
          const parsed = parseSubjectAnswerKey(subjectKey)
          if (!parsed) return []
          const subjectType = parsed.subjectType as FlowPhoto['subjectType']
          return Object.entries(answers).map(([questionKey, value]) => {
            const attributeKey = `${subjectType}.${questionKey}`
            const mapKey = observationMapKey(subjectType, parsed.subjectId, attributeKey)
            const id = nextObsIds[mapKey] ?? newId()
            nextObsIds[mapKey] = id
            return {
              id,
              propertyId: propertyId.value!,
              inspectionId: inspectionId.value!,
              attributeKey,
              subjectType,
              subjectId: parsed.subjectId,
              value,
              visibility: 'private' as const,
            }
          })
        },
      )
      observationIdsByKey.value = nextObsIds
      if (observations.length) {
        await saveObservationsLocal(observations)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  function selectDefaultChecklistTab() {
    const onKnownFloor = floors.value.some((floor) => floor.id === activeFloorId.value)
    if (hasPropertyTab.value && !onKnownFloor) {
      activeFloorId.value = PROPERTY_TAB_ID
      return
    }
    if (!onKnownFloor) {
      activeFloorId.value = floors.value[0]?.id ?? null
    }
  }

  async function enterChecklist() {
    fillChecklistDefaults()
    await ensureDefaultFacadesForAllFloors()
    await ensureDefaultVloerIfNeeded()
    step.value = 3
    selectDefaultChecklistTab()
  }

  function enterFloors() {
    error.value = null
    step.value = 2
  }

  function selectFloor(floorId: string) {
    activeFloorId.value = floorId
  }

  function selectPropertyTab() {
    activeFloorId.value = PROPERTY_TAB_ID
  }

  function goToFirstIncomplete() {
    if (propertyTabHasMissing.value) {
      step.value = 3
      activeFloorId.value = PROPERTY_TAB_ID
      void nextTick(() => {
        document.getElementById('property-questions')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
      return
    }
    if (requiredVloerMissing.value && floors.value[0]) {
      step.value = 3
      activeFloorId.value = floors.value[0].id
      return
    }
    const firstRoom = roomCompleteness.value.find(
      (room) => room.missingAttributeKeys.length > 0 || room.missingPhotoAttributeKeys.length > 0,
    )
    if (firstRoom) {
      step.value = 3
      activeFloorId.value = firstRoom.floorId
      return
    }
    const firstAsset = assetCompleteness.value.find(
      (asset) => asset.missingAttributeKeys.length > 0 || asset.missingPhotoAttributeKeys.length > 0,
    )
    if (!firstAsset) return
    step.value = 3
    if (firstAsset.floorId) activeFloorId.value = firstAsset.floorId
    else if (hasPropertyTab.value) activeFloorId.value = PROPERTY_TAB_ID
  }

  async function completeInspection() {
    if (!inspectionId.value) return
    if (!answersComplete.value) {
      goToFirstIncomplete()
      return false
    }
    saving.value = true
    error.value = null
    try {
      await completeInspectionLocal(inspectionId.value)
      step.value = 4
      return true
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function reopenInspection(
    targetInspectionId: string,
    dossier?: InspectionDossierPayload,
  ) {
    saving.value = true
    error.value = null
    try {
      await reopenInspectionLocal(targetInspectionId)
      await resumeInspection(targetInspectionId, { editing: true, dossier })
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function downloadDossier(): Promise<unknown> {
    if (!propertyId.value) return null
    return apiFetch(`/api/exports/properties/${propertyId.value}/dossier`)
  }

  return {
    step,
    propertyId,
    inspectionId,
    postcode,
    postcodeIsComplete,
    houseNumber,
    houseNumberAddition,
    selectedTemplates,
    selectedTemplateKeys,
    templateConfigs,
    floors,
    rooms,
    assets,
    activeFloorId,
    answersBySubject,
    observationIdsByKey,
    photos,
    saving,
    loading,
    uploadingPhotoKey,
    error,
    merged,
    sortedRoomTypes,
    floorAssetTypes,
    propertyAssetTypes,
    hasRoomTypes,
    hasPropertyTab,
    isPropertyTab,
    activeFloor,
    roomsOnActiveFloor,
    assetsOnActiveFloor,
    propertyAssets,
    propertyCompleteness,
    propertyTabHasMissing,
    roomCompleteness,
    assetCompleteness,
    structureHints,
    missingAnswerCount,
    missingPhotoCount,
    answersComplete,
    templateCompleteness,
    questionsForRoom,
    questionsForProperty,
    questionsForAsset,
    missingKeysForRoom,
    missingPhotoKeysForRoom,
    missingKeysForSubject,
    missingPhotoKeysForSubject,
    photosForQuestion,
    floorHasMissingAnswers,
    selectFloor,
    selectPropertyTab,
    goToFirstIncomplete,
    reset,
    startInspection,
    resumeInspection,
    setTemplateEnabled,
    hasFloorLabel,
    addFloor,
    removeFloor,
    roomsOfType,
    toggleRoomType,
    addRoom,
    removeRoom,
    addAsset,
    removeAsset,
    duplicateAsset,
    setAnswer,
    saveAllAnswers,
    uploadPhoto,
    removePhoto,
    enterChecklist,
    enterFloors,
    completeInspection,
    reopenInspection,
    downloadDossier,
  }
})
