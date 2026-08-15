<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import FlowDialog from '@/components/inspection/FlowDialog.vue'
import QuestionField from '@/components/inspection/QuestionField.vue'
import { roomTypeLabel as labelForRoomType } from '@/lib/format'
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
  sortedRoomTypes,
  saving,
  answersComplete,
  missingAnswerCount,
  missingPhotoCount,
  propertyId,
  propertyCompleteness,
} = storeToRefs(flow)

const helpPanel = ref<{ key: string; title: string; text: string } | null>(null)
const addRoomOpen = ref(false)
const addingRoom = ref(false)

const helpOpen = computed({
  get: () => helpPanel.value !== null,
  set: (value: boolean) => {
    if (!value) helpPanel.value = null
  },
})

function roomTypeLabel(roomTypeId: string) {
  return labelForRoomType(merged.value?.roomTypes, roomTypeId)
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

function openAddRoom() {
  if (!activeFloorId.value || saving.value || addingRoom.value) return
  addRoomOpen.value = true
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
    addRoomOpen.value = false
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

defineExpose({ closeHelp })
</script>

<template>
  <div class="space-y-4">
    <section
      v-if="propertyId && flow.questionsForProperty().length"
      id="property-questions"
      class="rounded-xl border border-border bg-card p-5"
    >
      <h2 class="mb-4 border-b border-border pb-3 text-xl font-semibold">
        {{ t('flow.propertyQuestions') }}
        <span
          v-if="
            propertyCompleteness.missingAttributeKeys.length > 0 ||
            propertyCompleteness.missingPhotoAttributeKeys.length > 0
          "
          class="ml-2 inline-block size-2 rounded-full bg-destructive"
          aria-hidden="true"
        />
      </h2>
      <div class="space-y-4">
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

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" :disabled="saving" @click="flow.enterFloors()">
        {{ t('flow.backToFloors') }}
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

    <div class="space-y-6">
      <section
        v-for="room in roomsOnActiveFloor"
        :id="`room-${room.id}`"
        :key="room.id"
        class="rounded-xl border border-border bg-card p-5"
      >
        <h2 class="mb-4 border-b border-border pb-3 text-xl font-semibold">
          {{ roomTypeLabel(room.roomType) }}
        </h2>

        <div class="space-y-4">
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

      <p v-if="!roomsOnActiveFloor.length" class="text-muted-foreground">
        {{ t('flow.noRoomsOnFloor') }}
      </p>

      <Button
        type="button"
        variant="outline"
        :disabled="saving || addingRoom || !activeFloorId"
        @click="openAddRoom"
      >
        + {{ t('flow.addRoom') }}
      </Button>
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
    <div class="flex flex-wrap gap-3">
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

    <FlowDialog v-model:open="helpOpen" labelled-by="question-help-title">
      <template v-if="helpPanel">
        <h2 id="question-help-title" class="pr-8 text-lg font-semibold">{{ helpPanel.title }}</h2>
        <p class="mt-3 whitespace-pre-line text-sm text-muted-foreground">{{ helpPanel.text }}</p>
      </template>
    </FlowDialog>

    <FlowDialog v-model:open="addRoomOpen" labelled-by="add-room-title">
      <h2 id="add-room-title" class="pr-8 text-lg font-semibold">{{ t('flow.addRoomTitle') }}</h2>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('flow.addRoomHint') }}</p>
      <div class="mt-4 space-y-2">
        <button
          v-for="rt in sortedRoomTypes"
          :key="rt.id"
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border px-4 text-left hover:bg-muted/50 disabled:opacity-50"
          :disabled="addingRoom || saving"
          @click="onAddRoom(rt.id)"
        >
          <span class="flex-1">{{ rt.label }}</span>
          <span
            v-if="activeFloorId && flow.roomsOfType(activeFloorId, rt.id).length > 0"
            class="text-sm text-muted-foreground"
          >
            ×{{ flow.roomsOfType(activeFloorId, rt.id).length }}
          </span>
        </button>
      </div>
    </FlowDialog>
  </div>
</template>
