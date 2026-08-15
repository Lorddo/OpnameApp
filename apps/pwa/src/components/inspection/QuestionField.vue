<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Info, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import FlowDialog from '@/components/inspection/FlowDialog.vue'
import {
  NONE_OPTION,
  attributeQuestionKey,
  isPhotoRequired,
  observationMapKey,
  subjectAnswerKey,
  withNoneOfTheseDefault,
} from '@opnameapp/core'
import type { VisibleQuestion } from '@opnameapp/core'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const props = defineProps<{
  subjectType: 'property' | 'room' | 'asset'
  subjectId: string
  question: VisibleQuestion
  helpActive: boolean
  canUseCamera: boolean
}>()

const emit = defineEmits<{
  'open-help': [title: string, text: string]
}>()

const { t } = useI18n()
const flow = useInspectionFlowStore()
const { saving, uploadingPhotoKey } = storeToRefs(flow)
const selectedPhotoId = ref<string | null>(null)
const pendingDeletePhotoId = ref<string | null>(null)
const deleteDialogOpen = computed({
  get: () => pendingDeletePhotoId.value != null,
  set: (open) => {
    if (!open) pendingDeletePhotoId.value = null
  },
})

const qKey = computed(() => attributeQuestionKey(props.question.attributeKey))
const subjectKey = computed(() => subjectAnswerKey(props.subjectType, props.subjectId))
const photoKey = computed(() =>
  observationMapKey(props.subjectType, props.subjectId, props.question.attributeKey),
)

function answerModel() {
  return flow.answersBySubject[subjectKey.value]?.[qKey.value] ?? null
}

function onAnswer(value: unknown) {
  flow.setAnswer(props.subjectType, props.subjectId, qKey.value, value)
}

function selectedValues(value: unknown, options?: Array<{ value: string }>): string[] {
  const effective = withNoneOfTheseDefault(value, options)
  return Array.isArray(effective)
    ? effective.filter((item): item is string => typeof item === 'string')
    : []
}

function exclusiveMultiValue(options?: Array<{ value: string }>) {
  return options?.find((opt) => opt.value === NONE_OPTION || opt.value === 'onbekend')?.value
}

function onToggleMultiChoice(optionValue: string, options?: Array<{ value: string }>) {
  const current = selectedValues(answerModel(), options)
  const exclusive = exclusiveMultiValue(options)
  if (exclusive && optionValue === exclusive) {
    onAnswer([exclusive])
    return
  }
  const withoutExclusive = exclusive ? current.filter((item) => item !== exclusive) : current
  const next = withoutExclusive.includes(optionValue)
    ? withoutExclusive.filter((item) => item !== optionValue)
    : [...withoutExclusive, optionValue]
  if (next.length) {
    onAnswer(next)
    return
  }
  onAnswer(exclusive === NONE_OPTION ? [NONE_OPTION] : [])
}

function isMissing() {
  return flow
    .missingKeysForSubject(props.subjectType, props.subjectId)
    .includes(props.question.attributeKey)
}

function isMissingPhoto() {
  return flow
    .missingPhotoKeysForSubject(props.subjectType, props.subjectId)
    .includes(props.question.attributeKey)
}

function isUploadingPhoto() {
  return uploadingPhotoKey.value === photoKey.value
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await flow.uploadPhoto(props.subjectType, props.subjectId, props.question.attributeKey, file)
}

function onPhotoTap(photoId: string) {
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId
}

function onDeletePhotoClick(photoId: string) {
  pendingDeletePhotoId.value = photoId
}

async function confirmDeletePhoto() {
  const id = pendingDeletePhotoId.value
  pendingDeletePhotoId.value = null
  if (!id) return
  if (selectedPhotoId.value === id) selectedPhotoId.value = null
  await flow.removePhoto(id)
}

function onHelpClick() {
  const text = props.question.helpText
  if (!text) return
  emit('open-help', props.question.attributeLabel, text)
}
</script>

<template>
  <div
    class="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
    :class="isMissing() ? 'rounded-lg ring-1 ring-destructive/30' : ''"
  >
    <div class="flex items-start gap-1">
      <p class="min-w-0 flex-1 font-semibold">{{ question.attributeLabel }}</p>
      <button
        v-if="question.helpText"
        type="button"
        class="-mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="helpActive ? 'bg-muted text-foreground' : ''"
        :aria-label="t('flow.questionHelp')"
        :aria-expanded="helpActive"
        aria-haspopup="dialog"
        @click="onHelpClick"
      >
        <Info class="size-5" aria-hidden="true" />
      </button>
    </div>
    <p v-if="isMissing()" class="text-sm text-destructive">
      {{ t('flow.unanswered') }}
    </p>

    <div v-if="question.answerType === 'boolean'" class="flex gap-3">
      <Button
        type="button"
        :variant="answerModel() === true ? 'brand' : 'outline'"
        @click="onAnswer(true)"
      >
        {{ t('common.yes') }}
      </Button>
      <Button
        type="button"
        :variant="answerModel() === false ? 'brand' : 'outline'"
        @click="onAnswer(false)"
      >
        {{ t('common.no') }}
      </Button>
    </div>

    <div v-else-if="question.answerType === 'choice'" class="space-y-2">
      <label
        v-for="opt in question.options ?? []"
        :key="opt.value"
        class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
      >
        <input
          type="radio"
          class="size-5"
          :name="`${subjectType}:${subjectId}:${question.attributeKey}`"
          :value="opt.value"
          :checked="answerModel() === opt.value"
          @change="onAnswer(opt.value)"
        />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <div v-else-if="question.answerType === 'multiChoice'" class="space-y-2">
      <label
        v-for="opt in question.options ?? []"
        :key="opt.value"
        class="flex min-h-12 items-center gap-3 rounded-lg border border-border px-4"
      >
        <input
          type="checkbox"
          class="size-5"
          :checked="selectedValues(answerModel(), question.options).includes(opt.value)"
          @change="onToggleMultiChoice(opt.value, question.options)"
        />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <input
      v-else
      class="min-h-12 w-full rounded-lg border border-input px-4"
      :type="question.answerType === 'number' ? 'number' : 'text'"
      :value="(answerModel() as string | number | null) ?? ''"
      @input="
        onAnswer(
          question.answerType === 'number'
            ? Number(($event.target as HTMLInputElement).value)
            : ($event.target as HTMLInputElement).value,
        )
      "
    />

    <div
      v-if="isPhotoRequired(question, withNoneOfTheseDefault(answerModel(), question.options))"
      class="space-y-2 pt-1"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium">{{ t('flow.photos') }}</span>
        <span class="text-xs font-medium text-amber-700 dark:text-amber-400">
          {{ t('flow.photoRequired') }}
        </span>
        <span class="text-xs text-muted-foreground">{{ t('flow.photoHint') }}</span>
        <span v-if="isMissingPhoto()" class="text-sm text-destructive">
          {{ t('flow.photoMissing') }}
        </span>
      </div>
      <div
        v-if="flow.photosForQuestion(subjectType, subjectId, question.attributeKey).length"
        class="flex flex-wrap gap-3"
      >
        <div
          v-for="photo in flow.photosForQuestion(subjectType, subjectId, question.attributeKey)"
          :key="photo.id"
          class="relative"
        >
          <button
            type="button"
            class="h-20 w-20 overflow-hidden rounded-lg border border-border"
            :class="
              selectedPhotoId === photo.id
                ? 'ring-2 ring-brand ring-offset-2 ring-offset-background'
                : ''
            "
            :aria-label="t('flow.selectPhoto')"
            :aria-pressed="selectedPhotoId === photo.id"
            @click="onPhotoTap(photo.id)"
          >
            <img
              :src="photo.previewUrl ?? undefined"
              :alt="t('flow.photoAlt')"
              class="h-full w-full object-cover"
            />
          </button>
          <button
            v-if="selectedPhotoId === photo.id"
            type="button"
            class="absolute -right-2 -top-2 inline-flex size-11 items-center justify-center rounded-full border-2 border-card bg-destructive text-destructive-foreground shadow-md"
            :aria-label="t('flow.deletePhoto')"
            :disabled="saving"
            @click="onDeletePhotoClick(photo.id)"
          >
            <Trash2 class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <label v-if="canUseCamera" class="inline-flex">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            class="sr-only"
            :disabled="saving || isUploadingPhoto()"
            @change="onPhotoSelected($event)"
          />
          <span
            class="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
            :class="saving || isUploadingPhoto() ? 'pointer-events-none opacity-50' : ''"
          >
            {{ isUploadingPhoto() ? t('flow.photoUploading') : t('flow.takePhoto') }}
          </span>
        </label>
        <label class="inline-flex">
          <input
            type="file"
            accept="image/*"
            class="sr-only"
            :disabled="saving || isUploadingPhoto()"
            @change="onPhotoSelected($event)"
          />
          <span
            class="inline-flex min-h-12 cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
            :class="saving || isUploadingPhoto() ? 'pointer-events-none opacity-50' : ''"
          >
            {{ isUploadingPhoto() ? t('flow.photoUploading') : t('flow.choosePhoto') }}
          </span>
        </label>
      </div>
    </div>

    <FlowDialog v-model:open="deleteDialogOpen" labelled-by="delete-photo-title" :show-close="false">
      <h2 id="delete-photo-title" class="text-lg font-semibold">
        {{ t('flow.deletePhotoTitle') }}
      </h2>
      <p class="mt-3 text-sm text-muted-foreground">
        {{ t('flow.deletePhotoBody') }}
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" @click="deleteDialogOpen = false">
          {{ t('flow.deletePhotoCancel') }}
        </Button>
        <Button variant="destructive" :disabled="saving" @click="confirmDeletePhoto">
          {{ t('flow.deletePhotoConfirm') }}
        </Button>
      </div>
    </FlowDialog>
  </div>
</template>
