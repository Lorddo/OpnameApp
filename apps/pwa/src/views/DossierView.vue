<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { apiFetch, apiFetchBlob } from '@/lib/api'
import { useInspectionFlowStore } from '@/stores/inspection-flow'
import {
  mergeTemplates,
  parseInspectionTemplate,
  type InspectionTemplate,
} from '@opnameapp/core'

type DossierFloor = { id: string; label: string; sort_order: number }
type DossierRoom = {
  id: string
  floor_id: string
  room_type: string
  label: string | null
  sort_order: number
}
type DossierObservation = {
  id?: string
  source_observation_id?: string
  subject_type: string
  subject_id: string
  attribute_key: string
  value: unknown
  updated_at?: string
  observed_at?: string
}
type DossierPhoto = {
  id: string
  observation_id: string | null
  subject_type?: string | null
  subject_id?: string | null
  storage_key?: string
}
type DossierInspection = {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  updated_at?: string
  inspection_template_pins?: Array<{ template_key: string; template_version: string }>
}
type DossierProperty = {
  postcode: string
  house_number: string
  house_number_addition: string | null
  city: string | null
}
type DossierPayload = {
  exportedAt: string
  property: DossierProperty
  floors: DossierFloor[]
  rooms: DossierRoom[]
  inspections: DossierInspection[]
  observations: DossierObservation[]
  facts: DossierObservation[]
  photos: DossierPhoto[]
}

type AnswerRow = {
  observationId: string | null
  attribute_key: string
  value: unknown
}

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const flow = useInspectionFlowStore()
const dossier = ref<DossierPayload | null>(null)
const templates = ref<InspectionTemplate[]>([])
const photoPreviewUrls = ref<Record<string, string>>({})
const error = ref<string | null>(null)
const loading = ref(true)
const reopening = ref(false)

function revokePreviews() {
  for (const url of Object.values(photoPreviewUrls.value)) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  photoPreviewUrls.value = {}
}

onMounted(async () => {
  try {
    try {
      dossier.value = await apiFetch<DossierPayload>(
        `/api/exports/properties/${route.params.propertyId}/dossier`,
      )
    } catch {
      // Local-only / pending-sync properties: build a minimal dossier from Dexie.
      const { db } = await import('@/db')
      const propertyId = String(route.params.propertyId)
      const property = await db.properties.get(propertyId)
      if (!property) throw new Error('Dossier niet beschikbaar (lokaal noch server)')
      const floors = await db.floors.where('propertyId').equals(propertyId).toArray()
      const rooms = await db.rooms.where('propertyId').equals(propertyId).toArray()
      const inspections = await db.inspections.where('propertyId').equals(propertyId).toArray()
      const observations = await db.observations.where('propertyId').equals(propertyId).toArray()
      const photos = await db.photos.where('propertyId').equals(propertyId).toArray()
      dossier.value = {
        exportedAt: new Date().toISOString(),
        property: {
          postcode: property.postcode,
          house_number: property.houseNumber,
          house_number_addition: property.houseNumberAddition,
          city: property.city,
        },
        floors: floors.map((f) => ({
          id: f.id,
          label: f.label,
          sort_order: f.sortOrder,
        })),
        rooms: rooms.map((r) => ({
          id: r.id,
          floor_id: r.floorId,
          room_type: r.roomType,
          label: r.label,
          sort_order: r.sortOrder,
        })),
        inspections: inspections.map((i) => ({
          id: i.id,
          status: i.status,
          started_at: i.startedAt,
          completed_at: i.completedAt,
          updated_at: i.updatedAt,
          inspection_template_pins: i.templates.map((t) => ({
            template_key: t.templateKey,
            template_version: t.templateVersion,
          })),
        })),
        observations: observations.map((o) => ({
          id: o.id,
          subject_type: o.subjectType,
          subject_id: o.subjectId,
          attribute_key: o.attributeKey,
          value: o.value,
          updated_at: o.updatedAt,
        })),
        facts: [],
        photos: photos.map((p) => ({
          id: p.id,
          observation_id: p.observationId,
          subject_type: p.subjectType,
          subject_id: p.subjectId,
        })),
      }
    }
    const pins = (dossier.value.inspections ?? []).flatMap(
      (inspection) => inspection.inspection_template_pins ?? [],
    )
    const unique = new Map(pins.map((p) => [`${p.template_key}@${p.template_version}`, p]))
    const configs: InspectionTemplate[] = []
    for (const pin of unique.values()) {
      try {
        const res = await apiFetch<{ template: { config: unknown } }>(
          `/api/templates/${pin.template_key}/${pin.template_version}`,
        )
        configs.push(parseInspectionTemplate(res.template.config))
      } catch {
        const { db } = await import('@/db')
        const cached = await db.templates.get(`${pin.template_key}@${pin.template_version}`)
        if (cached) configs.push(parseInspectionTemplate(cached.config))
      }
    }
    templates.value = configs

    const photos = dossier.value.photos ?? []
    const previews: Record<string, string> = {}
    await Promise.all(
      photos.map(async (photo) => {
        try {
          const blob = await apiFetchBlob(`/api/photos/${photo.id}/content`)
          previews[photo.id] = URL.createObjectURL(blob)
        } catch {
          try {
            const { db } = await import('@/db')
            const local = await db.photoBlobs.get(photo.id)
            if (local) previews[photo.id] = URL.createObjectURL(local.blob)
          } catch {
            // Content may be missing if metadata exists without R2 bytes.
          }
        }
      }),
    )
    photoPreviewUrls.value = previews
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  revokePreviews()
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
  const addition = p.house_number_addition ? ` ${p.house_number_addition}` : ''
  const city = p.city ? `, ${p.city}` : ''
  return `${p.postcode} ${p.house_number}${addition}${city}`
})

function attrMeta(attributeKey: string) {
  return merged.value?.attributes[attributeKey]
}

function roomTypeLabel(roomType: string) {
  return merged.value?.roomTypes.find((rt) => rt.id === roomType)?.label ?? roomType
}

function formatValue(attributeKey: string, value: unknown) {
  if (value === true) return t('common.yes')
  if (value === false) return t('common.no')
  const attr = attrMeta(attributeKey)
  if (attr?.answerType === 'choice' && typeof value === 'string') {
    return attr.options?.find((opt) => opt.value === value)?.label ?? value
  }
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale.value === 'en' ? 'en-GB' : 'nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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
  const rooms = [...dossier.value.rooms].sort((a, b) => a.sort_order - b.sort_order)
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

function download() {
  if (!dossier.value) return
  const blob = new Blob([JSON.stringify(dossier.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dossier-${String(route.params.propertyId)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function editInspection() {
  if (!latestInspection.value) return
  reopening.value = true
  try {
    await flow.reopenInspection(latestInspection.value.id)
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
  const key = `projects.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <div class="flex flex-wrap items-center justify-between gap-3">
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
      <div class="rounded-xl border border-border bg-card p-5">
        <h2 class="mb-3 text-lg font-semibold">{{ t('dossier.inspections') }}</h2>
        <ul class="space-y-3">
          <li v-for="inspection in dossier.inspections" :key="inspection.id">
            <p class="font-medium">
              {{
                (inspection.inspection_template_pins ?? [])
                  .map((p) => `${p.template_key} ${p.template_version}`)
                  .join(', ') || t('dossier.inspection')
              }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ statusLabel(inspection.status) }}
              · {{ t('dossier.startedAt') }} {{ formatDate(inspection.started_at) }}
              <template v-if="inspection.completed_at">
                · {{ t('dossier.completedAt') }} {{ formatDate(inspection.completed_at) }}
              </template>
            </p>
          </li>
          <li v-if="!dossier.inspections.length" class="text-muted-foreground">
            {{ t('dossier.empty') }}
          </li>
        </ul>
      </div>

      <div
        v-for="floor in floorsWithRooms"
        :key="floor.id"
        class="rounded-xl border border-border bg-card p-5"
      >
        <h2 class="mb-4 text-xl font-semibold">{{ floor.label }}</h2>
        <div class="space-y-5">
          <section
            v-for="room in floor.rooms"
            :key="room.id"
            class="border-t border-border pt-4 first:border-t-0 first:pt-0"
          >
            <h3 class="mb-3 text-lg font-semibold">
              {{ room.label || roomTypeLabel(room.room_type) }}
            </h3>
            <dl class="space-y-3">
              <div
                v-for="answer in room.answers"
                :key="answer.attribute_key"
                class="space-y-2"
              >
                <div class="grid gap-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                  <dt class="text-sm text-muted-foreground">
                    {{ attrMeta(answer.attribute_key)?.label ?? answer.attribute_key }}
                  </dt>
                  <dd class="font-medium">
                    {{ formatValue(answer.attribute_key, answer.value) }}
                  </dd>
                </div>
                <div
                  v-if="photosForAnswer(room.id, answer).length"
                  class="flex flex-wrap gap-2 sm:pl-[calc(58.3%+0.25rem)]"
                >
                  <a
                    v-for="photo in photosForAnswer(room.id, answer)"
                    :key="photo.id"
                    :href="photoPreviewUrls[photo.id]"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block"
                  >
                    <img
                      v-if="photoPreviewUrls[photo.id]"
                      :src="photoPreviewUrls[photo.id]"
                      :alt="t('flow.photoAlt')"
                      class="h-20 w-20 rounded-lg border border-border object-cover"
                    />
                    <span
                      v-else
                      class="inline-flex h-20 w-20 items-center justify-center rounded-lg border border-border text-xs text-muted-foreground"
                    >
                      …
                    </span>
                  </a>
                </div>
              </div>
            </dl>
            <p v-if="!room.answers.length" class="text-sm text-muted-foreground">
              {{ t('dossier.noAnswers') }}
            </p>
          </section>
          <p v-if="!floor.rooms.length" class="text-sm text-muted-foreground">
            {{ t('flow.noRoomsOnFloor') }}
          </p>
        </div>
      </div>

      <p v-if="!floorsWithRooms.length" class="text-muted-foreground">{{ t('dossier.empty') }}</p>
    </template>
  </section>
</template>
