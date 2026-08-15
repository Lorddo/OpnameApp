import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '@/lib/api'
import { resolvePhotoPreviewUrl } from '@/lib/photo-preview'
import { loadTemplateConfigs as fetchTemplateConfigs } from '@/lib/templates'
import { newId } from '@/db/ids'
import {
  addFloorLocal,
  addRoomLocal,
  cacheSyncedStructureLocal,
  completeInspectionLocal,
  createInspectionLocal,
  createPropertyLocal,
  getLocalInspectionBundle,
  removeFloorLocal,
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
  evaluateMergedRoomCompleteness,
  evaluateTemplateCompleteness,
  exclusiveAttributeKeysForTemplate,
  exclusiveRoomTypeIdsForTemplate,
  formatNlPostcode,
  isCompleteNlPostcode,
  listMergedVisibleQuestions,
  mergeTemplates,
} from '@opnameapp/core'
import {
  attributeQuestionKey,
  bundleHasStructure,
  chooseFlowStep,
  hydrateBundleFromApi,
  hydrateBundleFromDossier,
  hydrateBundleFromLocal,
  obsMapKey,
  shouldPreferLocalBundle,
  type HydrateBundle,
  type InspectionDossierPayload,
} from '@/stores/inspection-hydrate'

const METERKAST_ROOM_TYPE_ID = 'meterkast'

function compareRoomTypeOrder(a: { id: string; label: string }, b: { id: string; label: string }) {
  if (a.id === METERKAST_ROOM_TYPE_ID && b.id !== METERKAST_ROOM_TYPE_ID) return -1
  if (b.id === METERKAST_ROOM_TYPE_ID && a.id !== METERKAST_ROOM_TYPE_ID) return 1
  return a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' })
}

export type FlowPhoto = {
  id: string
  roomId: string
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
  const activeFloorId = ref<string | null>(null)
  const answersByRoom = ref<Record<string, Record<string, unknown>>>({})
  /** Stable observation ids keyed by `${roomId}|${attributeKey}` so photos stay linked across saves. */
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

  function photosByAttributeForRoom(roomId: string): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const photo of photos.value) {
      if (photo.roomId !== roomId) continue
      counts[photo.attributeKey] = (counts[photo.attributeKey] ?? 0) + 1
    }
    return counts
  }

  const roomCompleteness = computed(() => {
    if (!merged.value) return []
    return rooms.value.flatMap((room) => {
      try {
        const result = evaluateMergedRoomCompleteness(
          merged.value!,
          room.roomType,
          answersByRoom.value[room.id] ?? {},
          photosByAttributeForRoom(room.id),
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

  const missingAnswerCount = computed(() =>
    roomCompleteness.value.reduce((sum, room) => sum + room.missingAttributeKeys.length, 0),
  )

  const missingPhotoCount = computed(() =>
    roomCompleteness.value.reduce((sum, room) => sum + room.missingPhotoAttributeKeys.length, 0),
  )

  const answersComplete = computed(
    () =>
      rooms.value.length > 0 &&
      missingAnswerCount.value === 0 &&
      missingPhotoCount.value === 0,
  )

  const templateCompleteness = computed(() =>
    templateConfigs.value.map((tpl) =>
      evaluateTemplateCompleteness(
        tpl,
        rooms.value.map((room) => ({ id: room.id, roomType: room.roomType })),
        answersByRoom.value,
        Object.fromEntries(
          rooms.value.map((room) => [room.id, photosByAttributeForRoom(room.id)] as const),
        ),
      ),
    ),
  )

  function missingKeysForRoom(roomId: string) {
    return roomCompleteness.value.find((room) => room.roomId === roomId)?.missingAttributeKeys ?? []
  }

  function missingPhotoKeysForRoom(roomId: string) {
    return (
      roomCompleteness.value.find((room) => room.roomId === roomId)?.missingPhotoAttributeKeys ?? []
    )
  }

  function floorHasMissingAnswers(floorId: string) {
    return roomCompleteness.value.some(
      (room) =>
        room.floorId === floorId &&
        (room.missingAttributeKeys.length > 0 || room.missingPhotoAttributeKeys.length > 0),
    )
  }

  function photosForQuestion(roomId: string, attributeKey: string) {
    return photos.value.filter((p) => p.roomId === roomId && p.attributeKey === attributeKey)
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
    const answers = answersByRoom.value[roomId] ?? {}
    return listMergedVisibleQuestions(merged.value, room.roomType, answers)
  }

  function fillChecklistDefaults(roomId?: string) {
    const view = merged.value
    if (!view) return
    const targets = roomId ? rooms.value.filter((room) => room.id === roomId) : rooms.value
    if (!targets.length) return
    const next = { ...answersByRoom.value }
    let changed = false
    for (const room of targets) {
      const current = next[room.id] ?? {}
      const filled = applyNoneOfTheseDefaults(
        listMergedVisibleQuestions(view, room.roomType, current),
        current,
      )
      if (filled !== current) {
        next[room.id] = filled
        changed = true
      }
    }
    if (changed) answersByRoom.value = next
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
    activeFloorId.value = null
    answersByRoom.value = {}
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
    for (const [roomId, answers] of Object.entries(answersByRoom.value)) {
      const filtered = Object.fromEntries(
        Object.entries(answers).filter(([questionKey]) => !questionKeys.has(questionKey)),
      )
      nextAnswers[roomId] = filtered
    }
    answersByRoom.value = nextAnswers

    const nextObs = { ...observationIdsByKey.value }
    const droppedObs: Array<{ id: string; roomId: string; attributeKey: string }> = []
    for (const [mapKey, obsId] of Object.entries(nextObs)) {
      const sep = mapKey.indexOf('|')
      const roomId = mapKey.slice(0, sep)
      const attributeKey = mapKey.slice(sep + 1)
      if (!keySet.has(attributeKey)) continue
      droppedObs.push({ id: obsId, roomId, attributeKey })
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
          subjectType: 'room',
          subjectId: o.roomId,
          value: null,
          visibility: 'private',
        })),
      )
    }
  }

  async function addInspectionTemplate(templateKey: string, templateVersion: string) {
    if (selectedTemplates.value.some((t) => t.templateKey === templateKey)) return
    saving.value = true
    error.value = null
    const previous = selectedTemplates.value
    try {
      selectedTemplates.value = [...previous, { templateKey, templateVersion }]
      await loadTemplateConfigs()
      fillChecklistDefaults()
      await persistSelectedTemplates()
    } catch (err) {
      selectedTemplates.value = previous
      try {
        await loadTemplateConfigs()
      } catch {
        templateConfigs.value = []
      }
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function removeInspectionTemplate(templateKey: string) {
    if (selectedTemplates.value.length <= 1) return
    if (!selectedTemplates.value.some((t) => t.templateKey === templateKey)) return
    saving.value = true
    error.value = null
    try {
      const mergedView = merged.value
      const exclusiveKeys = mergedView
        ? exclusiveAttributeKeysForTemplate(mergedView, templateKey)
        : []
      const exclusiveRoomTypes = mergedView
        ? exclusiveRoomTypeIdsForTemplate(mergedView, templateKey)
        : []
      for (const room of rooms.value.filter((r) => exclusiveRoomTypes.includes(r.roomType))) {
        await removeRoom(room.id)
      }
      await discardAnswersForAttributeKeys(exclusiveKeys)
      selectedTemplates.value = selectedTemplates.value.filter((t) => t.templateKey !== templateKey)
      await loadTemplateConfigs()
      await persistSelectedTemplates()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      saving.value = false
    }
  }

  async function startInspection() {
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
      activeFloorId.value = floors.value[0]?.id ?? null
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
    answersByRoom.value = bundle.answersByRoom
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

      const bundle = hydrateBundleFromApi({
        inspection,
        structure,
        observations: observations ?? [],
        photos: photoRows ?? [],
      })
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
  }

  async function removeFloor(floorId: string) {
    if (!propertyId.value) return
    await removeFloorLocal(propertyId.value, floorId)
    floors.value = floors.value.filter((f) => f.id !== floorId)
    rooms.value = rooms.value.filter((r) => r.floorId !== floorId)
    if (activeFloorId.value === floorId) {
      activeFloorId.value = floors.value[0]?.id ?? null
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
    const next = { ...answersByRoom.value }
    delete next[roomId]
    answersByRoom.value = next
    const nextObs = { ...observationIdsByKey.value }
    for (const key of Object.keys(nextObs)) {
      if (key.startsWith(`${roomId}|`)) delete nextObs[key]
    }
    observationIdsByKey.value = nextObs
    const removed = photos.value.filter((p) => p.roomId === roomId)
    for (const photo of removed) {
      if (photo.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.previewUrl)
    }
    photos.value = photos.value.filter((p) => p.roomId !== roomId)
  }

  function setAnswer(roomId: string, questionKey: string, value: unknown) {
    if (!merged.value) return
    const room = rooms.value.find((r) => r.id === roomId)
    if (!room) return
    const current = { ...(answersByRoom.value[roomId] ?? {}), [questionKey]: value }
    const roomType = merged.value.roomTypes.find((rt: { id: string }) => rt.id === room.roomType)
    const cleared = roomType ? clearHiddenAnswers(roomType, current) : current
    answersByRoom.value[roomId] = applyNoneOfTheseDefaults(
      listMergedVisibleQuestions(merged.value, room.roomType, cleared),
      cleared,
    )
  }

  async function ensureObservation(roomId: string, attributeKey: string) {
    if (!propertyId.value || !inspectionId.value) {
      throw new Error('No active inspection')
    }
    const mapKey = obsMapKey(roomId, attributeKey)
    const existing = observationIdsByKey.value[mapKey]
    if (existing) return existing

    const questionKey = attributeQuestionKey(attributeKey)
    const value = answersByRoom.value[roomId]?.[questionKey] ?? null
    const id = newId()
    await saveObservationsLocal([
      {
        id,
        propertyId: propertyId.value,
        inspectionId: inspectionId.value,
        attributeKey,
        subjectType: 'room',
        subjectId: roomId,
        value,
        visibility: 'private',
      },
    ])
    observationIdsByKey.value = { ...observationIdsByKey.value, [mapKey]: id }
    return id
  }

  async function uploadPhoto(roomId: string, attributeKey: string, file: File) {
    if (!propertyId.value || !inspectionId.value) return
    const uploadKey = obsMapKey(roomId, attributeKey)
    uploadingPhotoKey.value = uploadKey
    error.value = null
    try {
      const observationId = await ensureObservation(roomId, attributeKey)
      const photo = await savePhotoLocal({
        propertyId: propertyId.value,
        observationId,
        subjectType: 'room',
        subjectId: roomId,
        sourceInspectionId: inspectionId.value,
        file,
        contentType: file.type || 'image/jpeg',
      })
      photos.value = [
        ...photos.value,
        {
          id: photo.id,
          roomId,
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

  async function saveAllAnswers() {
    if (!propertyId.value || !inspectionId.value) return
    saving.value = true
    error.value = null
    try {
      fillChecklistDefaults()
      const nextObsIds = { ...observationIdsByKey.value }
      const observations = rooms.value.flatMap((room) => {
        const answers = answersByRoom.value[room.id] ?? {}
        return Object.entries(answers).map(([questionKey, value]) => {
          const attributeKey = `room.${questionKey}`
          const mapKey = obsMapKey(room.id, attributeKey)
          const id = nextObsIds[mapKey] ?? newId()
          nextObsIds[mapKey] = id
          return {
            id,
            propertyId: propertyId.value!,
            inspectionId: inspectionId.value!,
            attributeKey,
            subjectType: 'room' as const,
            subjectId: room.id,
            value,
            visibility: 'private' as const,
          }
        })
      })
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

  function enterChecklist() {
    step.value = 3
    if (!activeFloorId.value || !floors.value.some((floor) => floor.id === activeFloorId.value)) {
      activeFloorId.value = floors.value[0]?.id ?? null
    }
  }

  function enterFloors() {
    error.value = null
    step.value = 2
  }

  function selectFloor(floorId: string) {
    activeFloorId.value = floorId
  }

  function goToFirstIncomplete() {
    const first = roomCompleteness.value.find(
      (room) => room.missingAttributeKeys.length > 0 || room.missingPhotoAttributeKeys.length > 0,
    )
    if (!first) return
    step.value = 3
    activeFloorId.value = first.floorId
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
    templateConfigs,
    floors,
    rooms,
    activeFloorId,
    answersByRoom,
    observationIdsByKey,
    photos,
    saving,
    loading,
    uploadingPhotoKey,
    error,
    merged,
    sortedRoomTypes,
    activeFloor,
    roomsOnActiveFloor,
    roomCompleteness,
    missingAnswerCount,
    missingPhotoCount,
    answersComplete,
    templateCompleteness,
    questionsForRoom,
    missingKeysForRoom,
    missingPhotoKeysForRoom,
    photosForQuestion,
    floorHasMissingAnswers,
    selectFloor,
    goToFirstIncomplete,
    reset,
    startInspection,
    resumeInspection,
    addInspectionTemplate,
    removeInspectionTemplate,
    hasFloorLabel,
    addFloor,
    removeFloor,
    roomsOfType,
    toggleRoomType,
    addRoom,
    removeRoom,
    setAnswer,
    saveAllAnswers,
    uploadPhoto,
    enterChecklist,
    enterFloors,
    completeInspection,
    reopenInspection,
    downloadDossier,
  }
})
