<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
    decorative?: boolean
  }>(),
  { size: 40, decorative: false },
)
</script>

<template>
  <img
    src="/favicon.svg"
    :alt="decorative ? '' : 'OpnameApp'"
    :width="size"
    :height="size"
    class="shrink-0 rounded-[22%]"
    decoding="async"
  />
</template>
