<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Button } from '@/components/ui/button'
import { useProjectsStore, type InspectionRow } from '@/stores/projects'
import { useInspectionFlowStore } from '@/stores/inspection-flow'
import { useSyncStore } from '@/stores/sync'
import type { SyncStatus } from '@/db/types'

const STATUS_ORDER = ['in_progress', 'assigned', 'draft', 'completed', 'synced'] as const

const { t, locale } = useI18n()
const router = useRouter()
const projects = useProjectsStore()
const flow = useInspectionFlowStore()
const sync = useSyncStore()
const { properties, inspections, loading, error } = storeToRefs(projects)

const groupedInspections = computed(() => {
  const byStatus = new Map<string, InspectionRow[]>()
  for (const inspection of inspections.value) {
    const status = inspection.status || 'draft'
    const list = byStatus.get(status)
    if (list) list.push(inspection)
    else byStatus.set(status, [inspection])
  }

  const known = STATUS_ORDER.filter((status) => byStatus.has(status))
  const unknown = [...byStatus.keys()].filter(
    (status) => !(STATUS_ORDER as readonly string[]).includes(status),
  )

  return [...known, ...unknown].map((status) => ({
    status,
    inspections: [...(byStatus.get(status) ?? [])].sort((a, b) =>
      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    ),
  }))
})

onMounted(() => {
  sync.start()
  void projects.loadAll().then(() => sync.refresh())
})

function propertyLabel(propertyId: string) {
  const p = properties.value.find((x) => x.id === propertyId)
  if (!p) return propertyId.slice(0, 8)
  return `${p.postcode} ${p.house_number}${p.house_number_addition ?? ''}`
}

function canResume(status: string) {
  return status !== 'completed' && status !== 'synced'
}

function openInspection(inspection: {
  id: string
  property_id: string
  status: string
  sync_status?: string
}) {
  const syncStatus = syncStatusFor(inspection)
  // Pending/error = data may only exist locally; never open remote dossier first.
  if (syncStatus === 'pending' || syncStatus === 'error' || syncStatus === 'draft') {
    void router.push({ name: 'inspection-resume', params: { inspectionId: inspection.id } })
    return
  }
  if (canResume(inspection.status)) {
    void router.push({ name: 'inspection-resume', params: { inspectionId: inspection.id } })
    return
  }
  void router.push({ name: 'dossier', params: { propertyId: inspection.property_id } })
}

function statusLabel(status: string) {
  const key = `projects.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function syncStatusFor(inspection: { id: string; sync_status?: string }): SyncStatus {
  return sync.syncLabelForInspection(inspection.id, inspection.sync_status)
}

function syncStatusLabel(status: SyncStatus) {
  return t(`sync.project.${status}`)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale.value === 'en' ? 'en-GB' : 'nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

async function onRemoveLocal(inspection: { property_id: string; id: string }, ev: Event) {
  ev.stopPropagation()
  ev.preventDefault()
  const status = syncStatusFor(inspection)
  const pending = status === 'pending' || status === 'error' || status === 'draft'
  const ok = window.confirm(
    pending ? t('projects.removeLocalConfirmPending') : t('projects.removeLocalConfirm'),
  )
  if (!ok) return
  await projects.removeLocalProperty(inspection.property_id)
  await sync.refresh()
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold">{{ t('projects.title') }}</h1>
        <p class="text-muted-foreground">{{ t('projects.body') }}</p>
      </div>
      <Button
        variant="brand"
        @click="
          flow.reset();
          $router.push({ name: 'inspection-new' })
        "
      >
        {{ t('projects.new') }}
      </Button>
    </div>

    <p v-if="loading" class="text-muted-foreground">{{ t('common.loading') }}</p>
    <p v-else-if="error" class="text-destructive">{{ error }}</p>

    <div v-else class="space-y-8">
      <section
        v-for="group in groupedInspections"
        :key="group.status"
        class="space-y-3"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {{ statusLabel(group.status) }}
        </h2>
        <div
          v-for="inspection in group.inspections"
          :key="inspection.id"
          class="flex w-full items-stretch gap-2 rounded-xl border border-border bg-card p-4 transition hover:border-primary"
        >
          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            @click="openInspection(inspection)"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-lg font-semibold">{{ propertyLabel(inspection.property_id) }}</p>
                <p class="text-sm text-muted-foreground">
                  {{ formatDate(inspection.updated_at) }}
                  ·
                  {{
                    (inspection.inspection_template_pins ?? [])
                      .map((p) => p.template_key)
                      .join(', ')
                  }}
                </p>
                <p
                  class="mt-1 text-sm font-medium"
                  :class="{
                    'text-muted-foreground': syncStatusFor(inspection) === 'synced',
                    'text-amber-700 dark:text-amber-400':
                      syncStatusFor(inspection) === 'pending' ||
                      syncStatusFor(inspection) === 'draft',
                    'text-destructive': syncStatusFor(inspection) === 'error',
                  }"
                >
                  {{ syncStatusLabel(syncStatusFor(inspection)) }}
                </p>
              </div>
              <span class="text-sm font-medium text-primary">
                {{
                  syncStatusFor(inspection) === 'pending' ||
                  syncStatusFor(inspection) === 'error' ||
                  syncStatusFor(inspection) === 'draft' ||
                  canResume(inspection.status)
                    ? t('projects.continue')
                    : t('projects.dossier')
                }}
              </span>
            </div>
          </button>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0 self-center"
            :title="t('projects.removeLocal')"
            @click="onRemoveLocal(inspection, $event)"
          >
            {{ t('projects.removeLocal') }}
          </Button>
        </div>
      </section>
      <p v-if="!inspections.length" class="text-muted-foreground">{{ t('projects.empty') }}</p>
    </div>
  </section>
</template>
