<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import TemplateSelect from '@/components/inspection/TemplateSelect.vue'
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
  selectedTemplateKeys,
  saving,
} = storeToRefs(flow)

function onEnable(templateKey: string, templateVersion: string) {
  void flow.setTemplateEnabled(templateKey, templateVersion, true)
}

function onDisable(templateKey: string, templateVersion: string) {
  void flow.setTemplateEnabled(templateKey, templateVersion, false)
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
      <TemplateSelect
        :templates="publishedTemplates"
        :selected-keys="selectedTemplateKeys"
        :disabled="saving"
        @enable="onEnable"
        @disable="onDisable"
      />
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
