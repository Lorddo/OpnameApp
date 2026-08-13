<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { useProjectsStore } from '@/stores/projects'
import { PRESET_FLOORS, useInspectionFlowStore } from '@/stores/inspection-flow'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const flow = useInspectionFlowStore()
const { templates } = storeToRefs(projects)
const {
  step,
  postcode,
  houseNumber,
  houseNumberAddition,
  selectedTemplates,
  floors,
  rooms,
  merged,
  activeFloorId,
  roomsOnActiveFloor,
  saving,
  loading,
  uploadingPhotoKey,
  error,
  answersComplete,
  missingAnswerCount,
  missingPhotoCount,
} = storeToRefs(flow)

const busy = ref(false)
const newFloorLabel = ref('')
const floorRangeTo = ref<number | null>(null)
const canUseCamera = ref(false)

onMounted(async () => {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  canUseCamera.value = coarse || mobileUa
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices()
    if (devices?.some((d) => d.kind === 'videoinput')) canUseCamera.value = true
  } catch {
    // Keep coarse/mobile heuristic.
  }

  if (!templates.value.length) await projects.loadAll()

  const resumeId = typeof route.params.inspectionId === 'string' ? route.params.inspectionId : null
  if (resumeId) {
    if (flow.inspectionId !== resumeId) {
      await flow.resumeInspection(resumeId)
    }
    return
  }

  if (!selectedTemplates.value.length && templates.value[0]) {
    selectedTemplates.value = [
      {
        templateKey: templates.value[0].template_key,
        templateVersion: templates.value[0].version,
      },
    ]
  }
})

watch(
  () => route.params.inspectionId,
  async (id) => {
    if (typeof id === 'string' && id && id !== flow.inspectionId) {
      await flow.resumeInspection(id)
    }
  },
)

watch(step, async () => {
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})

function toggleTemplate(templateKey: string, templateVersion: string) {
  const idx = selectedTemplates.value.findIndex((t) => t.templateKey === templateKey)
  if (idx >= 0) selectedTemplates.value.splice(idx, 1)
  else selectedTemplates.value.push({ templateKey, templateVersion })
}

function isSelected(templateKey: string) {
  return selectedTemplates.value.some((t) => t.templateKey === templateKey)
}

async function onStart() {
  await flow.startInspection()
  if (flow.inspectionId) {
    await router.replace({ name: 'inspection-resume', params: { inspectionId: flow.inspectionId } })
  }
}

async function onAddFloor() {
  const label = newFloorLabel.value.trim()
  if (!label) return
  busy.value = true
  try {
    await flow.addFloor(label)
    newFloorLabel.value = ''
  } finally {
    busy.value = false
  }
}

async function onAddFloorRange() {
  if (!floorRangeTo.value) return
  busy.value = true
  try {
    await flow.addNumberedFloors(floorRangeTo.value)
  } finally {
    busy.value = false
  }
}

async function onRemoveFloor(floorId: string) {
  busy.value = true
  try {
    await flow.removeFloor(floorId)
  } finally {
    busy.value = false
  }
}

async function onToggleRoom(floorId: string, roomType: string) {
  busy.value = true
  try {
    await flow.toggleRoomType(floorId, roomType)
  } finally {
    busy.value = false
  }
}

async function onAddExtraRoom(floorId: string, roomType: string) {
  busy.value = true
  try {
    await flow.addRoom(floorId, roomType)
  } finally {
    busy.value = false
  }
}

function answerModel(roomId: string, questionKey: string) {
  return flow.answersByRoom[roomId]?.[questionKey] ?? null
}

function onAnswer(roomId: string, questionKey: string, value: unknown) {
  flow.setAnswer(roomId, questionKey, value)
}

function goChecklist() {
  flow.enterChecklist()
}

function questionKey(attributeKey: string) {
  return attributeKey.includes('.') ? attributeKey.split('.').slice(1).join('.') : attributeKey
}

function isMissing(roomId: string, attributeKey: string) {
  return flow.missingKeysForRoom(roomId).includes(attributeKey)
}

function isMissingPhoto(roomId: string, attributeKey: string) {
  return flow.missingPhotoKeysForRoom(roomId).includes(attributeKey)
}

function isUploadingPhoto(roomId: string, attributeKey: string) {
  return uploadingPhotoKey.value === `${roomId}|${attributeKey}`
}

async function onPhotoSelected(roomId: string, attributeKey: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await flow.uploadPhoto(roomId, attributeKey, file)
}

function goDossier() {
  if (!flow.propertyId) return
  void router.push({ name: 'dossier', params: { propertyId: flow.propertyId } })
}

async function saveAndNext() {
  await flow.saveAllAnswers()
}

async function finish() {
  if (!flow.answersComplete) {
    flow.goToFirstIncomplete()
    return
  }
  await flow.saveAllAnswers()
  await flow.completeInspection()
}

async function download() {
  const dossier = await flow.downloadDossier()
  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dossier-${flow.propertyId}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function roomTypeLabel(roomTypeId: string) {
  return merged.value?.roomTypes.find((rt) => rt.id === roomTypeId)?.label ?? roomTypeId
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <h1 class="text-3xl font-bold">
      {{ route.params.inspectionId ? t('flow.resumeTitle') : t('flow.title') }}
    </h1>
    <p class="text-sm text-muted-foreground">{{ t('flow.step', { n: step }) }}</p>
    <p v-if="error" class="text-destructive">{{ error }}</p>
    <p v-if="loading" class="text-muted-foreground">{{ t('common.loading') }}</p>

    <!-- Step 1 -->
    <div v-if="!loading && step === 1" class="space-y-4 rounded-xl border border-border bg-card p-5">
      <div class="grid gap-4 md:grid-cols-3">
        <label class="space-y-2">
          <span class="text-sm font-medium">{{ t('flow.postcode') }}</span>
          <input v-model="postcode" class="min-h-12 w-full rounded-lg border border-input px-4" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">{{ t('flow.houseNumber') }}</span>
          <input v-model="houseNumber" class="min-h-12 w-full rounded-lg border border-input px-4" />
        </label>
        <label class="space-y-2">
          <span class="text-sm font-medium">{{ t('flow.addition') }}</span>
          <input
            v-model="houseNumberAddition"
            class="min-h-12 w-full rounded-lg border border-input px-4"
          />
        </label>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">{{ t('flow.templates') }}</p>
        <label
          v-for="tpl in templates"
          :key="`${tpl.template_key}@${tpl.version}`"
          class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
        >
          <input
            type="checkbox"
            class="size-5"
            :checked="isSelected(tpl.template_key)"
            @change="toggleTemplate(tpl.template_key, tpl.version)"
          />
          <span>{{ tpl.label }} ({{ tpl.version }})</span>
        </label>
      </div>

      <Button
        variant="brand"
        :disabled="saving || !postcode || !houseNumber || !selectedTemplates.length"
        @click="onStart"
      >
        {{ t('flow.start') }}
      </Button>
    </div>

    <!-- Step 2 -->
    <div v-else-if="!loading && step === 2" class="space-y-4">
      <div class="rounded-xl border border-border bg-card p-4">
        <p class="mb-3 text-sm font-medium">{{ t('flow.floors') }}</p>
        <p class="mb-3 text-sm text-muted-foreground">{{ t('flow.floorsHint') }}</p>
        <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="onAddFloor">
          <input
            v-model="newFloorLabel"
            list="preset-floors"
            class="min-h-12 flex-1 rounded-lg border border-input px-4"
            :placeholder="t('flow.floorPlaceholder')"
            :disabled="busy || saving"
          />
          <datalist id="preset-floors">
            <option v-for="label in PRESET_FLOORS" :key="label" :value="label" />
          </datalist>
          <Button type="submit" variant="brand" :disabled="busy || saving || !newFloorLabel.trim()">
            {{ t('flow.addFloor') }}
          </Button>
        </form>
        <form
          class="mt-3 flex flex-wrap items-center gap-2"
          @submit.prevent="onAddFloorRange"
        >
          <span class="text-sm text-muted-foreground">{{ t('flow.addFloorsRange') }}</span>
          <input
            v-model.number="floorRangeTo"
            type="number"
            min="1"
            max="80"
            class="h-12 w-20 rounded-lg border border-input px-3 text-center"
            :disabled="busy || saving"
          />
          <span class="text-sm text-muted-foreground">{{ t('flow.addFloorsRangeSuffix') }}</span>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            :disabled="busy || saving || !floorRangeTo || floorRangeTo < 1"
          >
            {{ t('flow.addFloor') }}
          </Button>
        </form>
        <ul v-if="floors.length" class="mt-4 space-y-2">
          <li
            v-for="floor in floors"
            :key="floor.id"
            class="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-4"
          >
            <span>{{ floor.label }}</span>
            <Button
              variant="ghost"
              size="sm"
              :disabled="busy || saving"
              @click="onRemoveFloor(floor.id)"
            >
              {{ t('flow.removeFloor') }}
            </Button>
          </li>
        </ul>
      </div>

      <div
        v-for="floor in floors"
        :key="floor.id"
        class="rounded-xl border border-border bg-card p-4"
      >
        <p class="mb-3 text-lg font-semibold">{{ floor.label }}</p>
        <p class="mb-2 text-sm text-muted-foreground">{{ t('flow.rooms') }}</p>
        <div class="space-y-2">
          <div
            v-for="rt in merged?.roomTypes ?? []"
            :key="rt.id"
            class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
          >
            <input
              type="checkbox"
              class="size-5"
              :checked="flow.roomsOfType(floor.id, rt.id).length > 0"
              :disabled="busy || saving"
              @change="onToggleRoom(floor.id, rt.id)"
            />
            <span class="flex-1">{{ rt.label }}</span>
            <span
              v-if="flow.roomsOfType(floor.id, rt.id).length > 0"
              class="text-sm text-muted-foreground"
            >
              ×{{ flow.roomsOfType(floor.id, rt.id).length }}
            </span>
            <button
              v-if="flow.roomsOfType(floor.id, rt.id).length > 0"
              type="button"
              class="rounded-md border border-border px-2 py-1 text-sm"
              :disabled="busy || saving"
              @click="onAddExtraRoom(floor.id, rt.id)"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <Button variant="brand" :disabled="!rooms.length || busy" @click="goChecklist">
        {{ t('flow.toChecklist') }}
      </Button>
    </div>

    <!-- Step 3 -->
    <div v-else-if="!loading && step === 3" class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="floor in floors"
          :key="floor.id"
          type="button"
          :variant="activeFloorId === floor.id ? 'brand' : 'outline'"
          @click="flow.selectFloor(floor.id)"
        >
          {{ floor.label }}
          <span
            v-if="flow.floorHasMissingAnswers(floor.id)"
            class="inline-block size-2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </Button>
      </div>

      <div class="space-y-6">
        <section
          v-for="room in roomsOnActiveFloor"
          :key="room.id"
          class="rounded-xl border border-border bg-card p-5"
        >
          <h2 class="mb-4 border-b border-border pb-3 text-xl font-semibold">
            {{ roomTypeLabel(room.roomType) }}
          </h2>

          <div class="space-y-4">
            <div
              v-for="q in flow.questionsForRoom(room.id)"
              :key="`${room.id}:${q.attributeKey}`"
              class="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
              :class="isMissing(room.id, q.attributeKey) ? 'rounded-lg ring-1 ring-destructive/30' : ''"
            >
              <p class="font-semibold">{{ q.attributeLabel }}</p>
              <p v-if="q.helpText" class="text-sm text-muted-foreground">{{ q.helpText }}</p>
              <p v-if="isMissing(room.id, q.attributeKey)" class="text-sm text-destructive">
                {{ t('flow.unanswered') }}
              </p>

              <div v-if="q.answerType === 'boolean'" class="flex gap-3">
                <Button
                  type="button"
                  :variant="
                    answerModel(room.id, questionKey(q.attributeKey)) === true
                      ? 'brand'
                      : 'outline'
                  "
                  @click="onAnswer(room.id, questionKey(q.attributeKey), true)"
                >
                  {{ t('common.yes') }}
                </Button>
                <Button
                  type="button"
                  :variant="
                    answerModel(room.id, questionKey(q.attributeKey)) === false
                      ? 'brand'
                      : 'outline'
                  "
                  @click="onAnswer(room.id, questionKey(q.attributeKey), false)"
                >
                  {{ t('common.no') }}
                </Button>
              </div>

              <div v-else-if="q.answerType === 'choice'" class="space-y-2">
                <label
                  v-for="opt in q.options ?? []"
                  :key="opt.value"
                  class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
                >
                  <input
                    type="radio"
                    class="size-5"
                    :name="`${room.id}:${q.attributeKey}`"
                    :value="opt.value"
                    :checked="answerModel(room.id, questionKey(q.attributeKey)) === opt.value"
                    @change="onAnswer(room.id, questionKey(q.attributeKey), opt.value)"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              </div>

              <input
                v-else
                class="min-h-12 w-full rounded-lg border border-input px-4"
                :type="q.answerType === 'number' ? 'number' : 'text'"
                :value="
                  (answerModel(room.id, questionKey(q.attributeKey)) as
                    | string
                    | number
                    | null) ?? ''
                "
                @input="
                  onAnswer(
                    room.id,
                    questionKey(q.attributeKey),
                    q.answerType === 'number'
                      ? Number(($event.target as HTMLInputElement).value)
                      : ($event.target as HTMLInputElement).value,
                  )
                "
              />

              <div v-if="q.photoRequired" class="space-y-2 pt-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium">{{ t('flow.photos') }}</span>
                  <span class="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {{ t('flow.photoRequired') }}
                  </span>
                  <span
                    v-if="isMissingPhoto(room.id, q.attributeKey)"
                    class="text-sm text-destructive"
                  >
                    {{ t('flow.photoMissing') }}
                  </span>
                </div>
                <div
                  v-if="flow.photosForQuestion(room.id, q.attributeKey).length"
                  class="flex flex-wrap gap-2"
                >
                  <img
                    v-for="photo in flow.photosForQuestion(room.id, q.attributeKey)"
                    :key="photo.id"
                    :src="photo.previewUrl ?? undefined"
                    :alt="t('flow.photoAlt')"
                    class="h-20 w-20 rounded-lg border border-border object-cover"
                  />
                </div>
                <div class="flex flex-wrap gap-2">
                  <label v-if="canUseCamera" class="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      class="sr-only"
                      :disabled="saving || isUploadingPhoto(room.id, q.attributeKey)"
                      @change="onPhotoSelected(room.id, q.attributeKey, $event)"
                    />
                    <span
                      class="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                      :class="
                        saving || isUploadingPhoto(room.id, q.attributeKey)
                          ? 'pointer-events-none opacity-50'
                          : ''
                      "
                    >
                      {{
                        isUploadingPhoto(room.id, q.attributeKey)
                          ? t('flow.photoUploading')
                          : t('flow.takePhoto')
                      }}
                    </span>
                  </label>
                  <label class="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      class="sr-only"
                      :disabled="saving || isUploadingPhoto(room.id, q.attributeKey)"
                      @change="onPhotoSelected(room.id, q.attributeKey, $event)"
                    />
                    <span
                      class="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
                      :class="
                        saving || isUploadingPhoto(room.id, q.attributeKey)
                          ? 'pointer-events-none opacity-50'
                          : ''
                      "
                    >
                      {{
                        isUploadingPhoto(room.id, q.attributeKey)
                          ? t('flow.photoUploading')
                          : t('flow.choosePhoto')
                      }}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p v-if="!roomsOnActiveFloor.length" class="text-muted-foreground">
          {{ t('flow.noRoomsOnFloor') }}
        </p>
      </div>

      <p v-if="!answersComplete" class="text-sm text-destructive">
        <template v-if="missingAnswerCount > 0">
          {{ t('flow.incomplete', { n: missingAnswerCount }) }}
        </template>
        <template v-if="missingPhotoCount > 0">
          {{ ' ' }}{{ t('flow.incompletePhotos', { n: missingPhotoCount }) }}
        </template>
      </p>
      <div class="flex flex-wrap gap-3">
        <Button type="button" variant="outline" :disabled="saving" @click="flow.enterFloors()">
          {{ t('flow.backToFloors') }}
        </Button>
        <Button type="button" variant="secondary" :disabled="saving" @click="saveAndNext">
          {{ t('flow.saveAnswers') }}
        </Button>
        <Button type="button" variant="brand" :disabled="saving || !answersComplete" @click="finish">
          {{ t('flow.finish') }}
        </Button>
      </div>
    </div>

    <!-- Step 4 -->
    <div v-else-if="!loading" class="space-y-4 rounded-xl border border-border bg-card p-5">
      <p class="text-lg font-semibold text-success">{{ t('flow.completed') }}</p>
      <div class="flex flex-wrap gap-3">
        <Button variant="brand" @click="goDossier">{{ t('projects.dossier') }}</Button>
        <Button variant="outline" @click="download">{{ t('flow.downloadDossier') }}</Button>
        <Button variant="outline" @click="$router.push({ name: 'projects' })">
          {{ t('nav.projects') }}
        </Button>
      </div>
    </div>
  </section>
</template>
