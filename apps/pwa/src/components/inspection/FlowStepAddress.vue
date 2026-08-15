<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const emit = defineEmits<{
  start: []
}>()

const { t } = useI18n()
const flow = useInspectionFlowStore()
const {
  postcode,
  postcodeIsComplete,
  houseNumber,
  houseNumberAddition,
  selectedTemplates,
  saving,
} = storeToRefs(flow)
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

    <Button
      variant="brand"
      :disabled="saving || !postcodeIsComplete || !houseNumber || !selectedTemplates.length"
      @click="emit('start')"
    >
      {{ t('flow.start') }}
    </Button>
  </div>
</template>
