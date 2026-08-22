<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  src?: string | null
  alt: string
}>()

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)

function close() {
  open.value = false
}

watch(
  open,
  async (isOpen) => {
    await nextTick()
    const el = dialog.value
    if (!el) return
    if (isOpen) {
      if (!el.open) el.showModal()
    } else if (el.open) {
      el.close()
    }
  },
  { immediate: true },
)
</script>

<template>
  <dialog
    ref="dialog"
    class="fixed inset-0 z-50 m-0 hidden h-dvh max-h-none w-dvw max-w-none items-center justify-center border-0 bg-black/90 p-0 text-white open:flex backdrop:bg-black/80"
    :aria-label="alt"
    @close="close"
    @click="close"
  >
    <button
      type="button"
      class="absolute right-3 top-3 z-10 inline-flex size-11 items-center justify-center rounded-full bg-black/55 hover:bg-black/75"
      :aria-label="t('common.close')"
      @click.stop="close"
    >
      <X class="size-5" aria-hidden="true" />
    </button>
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      class="max-h-[min(85dvh,calc(100dvh-7rem))] max-w-[min(96vw,72rem)] object-contain"
      @click.stop
    />
    <div
      class="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      @click.stop
    >
      <slot name="actions" />
    </div>
  </dialog>
</template>
