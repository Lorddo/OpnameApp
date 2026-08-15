<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AppWindow,
  Archive,
  ArrowUpDown,
  Bath,
  Bed,
  Box,
  Building2,
  Car,
  DoorOpen,
  Droplets,
  Fence,
  Flame,
  Heater,
  Home,
  Layers,
  Leaf,
  Package,
  PanelTop,
  ParkingSquare,
  Snowflake,
  Sofa,
  Square,
  Sun,
  Thermometer,
  Toilet,
  TreePine,
  Utensils,
  Warehouse,
  Waves,
  Zap,
} from 'lucide-vue-next'
import type { PaletteGroup, PaletteIconName, PaletteItem } from '@/lib/create-palette'

const props = defineProps<{
  groups: PaletteGroup[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [item: PaletteItem]
}>()

const { t } = useI18n()

const ICON_MAP: Record<PaletteIconName, Component> = {
  box: Box,
  'panel-top': PanelTop,
  square: Square,
  'app-window': AppWindow,
  'door-open': DoorOpen,
  home: Home,
  layers: Layers,
  flame: Flame,
  thermometer: Thermometer,
  heater: Heater,
  zap: Zap,
  leaf: Leaf,
  snowflake: Snowflake,
  sun: Sun,
  droplets: Droplets,
  sofa: Sofa,
  bed: Bed,
  bath: Bath,
  utensils: Utensils,
  toilet: Toilet,
  warehouse: Warehouse,
  car: Car,
  'parking-square': ParkingSquare,
  'tree-pine': TreePine,
  'building-2': Building2,
  'arrow-up-down': ArrowUpDown,
  archive: Archive,
  package: Package,
  fence: Fence,
  waves: Waves,
}

const groupLabelKey: Record<PaletteGroup['id'], string> = {
  rooms: 'flow.paletteRooms',
  envelope: 'flow.paletteEnvelope',
  installations: 'flow.paletteInstallations',
}

const hasItems = computed(() => props.groups.some((g) => g.items.length > 0))

function iconComponent(name: PaletteIconName) {
  return ICON_MAP[name] ?? Box
}

function onSelect(item: PaletteItem) {
  if (props.disabled || item.disabled) return
  emit('select', item)
}
</script>

<template>
  <nav
    v-if="hasItems"
    class="create-palette z-40 border-border bg-card/95 backdrop-blur-sm print:hidden"
    :aria-label="t('flow.paletteAria')"
  >
    <div class="create-palette__scroll">
      <div
        v-for="group in groups"
        :key="group.id"
        class="create-palette__group"
      >
        <p class="create-palette__group-label">
          {{ t(groupLabelKey[group.id]) }}
        </p>
        <div class="create-palette__tiles">
          <button
            v-for="item in group.items"
            :key="`${item.kind}:${item.typeId}`"
            type="button"
            class="create-palette__tile"
            :disabled="disabled || item.disabled"
            :aria-label="t('flow.addType', { label: item.label })"
            :title="item.label"
            @click="onSelect(item)"
          >
            <component
              :is="iconComponent(item.icon)"
              class="size-7 shrink-0"
              aria-hidden="true"
            />
            <span class="create-palette__tile-label">{{ item.label }}</span>
            <span
              v-if="item.count > 0"
              class="create-palette__badge"
              aria-hidden="true"
            >
              ×{{ item.count }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.create-palette {
  /* Mobile: fixed bottom dock */
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-shadow: 0 -4px 16px rgb(0 0 0 / 0.06);
}

.create-palette__scroll {
  display: flex;
  flex-direction: row;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.5rem 0.75rem;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.create-palette__group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex-shrink: 0;
}

.create-palette__group-label {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
  padding-inline: 0.25rem;
  white-space: nowrap;
}

.create-palette__tiles {
  display: flex;
  flex-direction: row;
  gap: 0.375rem;
}

.create-palette__tile {
  position: relative;
  display: flex;
  min-height: 3rem;
  min-width: 3.5rem;
  max-width: 4.5rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--card);
  padding: 0.375rem 0.25rem;
  color: var(--foreground);
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.create-palette__tile:hover:not(:disabled) {
  background: var(--muted);
}

.create-palette__tile:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ring);
}

.create-palette__tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.create-palette__tile-label {
  font-size: 11px;
  line-height: 1.15;
  text-align: center;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  word-break: break-word;
}

.create-palette__badge {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  border-radius: 9999px;
  background: var(--muted);
  padding: 0 0.25rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--muted-foreground);
  line-height: 1.25;
}

/* Tablet/desktop: left sticky rail in grid column */
@media (min-width: 768px) {
  .create-palette {
    position: sticky;
    top: 1rem;
    inset-inline: auto;
    bottom: auto;
    align-self: start;
    width: 100%;
    max-height: calc(100dvh - 2rem);
    border-top: none;
    border-right: 1px solid var(--border);
    border-radius: var(--radius);
    padding-bottom: 0;
    box-shadow: none;
    overflow: hidden;
  }

  .create-palette__scroll {
    flex-direction: column;
    gap: 1rem;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: calc(100dvh - 2rem);
    padding: 0.75rem 0.5rem;
  }

  .create-palette__tiles {
    flex-direction: column;
    align-items: stretch;
  }

  .create-palette__tile {
    min-width: 0;
    max-width: none;
    width: 100%;
  }
}
</style>
