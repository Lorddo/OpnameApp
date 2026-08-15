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
  saving,
  answersComplete,
  missingAnswerCount,
  missingPhotoCount,
} = storeToRefs(flow)

const helpPanel = ref<{ key: string; title: string; text: string } | null>(null)

const helpOpen = computed({
  get: () => helpPanel.value !== null,
  set: (value: boolean) => {
    if (!value) helpPanel.value = null
  },
})

function roomTypeLabel(roomTypeId: string) {
  return labelForRoomType(merged.value?.roomTypes, roomTypeId)
}

function helpKey(roomId: string, attributeKey: string) {
  return `${roomId}:${attributeKey}`
}

function openHelp(roomId: string, attributeKey: string, title: string, text: string) {
  helpPanel.value = { key: helpKey(roomId, attributeKey), title, text }
}

function closeHelp() {
  helpPanel.value = null
}

async function onSelectFloor(floorId: string) {
  flow.selectFloor(floorId)
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

defineExpose({ closeHelp })
</script>

<template>
  <div class="space-y-4">
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
            :room-id="room.id"
            :question="q"
            :help-active="helpPanel?.key === helpKey(room.id, q.attributeKey)"
            :can-use-camera="props.canUseCamera"
            @open-help="(title, text) => openHelp(room.id, q.attributeKey, title, text)"
          />
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
  </div>
</template>
