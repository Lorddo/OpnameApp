<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CompletenessEntry, DossierInspection } from '@/components/dossier/types'

defineProps<{
  inspections: DossierInspection[]
  completenessEntries: CompletenessEntry[]
  statusLabel: (status: string) => string
  formatDate: (value: string | null | undefined) => string
}>()

const { t } = useI18n()
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-5 print:bg-white print:shadow-none">
    <h2 class="mb-3 text-lg font-semibold">{{ t('dossier.inspections') }}</h2>
    <ul class="space-y-3">
      <li v-for="inspection in inspections" :key="inspection.id">
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
      <li v-if="!inspections.length" class="text-muted-foreground">
        {{ t('dossier.empty') }}
      </li>
    </ul>
    <div v-if="completenessEntries.length" class="mt-4 space-y-2 border-t border-border pt-4">
      <h3 class="text-sm font-semibold">{{ t('dossier.completeness') }}</h3>
      <p
        v-for="row in completenessEntries"
        :key="`${row.templateKey}@${row.templateVersion}`"
        class="text-sm"
      >
        <span class="font-medium"
          >{{ row.templateKey.toUpperCase() }} {{ row.templateVersion }}</span
        >
        —
        {{
          row.isComplete
            ? t('dossier.complete')
            : t('dossier.incompleteSummary', {
                answers: row.missingAnswerCount,
                photos: row.missingPhotoCount,
              })
        }}
      </p>
    </div>
  </div>
</template>
