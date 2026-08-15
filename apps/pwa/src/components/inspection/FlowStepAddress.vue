<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useInspectionFlowStore } from '@/stores/inspection-flow'
import { useProjectsStore } from '@/stores/projects'

const emit = defineEmits<{
  start: []
}>()

const { t } = useI18n()
const projects = useProjectsStore()
const flow = useInspectionFlowStore()
const { publishedTemplates } = storeToRefs(projects)
const {
  postcode,
  postcodeIsComplete,
  houseNumber,
  houseNumberAddition,
  selectedTemplates,
  saving,
} = storeToRefs(flow)

const selectedTemplateKeys = computed(
  () => new Set(selectedTemplates.value.map((row) => row.templateKey)),
)

function isSelected(templateKey: string) {
  return selectedTemplateKeys.value.has(templateKey)
}

function onToggleTemplate(templateKey: string, templateVersion: string) {
  flow.toggleDraftTemplate(templateKey, templateVersion)
}
</script>

<template>
  <div class="space-y-4 rounded-xl border border-border bg-card p-5">
    <div class="grid gap-4 md:grid-cols-3">
      <label class="space-y-2">
        <span class="text-sm font-medium">{{ t('flow.postcode') }}</span>
        <input
          v-model="postcode"
          class="min-h-12 w-full rounded-lg border border-input px-4 uppercase"
          autocomplete="postal-code"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="8"
          placeholder="1234 AA"
        />
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

    <div>
      <p class="mb-1 text-sm font-medium">{{ t('flow.templates') }}</p>
      <p class="mb-3 text-sm text-muted-foreground">{{ t('flow.templatesSelectHint') }}</p>
      <div class="space-y-2">
        <label
          v-for="tpl in publishedTemplates"
          :key="`${tpl.template_key}@${tpl.version}`"
          class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
        >
          <input
            type="checkbox"
            class="size-5"
            :checked="isSelected(tpl.template_key)"
            :disabled="saving"
            @click.prevent.stop="onToggleTemplate(tpl.template_key, tpl.version)"
          />
          <span>{{ tpl.label }} ({{ tpl.version }})</span>
        </label>
      </div>
    </div>

    <Button
      variant="brand"
      :disabled="saving || !postcodeIsComplete || !houseNumber || !selectedTemplates.length"
      @click="emit('start')"
    >
      {{ t('flow.start') }}
    </Button>
  </div>
</template>
