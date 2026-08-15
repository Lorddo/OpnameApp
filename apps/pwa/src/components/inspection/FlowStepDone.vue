<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const emit = defineEmits<{
  'go-dossier': []
  download: []
}>()

const { t } = useI18n()
const flow = useInspectionFlowStore()
const { templateCompleteness } = storeToRefs(flow)
</script>

<template>
  <div class="space-y-4 rounded-xl border border-border bg-card p-5">
    <p class="text-lg font-semibold text-success">{{ t('flow.completed') }}</p>
    <ul v-if="templateCompleteness.length" class="space-y-2">
      <li v-for="row in templateCompleteness" :key="`${row.templateKey}@${row.templateVersion}`">
        <span class="font-medium">{{ row.templateKey.toUpperCase() }} {{ row.templateVersion }}</span>
        <span class="text-muted-foreground">
          —
          {{
            row.isComplete
              ? t('dossier.complete')
              : t('dossier.incompleteSummary', {
                  answers: row.missingAnswerCount,
                  photos: row.missingPhotoCount,
                })
          }}
        </span>
      </li>
    </ul>
    <div class="flex flex-wrap gap-3">
      <Button variant="brand" @click="emit('go-dossier')">{{ t('projects.dossier') }}</Button>
      <Button variant="outline" @click="emit('download')">{{ t('flow.downloadDossier') }}</Button>
      <Button variant="outline" @click="$router.push({ name: 'projects' })">
        {{ t('nav.projects') }}
      </Button>
    </div>
  </div>
</template>
