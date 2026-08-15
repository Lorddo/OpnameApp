<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatNlPostcode } from '@opnameapp/core'
import type { DossierProperty } from '@/components/dossier/types'

defineProps<{
  property: DossierProperty
}>()

const { t } = useI18n()
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-5 print:bg-white print:shadow-none">
    <h2 class="mb-3 text-lg font-semibold">{{ t('dossier.property') }}</h2>
    <dl class="grid gap-3 sm:grid-cols-3">
      <div>
        <dt class="text-sm text-muted-foreground">{{ t('flow.postcode') }}</dt>
        <dd class="font-medium">
          {{ formatNlPostcode(property.postcode) || property.postcode || '—' }}
        </dd>
      </div>
      <div>
        <dt class="text-sm text-muted-foreground">{{ t('flow.houseNumber') }}</dt>
        <dd class="font-medium">{{ property.house_number || '—' }}</dd>
      </div>
      <div>
        <dt class="text-sm text-muted-foreground">{{ t('flow.addition') }}</dt>
        <dd class="font-medium">{{ property.house_number_addition || '—' }}</dd>
      </div>
    </dl>
  </div>
</template>
