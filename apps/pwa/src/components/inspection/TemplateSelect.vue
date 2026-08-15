<script setup lang="ts">
export type TemplateOption = {
  template_key: string
  version: string
  label: string
}

const props = defineProps<{
  templates: TemplateOption[]
  selectedKeys: string[]
  disabled?: boolean
  lockLast?: boolean
}>()

const emit = defineEmits<{
  enable: [templateKey: string, templateVersion: string]
  disable: [templateKey: string, templateVersion: string, label: string]
}>()

function isSelected(templateKey: string) {
  return props.selectedKeys.includes(templateKey)
}

function isLocked(templateKey: string) {
  return props.lockLast === true && isSelected(templateKey) && props.selectedKeys.length <= 1
}

function onChange(event: Event, tpl: TemplateOption) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked) {
    emit('enable', tpl.template_key, tpl.version)
    return
  }
  emit('disable', tpl.template_key, tpl.version, tpl.label)
}
</script>

<template>
  <div class="space-y-2">
    <label
      v-for="tpl in templates"
      :key="`${tpl.template_key}@${tpl.version}`"
      class="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4"
      :class="isSelected(tpl.template_key) ? 'border-brand bg-brand/5' : 'border-border'"
    >
      <input
        type="checkbox"
        class="size-5"
        :checked="isSelected(tpl.template_key)"
        :disabled="disabled || isLocked(tpl.template_key)"
        @change="onChange($event, tpl)"
      />
      <span>{{ tpl.label }} ({{ tpl.version }})</span>
    </label>
  </div>
</template>
