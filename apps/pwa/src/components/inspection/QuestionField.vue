<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Camera, Image as ImageIcon, Images, Info, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import FlowDialog from '@/components/inspection/FlowDialog.vue'
import PhotoLightbox from '@/components/inspection/PhotoLightbox.vue'
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
const previewPhotoId = ref<string | null>(null)
const pendingDeletePhotoId = ref<string | null>(null)
const deleteDialogOpen = computed({
  get: () => pendingDeletePhotoId.value != null,
  set: (open) => {
    if (!open) pendingDeletePhotoId.value = null
  },
})
const previewOpen = computed({
  get: () => previewPhotoId.value != null,
  set: (open) => {
    if (!open) previewPhotoId.value = null
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
  previewPhotoId.value = photoId
}

function onDeletePhotoClick(photoId: string) {
  previewPhotoId.value = null
  pendingDeletePhotoId.value = photoId
}

async function confirmDeletePhoto() {
  const id = pendingDeletePhotoId.value
  pendingDeletePhotoId.value = null
  if (!id) return
  if (previewPhotoId.value === id) previewPhotoId.value = null
  await flow.removePhoto(id)
}

function onHelpClick() {
  const text = props.question.helpText
  if (!text) return
  emit('open-help', props.question.attributeLabel, text)
}

const questionPhotos = computed(() =>
  flow.photosForQuestion(props.subjectType, props.subjectId, props.question.attributeKey),
)

const photoIsRequired = computed(() =>
  isPhotoRequired(props.question, withNoneOfTheseDefault(answerModel(), props.question.options)),
)

const previewPhoto = computed(
  () => questionPhotos.value.find((photo) => photo.id === previewPhotoId.value) ?? null,
)
</script>

<template>
  <div
    class="space-y-1 border-b border-border pb-2 last:border-b-0 last:pb-0"
    :class="isMissing() ? 'rounded-md ring-1 ring-destructive/30' : ''"
  >
    <div class="flex items-start gap-1">
      <p class="min-w-0 flex-1 text-sm font-semibold leading-snug">{{ question.attributeLabel }}</p>
      <button
        v-if="question.helpText"
        type="button"
        class="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="helpActive ? 'bg-muted text-foreground' : ''"
        :aria-label="t('flow.questionHelp')"
        :aria-expanded="helpActive"
        aria-haspopup="dialog"
        @click="onHelpClick"
      >
        <Info class="size-4" aria-hidden="true" />
      </button>
    </div>
    <p v-if="isMissing()" class="text-xs text-destructive">
      {{ t('flow.unanswered') }}
    </p>

    <div class="flex items-stretch gap-2">
      <div class="min-w-0 flex-1">
        <div v-if="question.answerType === 'boolean'">
          <label class="flex min-h-9 items-center gap-2 border-b border-border text-sm">
            <input
              type="radio"
              class="size-4"
              :name="`${subjectType}:${subjectId}:${question.attributeKey}`"
              :checked="answerModel() === true"
              @change="onAnswer(true)"
            />
            <span>{{ t('common.yes') }}</span>
          </label>
          <label class="flex min-h-9 items-center gap-2 border-b border-border text-sm">
            <input
              type="radio"
              class="size-4"
              :name="`${subjectType}:${subjectId}:${question.attributeKey}`"
              :checked="answerModel() === false"
              @change="onAnswer(false)"
            />
            <span>{{ t('common.no') }}</span>
          </label>
        </div>

        <div v-else-if="question.answerType === 'choice'">
          <label
            v-for="opt in question.options ?? []"
            :key="opt.value"
            class="flex min-h-9 items-center gap-2 border-b border-border text-sm"
          >
            <input
              type="radio"
              class="size-4"
              :name="`${subjectType}:${subjectId}:${question.attributeKey}`"
              :value="opt.value"
              :checked="answerModel() === opt.value"
              @change="onAnswer(opt.value)"
            />
            <span>{{ opt.label }}</span>
          </label>
        </div>

        <div v-else-if="question.answerType === 'multiChoice'">
          <label
            v-for="opt in question.options ?? []"
            :key="opt.value"
            class="flex min-h-9 items-center gap-2 border-b border-border text-sm"
          >
            <input
              type="checkbox"
              class="size-4"
              :checked="selectedValues(answerModel(), question.options).includes(opt.value)"
              @change="onToggleMultiChoice(opt.value, question.options)"
            />
            <span>{{ opt.label }}</span>
          </label>
        </div>

        <input
          v-else
          class="min-h-9 w-full border-0 border-b border-input bg-transparent px-0 text-sm"
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
      </div>

      <div
        class="flex w-64 shrink-0 flex-col"
        :class="photoIsRequired ? '' : 'min-h-32'"
        :aria-hidden="!photoIsRequired"
      >
        <div
          v-if="photoIsRequired || questionPhotos.length"
          class="flex min-h-32 flex-1 flex-col overflow-hidden rounded-md"
          :class="
            questionPhotos.length
              ? ''
              : isMissingPhoto()
                ? 'bg-muted/60 ring-1 ring-destructive/40'
                : 'bg-muted/60'
          "
          :title="photoIsRequired ? t('flow.photoHint') : undefined"
        >
          <div
            v-if="!questionPhotos.length"
            class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-1"
          >
            <p class="px-0.5 text-center text-[10px] font-medium leading-tight text-amber-700 dark:text-amber-400">
              {{ isMissingPhoto() ? t('flow.photoMissing') : t('flow.photoRequired') }}
            </p>
            <div class="text-muted-foreground/35" aria-hidden="true">
              <ImageIcon class="size-8" />
            </div>
          </div>
          <div
            v-else
            class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
          >
            <div
              v-for="photo in questionPhotos"
              :key="photo.id"
              class="relative"
            >
              <button
                type="button"
                class="h-32 w-full overflow-hidden rounded-md"
                :aria-label="t('flow.viewPhoto')"
                @click="onPhotoTap(photo.id)"
              >
                <img
                  :src="photo.previewUrl ?? undefined"
                  :alt="t('flow.photoAlt')"
                  class="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                class="absolute right-0.5 top-0.5 inline-flex size-8 items-center justify-center rounded-full border-2 border-card bg-destructive text-destructive-foreground shadow-md"
                :aria-label="t('flow.deletePhoto')"
                :disabled="saving"
                @click.stop="onDeletePhotoClick(photo.id)"
              >
                <Trash2 class="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div class="flex items-center justify-center gap-1 border-t border-border/70 p-1">
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
                class="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                :class="saving || isUploadingPhoto() ? 'pointer-events-none opacity-50' : ''"
                :title="isUploadingPhoto() ? t('flow.photoUploading') : t('flow.takePhoto')"
              >
                <Camera class="size-5" aria-hidden="true" />
                <span class="sr-only">
                  {{ isUploadingPhoto() ? t('flow.photoUploading') : t('flow.takePhoto') }}
                </span>
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
                class="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                :class="saving || isUploadingPhoto() ? 'pointer-events-none opacity-50' : ''"
                :title="isUploadingPhoto() ? t('flow.photoUploading') : t('flow.choosePhoto')"
              >
                <Images class="size-5" aria-hidden="true" />
                <span class="sr-only">
                  {{ isUploadingPhoto() ? t('flow.photoUploading') : t('flow.choosePhoto') }}
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <PhotoLightbox
      v-model:open="previewOpen"
      :src="previewPhoto?.previewUrl"
      :alt="t('flow.photoAlt')"
    >
      <template #actions>
        <Button
          variant="destructive"
          size="sm"
          :disabled="saving || !previewPhoto"
          @click="previewPhoto && onDeletePhotoClick(previewPhoto.id)"
        >
          {{ t('flow.deletePhoto') }}
        </Button>
      </template>
    </PhotoLightbox>

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
