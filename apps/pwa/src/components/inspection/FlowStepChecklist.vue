<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import CreatePalette from '@/components/inspection/CreatePalette.vue'
import FlowDialog from '@/components/inspection/FlowDialog.vue'
import QuestionField from '@/components/inspection/QuestionField.vue'
import { buildCreatePalette, type PaletteItem } from '@/lib/create-palette'
import { assetTypeLabel as labelForAssetType, roomTypeLabel as labelForRoomType } from '@/lib/format'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const props = defineProps<{
  canUseCamera: boolean
}>()

const emit = defineEmits<{
  save: []
  finish: []
}>()

const { t } = useI18n()
const flow = useInspectionFlowStore()
const {
  floors,
  merged,
  activeFloorId,
  roomsOnActiveFloor,
  assetsOnActiveFloor,
  propertyAssets,
  floorAssetTypes,
  propertyAssetTypes,
  hasRoomTypes,
  hasPropertyTab,
  isPropertyTab,
  sortedRoomTypes,
  saving,
  answersComplete,
  missingAnswerCount,
  missingPhotoCount,
  propertyId,
  propertyTabHasMissing,
  structureHints,
} = storeToRefs(flow)

const helpPanel = ref<{ key: string; title: string; text: string } | null>(null)
const addingRoom = ref(false)
const addingAsset = ref(false)

const helpOpen = computed({
  get: () => helpPanel.value !== null,
  set: (value: boolean) => {
    if (!value) helpPanel.value = null
  },
})

const paletteGroups = computed(() =>
  buildCreatePalette({
    isPropertyTab: isPropertyTab.value,
    roomTypes: sortedRoomTypes.value,
    floorAssetTypes: floorAssetTypes.value,
    propertyAssetTypes: propertyAssetTypes.value,
    roomsOnFloor: roomsOnActiveFloor.value,
    assetsOnFloor: assetsOnActiveFloor.value,
    propertyAssets: propertyAssets.value,
  }),
)

const showPalette = computed(() => paletteGroups.value.some((g) => g.items.length > 0))
const paletteBusy = computed(() => addingRoom.value || addingAsset.value || saving.value)

function roomTypeLabel(roomTypeId: string) {
  return labelForRoomType(merged.value?.roomTypes, roomTypeId)
}

function assetTypeLabel(assetTypeId: string) {
  return labelForAssetType(merged.value?.assetTypes, assetTypeId)
}

function assetTitle(asset: { assetType: string; label: string | null }) {
  return asset.label?.trim() || assetTypeLabel(asset.assetType)
}

function helpKey(subjectType: string, subjectId: string, attributeKey: string) {
  return `${subjectType}:${subjectId}:${attributeKey}`
}

function openHelp(subjectType: string, subjectId: string, attributeKey: string, title: string, text: string) {
  helpPanel.value = { key: helpKey(subjectType, subjectId, attributeKey), title, text }
}

function closeHelp() {
  helpPanel.value = null
}

async function onSelectProperty() {
  flow.selectPropertyTab()
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

async function onSelectFloor(floorId: string) {
  flow.selectFloor(floorId)
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

async function onAddRoom(roomType: string) {
  const floorId = activeFloorId.value
  if (!floorId || addingRoom.value || saving.value) return
  addingRoom.value = true
  const beforeIds = new Set(roomsOnActiveFloor.value.map((room) => room.id))
  try {
    await flow.addRoom(floorId, roomType)
    await nextTick()
    const newRoom = roomsOnActiveFloor.value.find((room) => !beforeIds.has(room.id))
    if (newRoom) {
      document.getElementById(`room-${newRoom.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  } finally {
    addingRoom.value = false
  }
}

async function onAddAsset(assetType: string, floorId?: string | null) {
  if (addingAsset.value || saving.value) return
  addingAsset.value = true
  try {
    const row = await flow.addAsset(assetType, floorId ?? null)
    await nextTick()
    if (row) {
      document.getElementById(`asset-${row.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  } finally {
    addingAsset.value = false
  }
}

async function onPaletteSelect(item: PaletteItem) {
  if (paletteBusy.value || item.disabled) return
  if (item.kind === 'room') {
    await onAddRoom(item.typeId)
    return
  }
  const floorId = isPropertyTab.value ? null : activeFloorId.value
  await onAddAsset(item.typeId, floorId)
}

async function onDuplicateAsset(assetId: string) {
  if (addingAsset.value || saving.value) return
  addingAsset.value = true
  try {
    const row = await flow.duplicateAsset(assetId)
    await nextTick()
    if (row) {
      document.getElementById(`asset-${row.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  } finally {
    addingAsset.value = false
  }
}

async function onRemoveAsset(assetId: string) {
  if (addingAsset.value || saving.value) return
  addingAsset.value = true
  try {
    await flow.removeAsset(assetId)
  } finally {
    addingAsset.value = false
  }
}

function hintText(hint: string) {
  if (hint.startsWith('hintNoFacades:')) {
    const floorId = hint.slice('hintNoFacades:'.length)
    const floor = floors.value.find((f) => f.id === floorId)
    return t('flow.hintNoFacades', { floor: floor?.label ?? '' })
  }
  if (hint === 'hintRoofOutside' || hint.startsWith('hintRoofOutside:')) {
    return t('flow.hintRoofOutside')
  }
  if (hint === 'hintRoofHeated') return t('flow.hintRoofHeated')
  if (hint === 'hintFloorGround') return t('flow.hintFloorGround')
  return hint
}

defineExpose({ closeHelp })
</script>

<template>
  <div
    class="gap-3"
    :class="showPalette ? 'md:grid md:grid-cols-[6.5rem_minmax(0,1fr)]' : ''"
  >
    <CreatePalette
      v-if="showPalette"
      class="order-2 md:order-1"
      :groups="paletteGroups"
      :disabled="paletteBusy"
      @select="onPaletteSelect"
    />

    <div
      class="order-1 space-y-3 md:order-2"
      :class="showPalette ? 'pb-28 md:pb-0' : ''"
    >
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" :disabled="saving" @click="flow.enterFloors()">
          {{ t('flow.backToFloors') }}
        </Button>
        <Button
          v-if="hasPropertyTab"
          type="button"
          :variant="isPropertyTab ? 'brand' : 'outline'"
          @click="onSelectProperty"
        >
          {{ t('flow.propertyQuestions') }}
          <span
            v-if="propertyTabHasMissing"
            class="inline-block size-2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </Button>
        <Button
          v-for="floor in floors"
          :key="`top:${floor.id}`"
          type="button"
          :variant="activeFloorId === floor.id ? 'brand' : 'outline'"
          @click="onSelectFloor(floor.id)"
        >
          {{ floor.label }}
          <span
            v-if="flow.floorHasMissingAnswers(floor.id)"
            class="inline-block size-2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </Button>
      </div>

      <p
        v-for="hint in structureHints"
        :key="hint"
        class="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        {{ hintText(hint) }}
      </p>

      <div v-if="isPropertyTab" id="property-questions" class="space-y-3">
        <section
          v-if="propertyId && flow.questionsForProperty().length"
          class="rounded-lg border border-border bg-card p-3"
        >
          <div class="space-y-2">
            <QuestionField
              v-for="q in flow.questionsForProperty()"
              :key="`property:${propertyId}:${q.attributeKey}`"
              subject-type="property"
              :subject-id="propertyId"
              :question="q"
              :help-active="helpPanel?.key === helpKey('property', propertyId, q.attributeKey)"
              :can-use-camera="props.canUseCamera"
              @open-help="
                (title, text) => openHelp('property', propertyId!, q.attributeKey, title, text)
              "
            />
          </div>
        </section>

        <section v-if="propertyAssets.length" class="space-y-3">
          <h2 class="text-base font-semibold">{{ t('flow.installations') }}</h2>
          <section
            v-for="asset in propertyAssets"
            :id="`asset-${asset.id}`"
            :key="asset.id"
            class="rounded-lg border border-border bg-card p-3"
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h2 class="text-lg font-semibold">{{ assetTitle(asset) }}</h2>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  :disabled="saving || addingAsset"
                  @click="onDuplicateAsset(asset.id)"
                >
                  {{ t('flow.copyAsset') }}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="saving || addingAsset"
                  @click="onRemoveAsset(asset.id)"
                >
                  {{ t('flow.removeAsset') }}
                </Button>
              </div>
            </div>
            <div class="space-y-2">
              <QuestionField
                v-for="q in flow.questionsForAsset(asset.id)"
                :key="`${asset.id}:${q.attributeKey}`"
                subject-type="asset"
                :subject-id="asset.id"
                :question="q"
                :help-active="helpPanel?.key === helpKey('asset', asset.id, q.attributeKey)"
                :can-use-camera="props.canUseCamera"
                @open-help="(title, text) => openHelp('asset', asset.id, q.attributeKey, title, text)"
              />
            </div>
          </section>
        </section>
      </div>

      <div v-else class="space-y-3">
        <section
          v-for="room in roomsOnActiveFloor"
          :id="`room-${room.id}`"
          :key="room.id"
          class="rounded-lg border border-border bg-card p-3"
        >
          <h2 class="mb-2 border-b border-border pb-2 text-lg font-semibold">
            {{ roomTypeLabel(room.roomType) }}
          </h2>

          <div class="space-y-2">
            <QuestionField
              v-for="q in flow.questionsForRoom(room.id)"
              :key="`${room.id}:${q.attributeKey}`"
              subject-type="room"
              :subject-id="room.id"
              :question="q"
              :help-active="helpPanel?.key === helpKey('room', room.id, q.attributeKey)"
              :can-use-camera="props.canUseCamera"
              @open-help="(title, text) => openHelp('room', room.id, q.attributeKey, title, text)"
            />
          </div>
        </section>

        <p v-if="hasRoomTypes && !roomsOnActiveFloor.length" class="text-muted-foreground">
          {{ t('flow.noRoomsOnFloor') }}
        </p>

        <section
          v-for="asset in assetsOnActiveFloor"
          :id="`asset-${asset.id}`"
          :key="asset.id"
          class="rounded-lg border border-border bg-card p-3"
        >
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <h2 class="text-lg font-semibold">{{ assetTitle(asset) }}</h2>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                :disabled="saving || addingAsset"
                @click="onDuplicateAsset(asset.id)"
              >
                {{ t('flow.copyAsset') }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :disabled="saving || addingAsset"
                @click="onRemoveAsset(asset.id)"
              >
                {{ t('flow.removeAsset') }}
              </Button>
            </div>
          </div>
          <div class="space-y-2">
            <QuestionField
              v-for="q in flow.questionsForAsset(asset.id)"
              :key="`${asset.id}:${q.attributeKey}`"
              subject-type="asset"
              :subject-id="asset.id"
              :question="q"
              :help-active="helpPanel?.key === helpKey('asset', asset.id, q.attributeKey)"
              :can-use-camera="props.canUseCamera"
              @open-help="(title, text) => openHelp('asset', asset.id, q.attributeKey, title, text)"
            />
          </div>
        </section>
      </div>

      <p v-if="!answersComplete" class="text-sm text-destructive">
        <template v-if="missingAnswerCount > 0">
          {{ t('flow.incomplete', { n: missingAnswerCount }) }}
        </template>
        <template v-if="missingPhotoCount > 0">
          {{ ' ' }}{{ t('flow.incompletePhotos', { n: missingPhotoCount }) }}
        </template>
      </p>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="outline" :disabled="saving" @click="flow.enterFloors()">
          {{ t('flow.backToFloors') }}
        </Button>
        <Button
          v-if="hasPropertyTab"
          type="button"
          :variant="isPropertyTab ? 'brand' : 'outline'"
          @click="onSelectProperty"
        >
          {{ t('flow.propertyQuestions') }}
          <span
            v-if="propertyTabHasMissing"
            class="inline-block size-2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </Button>
        <Button
          v-for="floor in floors"
          :key="`bottom:${floor.id}`"
          type="button"
          :variant="activeFloorId === floor.id ? 'brand' : 'outline'"
          @click="onSelectFloor(floor.id)"
        >
          {{ floor.label }}
          <span
            v-if="flow.floorHasMissingAnswers(floor.id)"
            class="inline-block size-2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        </Button>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" :disabled="saving" @click="emit('save')">
          {{ t('flow.saveAnswers') }}
        </Button>
        <Button
          type="button"
          variant="brand"
          :disabled="saving || !answersComplete"
          @click="emit('finish')"
        >
          {{ t('flow.finish') }}
        </Button>
      </div>
    </div>

    <FlowDialog v-model:open="helpOpen" labelled-by="question-help-title">
      <template v-if="helpPanel">
        <h2 id="question-help-title" class="pr-8 text-lg font-semibold">{{ helpPanel.title }}</h2>
        <p class="mt-3 whitespace-pre-line text-sm text-muted-foreground">{{ helpPanel.text }}</p>
      </template>
    </FlowDialog>
  </div>
</template>
