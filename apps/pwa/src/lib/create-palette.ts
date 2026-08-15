/** Lucide icon names resolved in CreatePalette.vue. */
export type PaletteIconName =
  | 'box'
  | 'panel-top'
  | 'square'
  | 'app-window'
  | 'door-open'
  | 'home'
  | 'layers'
  | 'flame'
  | 'thermometer'
  | 'heater'
  | 'zap'
  | 'leaf'
  | 'snowflake'
  | 'sun'
  | 'droplets'
  | 'sofa'
  | 'bed'
  | 'bath'
  | 'utensils'
  | 'toilet'
  | 'warehouse'
  | 'car'
  | 'parking-square'
  | 'tree-pine'
  | 'building-2'
  | 'arrow-up-down'
  | 'archive'
  | 'package'
  | 'fence'
  | 'waves'

export type PaletteGroupId = 'rooms' | 'envelope' | 'installations'

export type PaletteItemKind = 'room' | 'asset'

export type PaletteItem = {
  kind: PaletteItemKind
  typeId: string
  label: string
  icon: PaletteIconName
  count: number
  /** True when multiples are not allowed and one already exists. */
  disabled: boolean
}

export type PaletteGroup = {
  id: PaletteGroupId
  items: PaletteItem[]
}

const ROOM_ICONS: Record<string, PaletteIconName> = {
  woonkamer: 'sofa',
  slaapkamer: 'bed',
  badkamer: 'bath',
  keuken: 'utensils',
  toilet: 'toilet',
  hal: 'door-open',
  overloop: 'arrow-up-down',
  zolder: 'home',
  souterrain: 'layers',
  serre: 'app-window',
  erker: 'app-window',
  balkon: 'fence',
  loggia: 'fence',
  dakterras: 'sun',
  tuin: 'tree-pine',
  garage: 'warehouse',
  carport: 'car',
  parkeerplaats: 'parking-square',
  bergruimte: 'archive',
  bergingKastAppartement: 'archive',
  externeBergruimte: 'warehouse',
  omgebouwdeBergruimte: 'package',
  ruimteMetBalken: 'layers',
  zwembad: 'waves',
  meterkast: 'zap',
}

const ASSET_ICONS: Record<string, PaletteIconName> = {
  gevel: 'panel-top',
  raam: 'square',
  dakraam: 'app-window',
  deur: 'door-open',
  dak: 'home',
  vloer: 'layers',
  ketel: 'flame',
  warmtepomp: 'thermometer',
  stadsverwarming: 'heater',
  elektrisch: 'zap',
  biomassa: 'leaf',
  koeling: 'snowflake',
  pv: 'sun',
  zonneboiler: 'droplets',
}

export function iconForRoomType(typeId: string): PaletteIconName {
  return ROOM_ICONS[typeId] ?? 'box'
}

export function iconForAssetType(typeId: string): PaletteIconName {
  return ASSET_ICONS[typeId] ?? 'box'
}

export type PaletteRoomType = {
  id: string
  label: string
  allowMultiplePerFloor: boolean
}

export type PaletteAssetType = {
  id: string
  label: string
  allowMultiple: boolean
}

export type BuildCreatePaletteInput = {
  isPropertyTab: boolean
  roomTypes: PaletteRoomType[]
  /** Floor assets already filtered (e.g. dak/vloer by boven/onder). */
  floorAssetTypes: PaletteAssetType[]
  propertyAssetTypes: PaletteAssetType[]
  roomsOnFloor: Array<{ roomType: string }>
  assetsOnFloor: Array<{ assetType: string }>
  propertyAssets: Array<{ assetType: string }>
}

function countBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = keyOf(row)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

function roomItems(
  roomTypes: PaletteRoomType[],
  roomsOnFloor: Array<{ roomType: string }>,
): PaletteItem[] {
  const counts = countBy(roomsOnFloor, (r) => r.roomType)
  return roomTypes.map((rt) => {
    const count = counts.get(rt.id) ?? 0
    return {
      kind: 'room' as const,
      typeId: rt.id,
      label: rt.label,
      icon: iconForRoomType(rt.id),
      count,
      disabled: !rt.allowMultiplePerFloor && count >= 1,
    }
  })
}

function assetItems(
  assetTypes: PaletteAssetType[],
  existing: Array<{ assetType: string }>,
): PaletteItem[] {
  const counts = countBy(existing, (a) => a.assetType)
  return assetTypes.map((at) => {
    const count = counts.get(at.id) ?? 0
    return {
      kind: 'asset' as const,
      typeId: at.id,
      label: at.label,
      icon: iconForAssetType(at.id),
      count,
      disabled: !at.allowMultiple && count >= 1,
    }
  })
}

/**
 * Build create-palette groups for the checklist step.
 * Property tab → installations; floor tab → rooms + envelope.
 * Empty groups are omitted; empty result means hide the palette.
 */
export function buildCreatePalette(input: BuildCreatePaletteInput): PaletteGroup[] {
  const groups: PaletteGroup[] = []

  if (input.isPropertyTab) {
    const items = assetItems(input.propertyAssetTypes, input.propertyAssets)
    if (items.length) groups.push({ id: 'installations', items })
    return groups
  }

  if (input.roomTypes.length) {
    const items = roomItems(input.roomTypes, input.roomsOnFloor)
    if (items.length) groups.push({ id: 'rooms', items })
  }

  const envelope = assetItems(input.floorAssetTypes, input.assetsOnFloor)
  if (envelope.length) groups.push({ id: 'envelope', items: envelope })

  return groups
}
