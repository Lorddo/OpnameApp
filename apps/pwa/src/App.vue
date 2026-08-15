<script setup lang="ts">
import { RouterView } from 'vue-router'
import InstallPrompt from '@/components/InstallPrompt.vue'
import ReloadPrompt from '@/components/ReloadPrompt.vue'
</script>

<template>
  <RouterView />
  <div class="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-3 print:hidden">
    <ReloadPrompt />
    <InstallPrompt />
  </div>
</template>

