<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import FlowStepAddress from '@/components/inspection/FlowStepAddress.vue'
import FlowStepChecklist from '@/components/inspection/FlowStepChecklist.vue'
import FlowStepDone from '@/components/inspection/FlowStepDone.vue'
import FlowStepStructure from '@/components/inspection/FlowStepStructure.vue'
import { downloadJson } from '@/lib/format'
import { useProjectsStore } from '@/stores/projects'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const projects = useProjectsStore()
const flow = useInspectionFlowStore()
const { publishedTemplates } = storeToRefs(projects)
const { step, loading, error } = storeToRefs(flow)

const canUseCamera = ref(false)
const structureStep = ref<InstanceType<typeof FlowStepStructure> | null>(null)
const checklistStep = ref<InstanceType<typeof FlowStepChecklist> | null>(null)

onMounted(async () => {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  canUseCamera.value = coarse || mobileUa
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices()
    if (devices?.some((d) => d.kind === 'videoinput')) canUseCamera.value = true
  } catch {
    // Keep coarse/mobile heuristic.
  }

  if (!publishedTemplates.value.length) await projects.loadAll()

  const resumeId = typeof route.params.inspectionId === 'string' ? route.params.inspectionId : null
  if (resumeId) {
    if (flow.inspectionId !== resumeId) {
      await flow.resumeInspection(resumeId)
    }
    return
  }
})

watch(
  () => route.params.inspectionId,
  async (id) => {
    if (typeof id === 'string' && id && id !== flow.inspectionId) {
      await flow.resumeInspection(id)
    }
  },
)

watch(step, async () => {
  structureStep.value?.closeDisableDialog()
  checklistStep.value?.closeHelp()
  await nextTick()
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
})

async function onStart() {
  await flow.startInspection()
  if (flow.inspectionId) {
    await router.replace({ name: 'inspection-resume', params: { inspectionId: flow.inspectionId } })
  }
}

async function goChecklist() {
  await flow.enterChecklist()
}

function goDossier() {
  if (!flow.propertyId) return
  void router.push({ name: 'dossier', params: { propertyId: flow.propertyId } })
}

async function saveAndNext() {
  await flow.saveAllAnswers()
}

async function finish() {
  if (!flow.answersComplete) {
    flow.goToFirstIncomplete()
    return
  }
  await flow.saveAllAnswers()
  await flow.completeInspection()
}

async function download() {
  const dossier = await flow.downloadDossier()
  downloadJson(`dossier-${flow.propertyId}.json`, dossier)
}
</script>

<template>
  <section class="space-y-6 lg:col-span-2">
    <h1 class="text-3xl font-bold">
      {{ route.params.inspectionId ? t('flow.resumeTitle') : t('flow.title') }}
    </h1>
    <p class="text-sm text-muted-foreground">{{ t('flow.step', { n: step }) }}</p>
    <p v-if="error" class="text-destructive">{{ error }}</p>
    <p v-if="loading" class="text-muted-foreground">{{ t('common.loading') }}</p>

    <FlowStepAddress v-if="!loading && step === 1" @start="onStart" />
    <FlowStepStructure
      v-else-if="!loading && step === 2"
      ref="structureStep"
      @go-checklist="goChecklist"
    />
    <FlowStepChecklist
      v-else-if="!loading && step === 3"
      ref="checklistStep"
      :can-use-camera="canUseCamera"
      @save="saveAndNext"
      @finish="finish"
    />
    <FlowStepDone
      v-else-if="!loading"
      @go-dossier="goDossier"
      @download="download"
    />
  </section>
</template>
