<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import DossierCompleteness from '@/components/dossier/DossierCompleteness.vue'
import DossierFloorSection from '@/components/dossier/DossierFloorSection.vue'
import DossierPropertyCard from '@/components/dossier/DossierPropertyCard.vue'
import { useDossierLoad } from '@/components/dossier/useDossierLoad'
import type { AnswerRow, CompletenessEntry, DossierObservation } from '@/components/dossier/types'
import {
  downloadJson,
  formatAddress,
  formatDate as formatDateLocale,
  roomTypeLabel as labelForRoomType,
  statusLabel as labelForStatus,
} from '@/lib/format'
import { useInspectionFlowStore } from '@/stores/inspection-flow'
import {
  attributeQuestionKey,
  evaluateTemplateCompleteness,
  mergeTemplates,
} from '@opnameapp/core'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const flow = useInspectionFlowStore()
const reopening = ref(false)
let printCleanup: (() => void) | null = null

const { dossier, templates, photoPreviewUrls, error, loading, load } = useDossierLoad(
  () => String(route.params.propertyId),
)

onMounted(() => {
  void load()
})

onUnmounted(() => {
  printCleanup?.()
})

const merged = computed(() => (templates.value.length ? mergeTemplates(templates.value) : null))

const latestInspection = computed(() => {
  const list = dossier.value?.inspections ?? []
  return (
    [...list].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0] ??
    null
  )
})

const address = computed(() => {
  const p = dossier.value?.property
  if (!p) return ''
  return formatAddress({
    postcode: p.postcode,
    houseNumber: p.house_number,
    houseNumberAddition: p.house_number_addition,
    city: p.city,
  })
})

function attrMeta(attributeKey: string) {
  return merged.value?.attributes[attributeKey]
}

function attrLabel(attributeKey: string) {
  return attrMeta(attributeKey)?.label ?? attributeKey
}

function roomTypeLabel(roomType: string) {
  return labelForRoomType(merged.value?.roomTypes, roomType)
}

function formatValue(attributeKey: string, value: unknown) {
  if (value === true) return t('common.yes')
  if (value === false) return t('common.no')
  const attr = attrMeta(attributeKey)
  if (attr?.answerType === 'choice' && typeof value === 'string') {
    return attr.options?.find((opt) => opt.value === value)?.label ?? value
  }
  if (attr?.answerType === 'multiChoice' && Array.isArray(value)) {
    const labels = value.map(
      (item) =>
        attr.options?.find((opt) => opt.value === item)?.label ?? String(item),
    )
    return labels.length ? labels.join(', ') : '—'
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatDate(value: string | null | undefined) {
  return formatDateLocale(value, locale.value)
}

function observationIdOf(row: DossierObservation) {
  return row.source_observation_id ?? row.id ?? null
}

function answersForRoom(roomId: string): AnswerRow[] {
  const facts = dossier.value?.facts ?? []
  const observations = dossier.value?.observations ?? []
  const rows = facts.length ? facts : observations
  const byKey = new Map<string, AnswerRow>()
  for (const row of rows) {
    if (row.subject_type !== 'room' || row.subject_id !== roomId) continue
    byKey.set(row.attribute_key, {
      observationId: observationIdOf(row),
      attribute_key: row.attribute_key,
      value: row.value,
    })
  }
  return [...byKey.values()]
}

function photosForAnswer(roomId: string, answer: AnswerRow) {
  const photos = dossier.value?.photos ?? []
  if (answer.observationId) {
    const linked = photos.filter((p) => p.observation_id === answer.observationId)
    if (linked.length) return linked
  }

  // Fallback when facts/observations drifted: resolve via observation attribute.
  const observations = dossier.value?.observations ?? []
  return photos.filter((photo) => {
    if (!photo.observation_id) return false
    const obs = observations.find((o) => o.id === photo.observation_id)
    return (
      obs?.subject_type === 'room' &&
      obs.subject_id === roomId &&
      obs.attribute_key === answer.attribute_key
    )
  })
}

const floorsWithRooms = computed(() => {
  if (!dossier.value) return []
  const floors = [...dossier.value.floors].sort((a, b) => a.sort_order - b.sort_order)
  const rooms = [...dossier.value.rooms].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return floors.map((floor) => ({
    ...floor,
    rooms: rooms
      .filter((room) => room.floor_id === floor.id)
      .map((room) => ({
        ...room,
        answers: answersForRoom(room.id),
      })),
  }))
})

const completenessEntries = computed((): CompletenessEntry[] => {
  const payload = dossier.value
  if (!payload) return []
  const fromApi = payload.completeness
  if (fromApi && Object.keys(fromApi).length) return Object.values(fromApi)

  return templates.value.map((tpl) => {
    const answersByRoom: Record<string, Record<string, unknown>> = {}
    const photosByRoom: Record<string, Record<string, number>> = {}
    for (const room of payload.rooms) {
      answersByRoom[room.id] = {}
      photosByRoom[room.id] = {}
    }
    for (const obs of payload.observations) {
      if (obs.subject_type !== 'room') continue
      const key = attributeQuestionKey(obs.attribute_key)
      answersByRoom[obs.subject_id] ??= {}
      answersByRoom[obs.subject_id]![key] = obs.value
    }
    for (const photo of payload.photos) {
      const obs = payload.observations.find((row) => row.id === photo.observation_id)
      if (!obs || obs.subject_type !== 'room') continue
      photosByRoom[obs.subject_id] ??= {}
      photosByRoom[obs.subject_id]![obs.attribute_key] =
        (photosByRoom[obs.subject_id]![obs.attribute_key] ?? 0) + 1
    }
    return evaluateTemplateCompleteness(
      tpl,
      payload.rooms.map((room) => ({ id: room.id, roomType: room.room_type })),
      answersByRoom,
      photosByRoom,
    )
  })
})

function roomIsComplete(roomId: string) {
  const rows = completenessEntries.value.flatMap((entry) =>
    entry.rooms.filter((room) => room.roomId === roomId),
  )
  if (!rows.length) return true
  return rows.every((room) => room.isComplete)
}

function printDossier() {
  if (!dossier.value || loading.value) return
  printCleanup?.()
  const previousTitle = document.title
  const slug = address.value || String(route.params.propertyId)
  document.title = `${t('dossier.title')} ${slug}`
  const restore = () => {
    document.title = previousTitle
    window.removeEventListener('afterprint', restore)
    window.clearTimeout(timer)
    printCleanup = null
  }
  const timer = window.setTimeout(restore, 60_000)
  printCleanup = restore
  window.addEventListener('afterprint', restore)
  window.print()
}

function download() {
  if (!dossier.value) return
  const completeness = Object.fromEntries(
    completenessEntries.value.map((entry) => [
      `${entry.templateKey}@${entry.templateVersion}`,
      entry,
    ]),
  )
  const payload = { ...dossier.value, completeness }
  downloadJson(`dossier-${String(route.params.propertyId)}.json`, payload)
}

async function editInspection() {
  if (!latestInspection.value || !dossier.value) return
  reopening.value = true
  try {
    await flow.reopenInspection(latestInspection.value.id, dossier.value)
    await router.push({
      name: 'inspection-resume',
      params: { inspectionId: latestInspection.value.id },
    })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    reopening.value = false
  }
}

function statusLabel(status: string) {
  return labelForStatus(t, status)
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <div class="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <Button variant="outline" @click="$router.push({ name: 'projects' })">
        {{ t('dossier.backToDashboard') }}
      </Button>
      <div v-if="dossier" class="flex flex-wrap gap-3">
        <Button
          variant="outline"
          :disabled="!latestInspection || reopening"
          @click="editInspection"
        >
          {{ t('dossier.edit') }}
        </Button>
        <Button variant="outline" :disabled="loading" @click="printDossier">
          {{ t('dossier.print') }}
        </Button>
        <Button variant="brand" @click="download">{{ t('flow.downloadDossier') }}</Button>
      </div>
    </div>

    <div>
      <h1 class="text-3xl font-bold">{{ t('dossier.title') }}</h1>
      <p v-if="address" class="mt-1 text-lg text-muted-foreground">{{ address }}</p>
    </div>

    <p v-if="loading" class="text-muted-foreground">{{ t('common.loading') }}</p>
    <p v-if="error" class="text-destructive">{{ error }}</p>

    <template v-if="dossier && !loading">
      <DossierPropertyCard :property="dossier.property" />
      <DossierCompleteness
        :inspections="dossier.inspections"
        :completeness-entries="completenessEntries"
        :status-label="statusLabel"
        :format-date="formatDate"
      />
      <DossierFloorSection
        v-for="floor in floorsWithRooms"
        :key="floor.id"
        :floor="floor"
        :room-type-label="roomTypeLabel"
        :room-is-complete="roomIsComplete"
        :attr-label="attrLabel"
        :format-value="formatValue"
        :photos-for-answer="photosForAnswer"
        :photo-preview-urls="photoPreviewUrls"
      />
      <p v-if="!floorsWithRooms.length" class="text-muted-foreground">{{ t('dossier.empty') }}</p>
    </template>
  </section>
</template>
