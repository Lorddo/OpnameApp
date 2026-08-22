import { describe, expect, it } from 'vitest'
import {
  buildCreatePalette,
  iconForAssetType,
  iconForRoomType,
} from './create-palette'

describe('iconForRoomType / iconForAssetType', () => {
  it('maps known types and falls back to box', () => {
    expect(iconForRoomType('woonkamer')).toBe('sofa')
    expect(iconForAssetType('gevel')).toBe('panel-top')
    expect(iconForAssetType('ketel')).toBe('flame')
    expect(iconForRoomType('unknownType')).toBe('box')
    expect(iconForAssetType('unknownType')).toBe('box')
  })
})

describe('buildCreatePalette', () => {
  const roomTypes = [
    { id: 'woonkamer', label: 'Woonkamer', allowMultiplePerFloor: true },
    { id: 'hal', label: 'Hal', allowMultiplePerFloor: false },
  ]
  const floorAssetTypes = [
    { id: 'gevel', label: 'Gevel', allowMultiple: true },
    { id: 'raam', label: 'Raam', allowMultiple: true },
    { id: 'dak', label: 'Dak', allowMultiple: true },
  ]
  const propertyAssetTypes = [
    { id: 'ketel', label: 'Ketel', allowMultiple: true },
    { id: 'pv', label: 'PV', allowMultiple: false },
  ]

  it('on floor tab returns rooms + envelope groups', () => {
    const groups = buildCreatePalette({
      isPropertyTab: false,
      roomTypes,
      floorAssetTypes,
      propertyAssetTypes,
      roomsOnFloor: [{ roomType: 'woonkamer' }, { roomType: 'woonkamer' }],
      assetsOnFloor: [{ assetType: 'gevel' }],
      propertyAssets: [],
    })

    expect(groups.map((g) => g.id)).toEqual(['rooms', 'envelope'])
    expect(groups[0]!.items.map((i) => i.typeId)).toEqual(['woonkamer', 'hal'])
    expect(groups[0]!.items[0]).toMatchObject({
      kind: 'room',
      count: 2,
      disabled: false,
      icon: 'sofa',
    })
    expect(groups[1]!.items.map((i) => i.typeId)).toEqual(['gevel', 'raam', 'dak'])
    expect(groups[1]!.items[0]).toMatchObject({
      kind: 'asset',
      count: 1,
      disabled: false,
    })
  })

  it('on property tab returns only installations', () => {
    const groups = buildCreatePalette({
      isPropertyTab: true,
      roomTypes,
      floorAssetTypes,
      propertyAssetTypes,
      roomsOnFloor: [{ roomType: 'woonkamer' }],
      assetsOnFloor: [{ assetType: 'gevel' }],
      propertyAssets: [{ assetType: 'pv' }],
    })

    expect(groups.map((g) => g.id)).toEqual(['installations'])
    expect(groups[0]!.items.map((i) => i.typeId)).toEqual(['ketel', 'pv'])
    expect(groups[0]!.items.find((i) => i.typeId === 'pv')).toMatchObject({
      count: 1,
      disabled: true,
    })
    expect(groups[0]!.items.find((i) => i.typeId === 'ketel')).toMatchObject({
      count: 0,
      disabled: false,
    })
  })

  it('disables room when allowMultiplePerFloor is false and one exists', () => {
    const groups = buildCreatePalette({
      isPropertyTab: false,
      roomTypes,
      floorAssetTypes: [],
      propertyAssetTypes: [],
      roomsOnFloor: [{ roomType: 'hal' }],
      assetsOnFloor: [],
      propertyAssets: [],
    })

    const hal = groups[0]!.items.find((i) => i.typeId === 'hal')
    expect(hal).toMatchObject({ count: 1, disabled: true })
  })

  it('omits rooms group when roomTypes empty; still shows envelope', () => {
    const groups = buildCreatePalette({
      isPropertyTab: false,
      roomTypes: [],
      floorAssetTypes,
      propertyAssetTypes,
      roomsOnFloor: [],
      assetsOnFloor: [],
      propertyAssets: [],
    })

    expect(groups.map((g) => g.id)).toEqual(['envelope'])
  })

  it('returns empty when property tab has no installation types', () => {
    const groups = buildCreatePalette({
      isPropertyTab: true,
      roomTypes,
      floorAssetTypes,
      propertyAssetTypes: [],
      roomsOnFloor: [],
      assetsOnFloor: [],
      propertyAssets: [],
    })
    expect(groups).toEqual([])
  })

  it('returns empty when floor has neither rooms nor floor assets', () => {
    const groups = buildCreatePalette({
      isPropertyTab: false,
      roomTypes: [],
      floorAssetTypes: [],
      propertyAssetTypes,
      roomsOnFloor: [],
      assetsOnFloor: [],
      propertyAssets: [],
    })
    expect(groups).toEqual([])
  })

  it('always includes dak and vloer when they are in floorAssetTypes', () => {
    const groups = buildCreatePalette({
      isPropertyTab: false,
      roomTypes: [],
      floorAssetTypes: [
        { id: 'gevel', label: 'Gevel', allowMultiple: true },
        { id: 'dak', label: 'Dak', allowMultiple: true },
        { id: 'vloer', label: 'Vloer', allowMultiple: true },
      ],
      propertyAssetTypes: [],
      roomsOnFloor: [],
      assetsOnFloor: [],
      propertyAssets: [],
    })

    expect(groups[0]!.items.map((i) => i.typeId)).toEqual(['gevel', 'dak', 'vloer'])
  })
})
