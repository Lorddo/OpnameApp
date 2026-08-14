import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch, apiFetchBlob } from '@/lib/api'
import { db } from '@/db'
import { cloneForIdb } from '@/db/clone'
import { newId } from '@/db/ids'
import {
  addFloorLocal,
  addRoomLocal,
  completeInspectionLocal,
  createInspectionLocal,
  createPropertyLocal,
  getLocalInspectionBundle,
  removeFloorLocal,
  removeRoomLocal,
  reopenInspectionLocal,
  saveObservationsLocal,
  savePhotoLocal,
} from '@/db/repository'
import { flushOutbox } from '@/db/sync'
import type { InspectionTemplate } from '@opnameapp/core'
import {
  clearHiddenAnswers,
  evaluateMergedRoomCompleteness,
  listMergedVisibleQuestions,
  mergeTemplates,
  parseInspectionTemplate,
} from '@opnameapp/core'

const METERKAST_ROOM_TYPE_ID = 'meterkast'

function uuid() {
  return newId()
}

function compareRoomTypeOrder(a: { id: string; label: string }, b: { id: string; label: string }) {
  if (a.id === METERKAST_ROOM_TYPE_ID && b.id !== METERKAST_ROOM_TYPE_ID) return -1
  if (b.id === METERKAST_ROOM_TYPE_ID && a.id !== METERKAST_ROOM_TYPE_ID) return 1
  return a.label.localeCompare(b.label, 'nl', { sensitivity: 'base' })
}

function obsMapKey(roomId: string, attributeKey: string) {
  return `${roomId}|${attributeKey}`
}

function attributeQuestionKey(attributeKey: string) {
  return attributeKey.includes('.') ? attributeKey.split('.').slice(1).join('.') : attributeKey
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
  const postcode = ref('')
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
    const configs: InspectionTemplate[] = []
    for (const pin of selectedTemplates.value) {
      const cacheId = `${pin.templateKey}@${pin.templateVersion}`
      try {
        const res = await apiFetch<{
          template: { template_key: string; version: string; label: string; locale: string; config: unknown }
        }>(`/api/templates/${pin.templateKey}/${pin.templateVersion}`)
        configs.push(parseInspectionTemplate(res.template.config))
        await db.templates.put(
          cloneForIdb({
            id: cacheId,
            templateKey: res.template.template_key ?? pin.templateKey,
            version: res.template.version ?? pin.templateVersion,
            label: res.template.label ?? pin.templateKey,
            locale: res.template.locale ?? 'nl',
            config: res.template.config,
            updatedAt: new Date().toISOString(),
          }),
        )
      } catch (err) {
        const cached = await db.templates.get(cacheId)
        if (!cached) throw err
        configs.push(parseInspectionTemplate(cached.config))
      }
    }
    templateConfigs.value = configs
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

  async function applyLocalBundle(
    targetInspectionId: string,
    keepStructureStep: boolean,
    opts?: { requireTemplates?: boolean },
  ): Promise<boolean> {
    const local = await getLocalInspectionBundle(targetInspectionId)
    if (!local?.inspection || !local.property) return false

    inspectionId.value = local.inspection.id
    propertyId.value = local.inspection.propertyId
    selectedTemplates.value = local.inspection.templates
    postcode.value = local.property.postcode
    houseNumber.value = local.property.houseNumber
    houseNumberAddition.value = local.property.houseNumberAddition ?? ''

    if (selectedTemplates.value.length) {
      try {
        await loadTemplateConfigs()
      } catch (err) {
        if (opts?.requireTemplates) throw err
      }
    }

    floors.value = local.floors
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({ id: f.id, label: f.label, sortOrder: f.sortOrder }))
    rooms.value = local.rooms.map((r) => ({
      id: r.id,
      floorId: r.floorId,
      roomType: r.roomType,
      label: r.label,
    }))

    const byRoom: Record<string, Record<string, unknown>> = {}
    const obsIds: Record<string, string> = {}
    for (const obs of local.observations) {
      if (obs.subjectType !== 'room') continue
      const mapKey = obsMapKey(obs.subjectId, obs.attributeKey)
      if (!obsIds[mapKey]) obsIds[mapKey] = obs.id
      const questionKey = attributeQuestionKey(obs.attributeKey)
      if (!byRoom[obs.subjectId]) byRoom[obs.subjectId] = {}
      if (!(questionKey in byRoom[obs.subjectId]!)) {
        byRoom[obs.subjectId]![questionKey] = obs.value
      }
    }
    answersByRoom.value = byRoom
    observationIdsByKey.value = obsIds

    const loadedPhotos: FlowPhoto[] = []
    for (const row of local.photos) {
      if (!row.observationId) continue
      const obs = local.observations.find((o) => o.id === row.observationId)
      if (!obs || obs.subjectType !== 'room') continue
      let previewUrl: string | null = null
      const blob = await db.photoBlobs.get(row.id)
      if (blob) previewUrl = URL.createObjectURL(blob.blob)
      loadedPhotos.push({
        id: row.id,
        roomId: obs.subjectId,
        attributeKey: obs.attributeKey,
        observationId: row.observationId,
        previewUrl,
      })
    }
    photos.value = loadedPhotos

    if (local.inspection.status === 'completed' || local.inspection.status === 'synced') {
      step.value = 4
    } else if (!floors.value.length || !rooms.value.length || keepStructureStep) {
      step.value = 2
    } else {
      step.value = 3
      activeFloorId.value = floors.value[0]?.id ?? null
    }
    return true
  }

  async function resumeInspection(targetInspectionId: string) {
    const keepStructureStep =
      inspectionId.value === targetInspectionId && step.value === 2
    loading.value = true
    error.value = null
    try {
      reset()

      const localPreview = await getLocalInspectionBundle(targetInspectionId)
      const preferLocal =
        !navigator.onLine ||
        localPreview?.inspection?.syncStatus === 'pending' ||
        localPreview?.inspection?.syncStatus === 'error' ||
        localPreview?.inspection?.syncStatus === 'draft'

      if (preferLocal) {
        const ok = await applyLocalBundle(targetInspectionId, keepStructureStep)
        if (ok) return
      }

      const { inspection } = await apiFetch<{
        inspection: {
          id: string
          property_id: string
          status: string
          inspection_template_pins?: Array<{ template_key: string; template_version: string }>
        }
      }>(`/api/inspections/${targetInspectionId}`)

      inspectionId.value = inspection.id
      propertyId.value = inspection.property_id

      const pins = inspection.inspection_template_pins ?? []
      selectedTemplates.value = pins.map((p) => ({
        templateKey: p.template_key,
        templateVersion: p.template_version,
      }))
      if (selectedTemplates.value.length) await loadTemplateConfigs()

      const structure = await apiFetch<{
        property: {
          postcode: string
          house_number: string
          house_number_addition: string | null
        }
        floors: Array<{ id: string; label: string; sort_order: number }>
        rooms: Array<{
          id: string
          floor_id: string
          room_type: string
          label: string | null
        }>
      }>(`/api/properties/${inspection.property_id}`)

      postcode.value = structure.property.postcode
      houseNumber.value = structure.property.house_number
      houseNumberAddition.value = structure.property.house_number_addition ?? ''
      floors.value = (structure.floors ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order }))
      rooms.value = (structure.rooms ?? []).map((r) => ({
        id: r.id,
        floorId: r.floor_id,
        roomType: r.room_type,
        label: r.label,
      }))

      const { observations } = await apiFetch<{
        observations: Array<{
          id: string
          subject_type: string
          subject_id: string
          attribute_key: string
          value: unknown
        }>
      }>(`/api/observations?inspectionId=${inspection.id}`)

      const byRoom: Record<string, Record<string, unknown>> = {}
      const obsIds: Record<string, string> = {}
      for (const obs of observations ?? []) {
        if (obs.subject_type !== 'room') continue
        const attributeKey = String(obs.attribute_key)
        const mapKey = obsMapKey(obs.subject_id, attributeKey)
        // API returns newest first; keep first id per subject+attribute.
        if (!obsIds[mapKey]) obsIds[mapKey] = obs.id
        const questionKey = attributeQuestionKey(attributeKey)
        if (!byRoom[obs.subject_id]) byRoom[obs.subject_id] = {}
        if (!(questionKey in byRoom[obs.subject_id]!)) {
          byRoom[obs.subject_id]![questionKey] = obs.value
        }
      }
      answersByRoom.value = byRoom
      observationIdsByKey.value = obsIds

      const { photos: photoRows } = await apiFetch<{
        photos: Array<{
          id: string
          observation_id: string | null
          subject_id: string | null
          source_inspection_id: string | null
        }>
      }>(`/api/photos?propertyId=${inspection.property_id}&inspectionId=${inspection.id}`)

      const obsById = new Map((observations ?? []).map((o) => [o.id, o]))
      const loadedPhotos: FlowPhoto[] = []
      for (const row of photoRows ?? []) {
        const obs = row.observation_id ? obsById.get(row.observation_id) : undefined
        const roomId = obs?.subject_id ?? row.subject_id
        const attributeKey = obs?.attribute_key
        if (!roomId || !attributeKey) continue
        let previewUrl: string | null = null
        try {
          const blob = await apiFetchBlob(`/api/photos/${row.id}/content`)
          previewUrl = URL.createObjectURL(blob)
        } catch {
          previewUrl = null
        }
        loadedPhotos.push({
          id: row.id,
          roomId,
          attributeKey: String(attributeKey),
          observationId: row.observation_id,
          previewUrl,
        })
      }
      photos.value = loadedPhotos

      if (inspection.status === 'completed' || inspection.status === 'synced') {
        step.value = 4
      } else if (!floors.value.length || !rooms.value.length || keepStructureStep) {
        step.value = 2
      } else {
        step.value = 3
        activeFloorId.value = floors.value[0]?.id ?? null
      }
    } catch (err) {
      const ok = await applyLocalBundle(targetInspectionId, keepStructureStep)
      if (ok) {
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
    answersByRoom.value[roomId] = roomType ? clearHiddenAnswers(roomType, current) : current
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
    const id = uuid()
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
      const nextObsIds = { ...observationIdsByKey.value }
      const observations = rooms.value.flatMap((room) => {
        const answers = answersByRoom.value[room.id] ?? {}
        return Object.entries(answers).map(([questionKey, value]) => {
          const attributeKey = `room.${questionKey}`
          const mapKey = obsMapKey(room.id, attributeKey)
          const id = nextObsIds[mapKey] ?? uuid()
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

  async function reopenInspection(targetInspectionId: string) {
    saving.value = true
    error.value = null
    try {
      await reopenInspectionLocal(targetInspectionId)
      if (inspectionId.value === targetInspectionId) {
        step.value = 3
      }
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
