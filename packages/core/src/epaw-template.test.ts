import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  evaluateTemplateCompleteness,
  listVisibleAssetQuestions,
  parseInspectionTemplate,
} from './index.js'

const templatesDir = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../templates/epaw',
)

function loadEpaw() {
  const raw = JSON.parse(readFileSync(path.join(templatesDir, 'epaw-0.1.0.json'), 'utf8'))
  return parseInspectionTemplate(raw)
}

describe('EPA-w 0.1.0 stub', () => {
  const epaw = loadEpaw()

  it('is a field-capture stub without rooms or dimensions', () => {
    expect(epaw.id).toBe('epaw')
    expect(epaw.version).toBe('0.1.0')
    expect(epaw.roomTypes).toEqual([])
    expect(epaw.propertyQuestions?.map((q) => q.attributeKey)).toEqual([
      'property.bovenkant',
      'property.onderkant',
    ])
    expect(epaw.assetTypes?.map((at) => at.id)).toEqual([
      'gevel',
      'raam',
      'dakraam',
      'deur',
      'dak',
      'vloer',
      'ketel',
      'warmtepomp',
      'stadsverwarming',
      'elektrisch',
      'biomassa',
      'koeling',
      'pv',
      'zonneboiler',
    ])
    const labels = JSON.stringify(epaw)
    expect(labels).not.toMatch(/breedte|hoogte|oppervlak|aantalRamen/i)
    expect(epaw.assetTypes?.some((at) => at.id === 'ventilatie' || at.id === 'wtw')).toBe(false)
    expect(epaw.attributes['asset.orientatie']?.answerType).toBe('multiChoice')
    expect(epaw.attributes['asset.orientatie']?.options?.map((o) => o.value)).toEqual([
      'N',
      'NO',
      'O',
      'ZO',
      'Z',
      'ZW',
      'W',
      'NW',
      'onbekend',
    ])
  })

  it('ends every choice and multiChoice with onbekend', () => {
    for (const attr of Object.values(epaw.attributes)) {
      if (attr.answerType !== 'choice' && attr.answerType !== 'multiChoice') continue
      expect(attr.options?.at(-1)?.value).toBe('onbekend')
    }
  })

  it('keeps insulation follow-ups closed when isolatie is onbekend', () => {
    const visible = listVisibleAssetQuestions(epaw, 'gevel', { isolatieAanwezig: 'onbekend' })
    expect(visible.map((q) => q.attributeKey)).not.toContain('asset.isolatieType')
    expect(visible.map((q) => q.attributeKey)).not.toContain('asset.rcWaarde')
  })

  it('does not require a minimum number of assets', () => {
    const empty = evaluateTemplateCompleteness(epaw, [], {}, {}, {
      propertyAnswers: { bovenkant: 'buiten', onderkant: 'kruipruimte' },
    })
    expect(empty.assets).toEqual([])
    expect(empty.isComplete).toBe(true)
  })

  it('uses gevel sides and does not require photos on gevel, dak, or vloer', () => {
    expect(epaw.attributes['property.onderkant']?.options?.map((o) => o.value)).toContain('grond')
    expect(epaw.attributes['property.onderkant']?.options?.map((o) => o.value)).not.toContain(
      'buiten',
    )
    for (const id of ['gevel', 'dak', 'vloer'] as const) {
      const assetType = epaw.assetTypes?.find((at) => at.id === id)
      expect(assetType?.questions.every((q) => !q.photoRequired)).toBe(true)
    }
    expect(epaw.assetTypes?.find((at) => at.id === 'gevel')?.questions[0]?.attributeKey).toBe(
      'asset.gevelZijde',
    )
    const raam = epaw.assetTypes?.find((at) => at.id === 'raam')
    expect(raam?.questions[0]).toMatchObject({
      attributeKey: 'asset.gevelZijde',
      photoRequired: true,
    })
    expect(raam?.questions.find((q) => q.attributeKey === 'asset.glascode')).toMatchObject({
      photoRequired: true,
      showWhen: 'asset.this.glascodeZichtbaar = "ja"',
    })

    const dakraam = epaw.assetTypes?.find((at) => at.id === 'dakraam')
    expect(dakraam?.questions[0]).toMatchObject({
      attributeKey: 'asset.dakvlak',
      photoRequired: true,
    })
    expect(epaw.attributes['asset.dakvlak']?.options?.map((o) => o.value)).toEqual([
      'voordakvlak',
      'linkerdakvlak',
      'achterdakvlak',
      'rechterdakvlak',
      'onbekend',
    ])
    expect(
      epaw.assetTypes?.find((at) => at.id === 'dak')?.questions.map((q) => q.attributeKey),
    ).toContain('asset.dakvlak')

    const deur = epaw.assetTypes?.find((at) => at.id === 'deur')
    expect(deur?.questions.map((q) => q.attributeKey)).toContain('asset.gevelZijde')
    expect(deur?.questions.map((q) => q.attributeKey)).not.toContain('asset.grenstAanBuiten')
    expect(epaw.attributes['asset.grenstAanBuiten']).toBeUndefined()
  })

  it('asks for a glascode photo only when the code is visible', () => {
    const hidden = listVisibleAssetQuestions(epaw, 'raam', { glascodeZichtbaar: 'nee' })
    expect(hidden.map((q) => q.attributeKey)).not.toContain('asset.glascode')

    const visible = listVisibleAssetQuestions(epaw, 'raam', { glascodeZichtbaar: 'ja' })
    expect(visible.map((q) => q.attributeKey)).toContain('asset.glascode')

    const missingPhoto = evaluateTemplateCompleteness(epaw, [], {}, {}, {
      assets: [{ id: 'r1', assetType: 'raam' }],
      answersByAssetId: {
        r1: {
          gevelZijde: 'voor',
          kozijn: 'onbekend',
          glas: 'onbekend',
          glascodeZichtbaar: 'ja',
          glascode: '4-16-4',
          zonwering: 'onbekend',
          ventilatierooster: 'onbekend',
        },
      },
      photosByAssetId: { r1: { 'asset.gevelZijde': 1 } },
    })
    expect(missingPhoto.assets[0]?.missingPhotoAttributeKeys).toContain('asset.glascode')
  })

  it('requires answers on created assets and accepts onbekend', () => {
    const missing = evaluateTemplateCompleteness(epaw, [], {}, {}, {
      propertyAnswers: { bovenkant: 'onbekend', onderkant: 'onbekend' },
      assets: [{ id: 'g1', assetType: 'gevel' }],
    })
    expect(missing.isComplete).toBe(false)
    expect(missing.assets[0]?.missingAttributeKeys).toContain('asset.gevelZijde')

    const answered = evaluateTemplateCompleteness(epaw, [], {}, {}, {
      propertyAnswers: { bovenkant: 'onbekend', onderkant: 'onbekend' },
      assets: [{ id: 'g1', assetType: 'gevel' }],
      answersByAssetId: {
        g1: {
          gevelZijde: 'onbekend',
          grenstAan: 'onbekend',
          bouwjaarBekend: 'onbekend',
          geveltype: 'onbekend',
          isolatieAanwezig: 'onbekend',
        },
      },
    })
    expect(answered.assets[0]?.isComplete).toBe(true)
    expect(answered.isComplete).toBe(true)
  })
})
