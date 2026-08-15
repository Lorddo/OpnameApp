<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Info } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  NONE_OPTION,
  attributeQuestionKey,
  isPhotoRequired,
  withNoneOfTheseDefault,
} from '@opnameapp/core'
import type { VisibleQuestion } from '@opnameapp/core'
import { useInspectionFlowStore } from '@/stores/inspection-flow'

const props = defineProps<{
  roomId: string
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

const qKey = computed(() => attributeQuestionKey(props.question.attributeKey))

function answerModel() {
  return flow.answersByRoom[props.roomId]?.[qKey.value] ?? null
}

function onAnswer(value: unknown) {
  flow.setAnswer(props.roomId, qKey.value, value)
}

function selectedValues(value: unknown, options?: Array<{ value: string }>): string[] {
  const effective = withNoneOfTheseDefault(value, options)
  return Array.isArray(effective)
    ? effective.filter((item): item is string => typeof item === 'string')
    : []
}

function onToggleMultiChoice(optionValue: string, options?: Array<{ value: string }>) {
  const current = selectedValues(answerModel(), options)
  if (optionValue === NONE_OPTION) {
    onAnswer([NONE_OPTION])
    return
  }
  const withoutNone = current.filter((item) => item !== NONE_OPTION)
  const next = withoutNone.includes(optionValue)
    ? withoutNone.filter((item) => item !== optionValue)
    : [...withoutNone, optionValue]
  onAnswer(next.length ? next : [NONE_OPTION])
}

function isMissing() {
  return flow.missingKeysForRoom(props.roomId).includes(props.question.attributeKey)
}

function isMissingPhoto() {
  return flow.missingPhotoKeysForRoom(props.roomId).includes(props.question.attributeKey)
}

function isUploadingPhoto() {
  return uploadingPhotoKey.value === `${props.roomId}|${props.question.attributeKey}`
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await flow.uploadPhoto(props.roomId, props.question.attributeKey, file)
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
          :name="`${roomId}:${question.attributeKey}`"
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
        v-if="flow.photosForQuestion(roomId, question.attributeKey).length"
        class="flex flex-wrap gap-2"
      >
        <img
          v-for="photo in flow.photosForQuestion(roomId, question.attributeKey)"
          :key="photo.id"
          :src="photo.previewUrl ?? undefined"
          :alt="t('flow.photoAlt')"
          class="h-20 w-20 rounded-lg border border-border object-cover"
        />
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
  </div>
</template>
