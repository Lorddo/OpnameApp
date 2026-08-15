<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { useI18n } from 'vue-i18n'

const open = defineModel<boolean>('open', { default: false })

withDefaults(
  defineProps<{
    labelledBy: string
    showClose?: boolean
  }>(),
  { showClose: true },
)

const { t } = useI18n()
const dialog = ref<HTMLDialogElement | null>(null)

function close() {
  open.value = false
}

function onDialogClick(event: MouseEvent) {
  if (event.target === dialog.value) close()
}

watch(open, async (isOpen) => {
  await nextTick()
  const el = dialog.value
  if (!el) return
  if (isOpen) {
    if (!el.open) el.showModal()
  } else if (el.open) {
    el.close()
  }
})
</script>

<template>
  <dialog
    ref="dialog"
    class="fixed left-1/2 top-1/2 z-50 m-0 max-h-[min(80vh,40rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl backdrop:bg-black/40"
    :aria-labelledby="labelledBy"
    @close="close"
    @click="onDialogClick"
  >
    <slot />
    <Button v-if="showClose" class="mt-5" variant="outline" @click="close">
      {{ t('common.close') }}
    </Button>
  </dialog>
</template>
