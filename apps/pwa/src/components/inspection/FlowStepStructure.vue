<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import FlowDialog from '@/components/inspection/FlowDialog.vue'
import { useProjectsStore } from '@/stores/projects'
import { PRESET_FLOORS, useInspectionFlowStore } from '@/stores/inspection-flow'

const emit = defineEmits<{
  'go-checklist': []
}>()

const { t } = useI18n()
const projects = useProjectsStore()
const flow = useInspectionFlowStore()
const { publishedTemplates } = storeToRefs(projects)
const { selectedTemplates, floors, rooms, sortedRoomTypes, saving } = storeToRefs(flow)

const busy = ref(false)
const newFloorLabel = ref('')
const pendingDisable = ref<{ templateKey: string; label: string } | null>(null)

const disableOpen = computed({
  get: () => pendingDisable.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDisable.value = null
  },
})

const selectedTemplateKeys = computed(
  () => new Set(selectedTemplates.value.map((row) => row.templateKey)),
)

function isSelected(templateKey: string) {
  return selectedTemplateKeys.value.has(templateKey)
}

async function onToggleTemplate(templateKey: string, templateVersion: string, label: string) {
  if (busy.value || saving.value) return
  if (isSelected(templateKey)) {
    if (selectedTemplates.value.length <= 1) return
    pendingDisable.value = { templateKey, label }
    return
  }
  busy.value = true
  try {
    await flow.addInspectionTemplate(templateKey, templateVersion)
  } finally {
    busy.value = false
  }
}

function closeDisableDialog() {
  pendingDisable.value = null
}

async function confirmDisableTemplate() {
  const pending = pendingDisable.value
  pendingDisable.value = null
  if (!pending) return
  busy.value = true
  try {
    await flow.removeInspectionTemplate(pending.templateKey)
  } finally {
    busy.value = false
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

defineExpose({ closeDisableDialog })
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-xl border border-border bg-card p-4">
      <p class="mb-1 text-sm font-medium">{{ t('flow.templates') }}</p>
      <p class="mb-3 text-sm text-muted-foreground">{{ t('flow.templatesHint') }}</p>
      <div class="space-y-2">
        <label
          v-for="tpl in publishedTemplates"
          :key="`${tpl.template_key}@${tpl.version}:${isSelected(tpl.template_key) ? 'on' : 'off'}`"
          class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
        >
          <input
            type="checkbox"
            class="size-5"
            :checked="isSelected(tpl.template_key)"
            :disabled="isSelected(tpl.template_key) && selectedTemplates.length === 1"
            @click.prevent.stop="onToggleTemplate(tpl.template_key, tpl.version, tpl.label)"
          />
          <span>{{ tpl.label }} ({{ tpl.version }})</span>
        </label>
      </div>
    </div>

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
          v-for="rt in sortedRoomTypes"
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

    <Button
      variant="brand"
      :disabled="!rooms.length || busy || saving || !selectedTemplates.length"
      @click="emit('go-checklist')"
    >
      {{ t('flow.toChecklist') }}
    </Button>

    <FlowDialog v-model:open="disableOpen" labelled-by="disable-template-title" :show-close="false">
      <template v-if="pendingDisable">
        <h2 id="disable-template-title" class="text-lg font-semibold">
          {{ t('flow.disableTemplateTitle') }}
        </h2>
        <p class="mt-3 text-sm text-muted-foreground">
          {{ t('flow.disableTemplateBody', { label: pendingDisable.label }) }}
        </p>
        <div class="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" @click="closeDisableDialog">
            {{ t('flow.disableTemplateCancel') }}
          </Button>
          <Button variant="destructive" @click="confirmDisableTemplate">
            {{ t('flow.disableTemplateConfirm') }}
          </Button>
        </div>
      </template>
    </FlowDialog>
  </div>
</template>
