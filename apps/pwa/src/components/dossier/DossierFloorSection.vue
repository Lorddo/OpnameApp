<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { AnswerRow, DossierFloor, DossierPhoto, DossierRoom } from '@/components/dossier/types'

export type FloorRoom = DossierRoom & { answers: AnswerRow[] }
export type FloorWithRooms = DossierFloor & { rooms: FloorRoom[] }

defineProps<{
  floor: FloorWithRooms
  roomTypeLabel: (roomType: string) => string
  roomIsComplete: (roomId: string) => boolean
  attrLabel: (attributeKey: string) => string
  formatValue: (attributeKey: string, value: unknown) => string
  photosForAnswer: (roomId: string, answer: AnswerRow) => DossierPhoto[]
  photoPreviewUrls: Record<string, string>
}>()

const { t } = useI18n()
</script>

<template>
  <div class="rounded-xl border border-border bg-card p-5 print:bg-white print:shadow-none">
    <h2 class="mb-4 text-xl font-semibold">{{ floor.label }}</h2>
    <div class="space-y-5">
      <section
        v-for="room in floor.rooms"
        :key="room.id"
        class="border-t border-border pt-4 first:border-t-0 first:pt-0 print:break-inside-avoid"
      >
        <h3 class="mb-3 flex flex-wrap items-baseline gap-2 text-lg font-semibold">
          <span>{{ room.label || roomTypeLabel(room.room_type) }}</span>
          <span
            class="text-sm font-normal"
            :class="roomIsComplete(room.id) ? 'text-success' : 'text-destructive'"
          >
            {{ roomIsComplete(room.id) ? t('dossier.complete') : t('dossier.incomplete') }}
          </span>
        </h3>
        <dl class="space-y-3">
          <div
            v-for="answer in room.answers"
            :key="answer.attribute_key"
            class="space-y-2 print:break-inside-avoid"
          >
            <div class="grid gap-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <dt class="text-sm text-muted-foreground">
                {{ attrLabel(answer.attribute_key) }}
              </dt>
              <dd class="font-medium">
                {{ formatValue(answer.attribute_key, answer.value) }}
              </dd>
            </div>
            <div
              v-if="photosForAnswer(room.id, answer).length"
              class="flex flex-wrap gap-2 sm:pl-[calc(58.3%+0.25rem)]"
            >
              <a
                v-for="photo in photosForAnswer(room.id, answer)"
                :key="photo.id"
                :href="photoPreviewUrls[photo.id]"
                target="_blank"
                rel="noopener noreferrer"
                class="block"
              >
                <img
                  v-if="photoPreviewUrls[photo.id]"
                  :src="photoPreviewUrls[photo.id]"
                  :alt="t('flow.photoAlt')"
                  class="h-[250px] w-[250px] rounded-lg border border-border object-cover"
                />
                <span
                  v-else
                  class="inline-flex h-[250px] w-[250px] items-center justify-center rounded-lg border border-border text-xs text-muted-foreground"
                >
                  …
                </span>
              </a>
            </div>
          </div>
        </dl>
        <p v-if="!room.answers.length" class="text-sm text-muted-foreground">
          {{ t('dossier.noAnswers') }}
        </p>
      </section>
      <p v-if="!floor.rooms.length" class="text-sm text-muted-foreground">
        {{ t('flow.noRoomsOnFloor') }}
      </p>
    </div>
  </div>
</template>
