import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  evaluateRoomCompleteness,
  evaluateTemplateCompleteness,
  listVisiblePropertyQuestions,
  listVisibleQuestions,
  parseInspectionTemplate,
} from './index.js'

const templatesDir = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../templates/wws',
)

function loadWws(filename: string) {
  const raw = JSON.parse(readFileSync(path.join(templatesDir, filename), 'utf8'))
  return parseInspectionTemplate(raw)
}

describe('WWS 0.1.0', () => {
  const wws = loadWws('wws-0.1.0.json')

  it('groups amenity booleans into checklists without dropping original items', () => {
    expect(wws.id).toBe('wws')
    expect(wws.version).toBe('0.1.0')

    const sanitair = wws.attributes['room.sanitaireVoorzieningen']
    expect(sanitair?.answerType).toBe('multiChoice')
    expect(sanitair?.options?.map((opt) => opt.value)).toEqual([
      'staandToilet',
      'hangToilet',
      'bidetLavet',
      'geen',
    ])
    expect(wws.attributes['room.wastafelVoorzieningen']?.options?.map((opt) => opt.value)).toEqual([
      'wastafel',
      'meerpersoonsWastafel',
      'stopcontact',
      'geen',
    ])
    expect(wws.attributes['room.doucheBad']?.options?.map((opt) => opt.value)).toEqual([
      'douche',
      'doucheAfscheiding',
      'badStandaard',
      'badBubbel',
      'badDouche',
      'geen',
    ])
    expect(wws.attributes['room.sanitaireKranen']?.options?.map((opt) => opt.value)).toEqual([
      'handmengkraan',
      'thermostatischMengkraan',
      'geen',
    ])
    expect(wws.attributes['room.radiatorVoorzieningen']?.options?.map((opt) => opt.value)).toEqual([
      'handdoekenradiator',
      'geen',
    ])
    expect(wws.attributes['room.meubilair']?.options?.map((opt) => opt.value)).toEqual([
      'kast',
      'ingebouwdeKastMetWastafel',
      'geen',
    ])

    const kitchen = wws.attributes['room.keukenApparatuur']
    expect(kitchen?.options?.map((opt) => opt.value)).toEqual([
      'afzuigkap',
      'gasOven',
      'elektrischeOven',
      'magnetron',
      'magnetronCombi',
      'koelkast',
      'diepvries',
      'koelVriesCombi',
      'vaatwasser',
      'geen',
    ])
    expect(wws.attributes['room.keukenKranen']?.options?.map((opt) => opt.value)).toEqual([
      'eenGreepsMengkraan',
      'thermostatischMengkraan',
      'kookwaterfunctie',
      'geen',
    ])

    const kenmerken = wws.attributes['room.woningKenmerken']
    expect(kenmerken?.options?.map((opt) => opt.value)).toEqual([
      'ondertekendVoor1Juli2024',
      'bouwjaar2018Tot2022',
      'ingrijpendeRenovatie2015Tot2019',
      'renovatie',
      'bijzonderMonument',
      'geen',
    ])

    const bathroomKeys = listVisibleQuestions(wws, 'badkamer', {}).map((q) => q.attributeKey)
    expect(bathroomKeys).toEqual([
      'room.gedeeldeRuimte',
      'room.verwarmd',
      'room.sanitaireVoorzieningen',
      'room.wastafelVoorzieningen',
      'room.doucheBad',
      'room.sanitaireKranen',
      'room.radiatorVoorzieningen',
      'room.meubilair',
      'room.waterdichteAfwerking',
    ])
    expect(listVisibleQuestions(wws, 'slaapkamer', {}).map((q) => q.attributeKey)).toEqual(
      bathroomKeys,
    )
    expect(listVisibleQuestions(wws, 'keuken', {}).map((q) => q.attributeKey)).toContain(
      'room.keukenKranen',
    )
    expect(wws.attributes['room.wastafel']?.answerType).toBe('boolean')
  })

  it('uses full-sentence labels', () => {
    expect(wws.attributes['room.gedeeldeRuimte']?.label).toBe(
      'Wordt deze ruimte gedeeld door meerdere bewoners?',
    )
    expect(wws.attributes['room.verwarmd']?.label).toBe('Is deze ruimte verwarmd?')
    expect(wws.attributes['room.sanitaireVoorzieningen']?.label).toBe(
      'Welke sanitaire voorzieningen zijn aanwezig?',
    )
    expect(wws.attributes['room.keukenApparatuur']?.label).toBe(
      'Welke keukenapparatuur is aanwezig?',
    )
    expect(wws.attributes['room.keukenKranen']?.label).toBe('Welke kranen zijn aanwezig?')
  })

  it('hides WOZ eigenschatting until online ophalen is no', () => {
    const keys = (answers: Record<string, unknown>) =>
      listVisibleQuestions(wws, 'algemeen', answers).map((q) => q.attributeKey)
    expect(keys({})).not.toContain('room.wozWaardeEigenschatting')
    expect(keys({ wozWaardeOnlineOphalen: true })).not.toContain('room.wozWaardeEigenschatting')
    expect(keys({ wozWaardeOnlineOphalen: false })).toContain('room.wozWaardeEigenschatting')
  })

  it('hides optional euro amounts until presence is yes', () => {
    const keys = (answers: Record<string, unknown>) =>
      listVisibleQuestions(wws, 'algemeen', answers).map((q) => q.attributeKey)

    expect(keys({})).not.toContain('room.specialCareHome')
    expect(keys({})).not.toContain('room.laadstationsZonderParkeergelegenheid')
    expect(keys({})).not.toContain('room.energieprestatievergoeding')

    expect(keys({ specialCareHomeAanwezig: false })).not.toContain('room.specialCareHome')
    expect(keys({ specialCareHomeAanwezig: true })).toContain('room.specialCareHome')
    expect(keys({ laadstationsZonderParkeergelegenheidAanwezig: true })).toContain(
      'room.laadstationsZonderParkeergelegenheid',
    )
    expect(keys({ energieprestatievergoedingAanwezig: true })).toContain(
      'room.energieprestatievergoeding',
    )

    const absent = evaluateRoomCompleteness(wws, 'algemeen', {
      wozWaardeOnlineOphalen: true,
      energieLabel: false,
      coropGebied: false,
      woningKenmerken: ['geen'],
      woningVoorzieningen: ['geen'],
      specialCareHomeAanwezig: false,
      laadstationsZonderParkeergelegenheidAanwezig: false,
      energieprestatievergoedingAanwezig: false,
    })
    expect(absent.missingAttributeKeys).toEqual([])
    expect(absent.isComplete).toBe(true)

    const presentWithoutAmount = evaluateRoomCompleteness(wws, 'algemeen', {
      wozWaardeOnlineOphalen: true,
      energieLabel: false,
      coropGebied: false,
      woningKenmerken: ['geen'],
      woningVoorzieningen: ['geen'],
      specialCareHomeAanwezig: true,
      laadstationsZonderParkeergelegenheidAanwezig: false,
      energieprestatievergoedingAanwezig: false,
    })
    expect(presentWithoutAmount.missingAttributeKeys).toEqual(['room.specialCareHome'])
  })

  it('requires photos on amenity lists, but not when Geen van deze is chosen', () => {
    const withItems = evaluateRoomCompleteness(
      wws,
      'badkamer',
      {
        gedeeldeRuimte: false,
        verwarmd: true,
        sanitaireVoorzieningen: ['hangToilet'],
        wastafelVoorzieningen: ['wastafel'],
        doucheBad: ['douche'],
        waterdichteAfwerking: true,
      },
      { 'room.verwarmd': 1, 'room.waterdichteAfwerking': 1 },
    )
    expect(withItems.missingPhotoAttributeKeys).toEqual([
      'room.sanitaireVoorzieningen',
      'room.wastafelVoorzieningen',
      'room.doucheBad',
    ])

    const none = evaluateRoomCompleteness(
      wws,
      'badkamer',
      {
        gedeeldeRuimte: false,
        verwarmd: true,
        sanitaireVoorzieningen: ['geen'],
        waterdichteAfwerking: true,
      },
      { 'room.verwarmd': 1, 'room.waterdichteAfwerking': 1 },
    )
    expect(none.missingPhotoAttributeKeys).toEqual([])
    expect(none.isComplete).toBe(true)

    const implicitNone = evaluateRoomCompleteness(
      wws,
      'badkamer',
      {
        gedeeldeRuimte: false,
        verwarmd: true,
        waterdichteAfwerking: true,
      },
      { 'room.verwarmd': 1, 'room.waterdichteAfwerking': 1 },
    )
    expect(implicitNone.missingAttributeKeys).toEqual([])
    expect(implicitNone.missingPhotoAttributeKeys).toEqual([])
    expect(implicitNone.isComplete).toBe(true)
  })

  it('does not require a photo when a boolean amenity is absent', () => {
    const absent = evaluateRoomCompleteness(wws, 'badkamer', {
      gedeeldeRuimte: false,
      verwarmd: false,
      sanitaireVoorzieningen: ['geen'],
      waterdichteAfwerking: false,
    })
    expect(absent.missingPhotoAttributeKeys).toEqual([])
    expect(absent.isComplete).toBe(true)
  })

  it('overrides kitchen waterproof help', () => {
    const bathroom = listVisibleQuestions(wws, 'badkamer', {}).find(
      (q) => q.attributeKey === 'room.waterdichteAfwerking',
    )
    const kitchen = listVisibleQuestions(wws, 'keuken', {}).find(
      (q) => q.attributeKey === 'room.waterdichteAfwerking',
    )
    expect(bathroom?.helpText).toMatch(/bad- of doucheruimte/)
    expect(kitchen?.helpText).toMatch(/Tegelwerk boven het aanrechtblad/)
  })
})

describe('WWS 1.0.0', () => {
  const wws = loadWws('wws-1.0.0.json')

  it('moves pandvragen to propertyQuestions and drops the algemeen room', () => {
    expect(wws.version).toBe('1.0.0')
    expect(wws.roomTypes.some((rt) => rt.id === 'algemeen')).toBe(false)
    expect(wws.propertyQuestions?.map((q) => q.attributeKey)).toEqual([
      'property.wozWaardeOnlineOphalen',
      'property.wozWaardeEigenschatting',
      'property.energieLabel',
      'property.coropGebied',
      'property.woningKenmerken',
      'property.woningVoorzieningen',
      'property.specialCareHomeAanwezig',
      'property.specialCareHome',
      'property.laadstationsZonderParkeergelegenheidAanwezig',
      'property.laadstationsZonderParkeergelegenheid',
      'property.energieprestatievergoedingAanwezig',
      'property.energieprestatievergoeding',
    ])
    expect(wws.attributes['property.wozWaardeOnlineOphalen']?.answerScope).toBe('property')
    expect(wws.attributes['room.wozWaardeOnlineOphalen']).toBeUndefined()
  })

  it('hides WOZ eigenschatting until online ophalen is no', () => {
    const keys = (answers: Record<string, unknown>) =>
      listVisiblePropertyQuestions(wws, answers).map((q) => q.attributeKey)
    expect(keys({})).not.toContain('property.wozWaardeEigenschatting')
    expect(keys({ wozWaardeOnlineOphalen: true })).not.toContain('property.wozWaardeEigenschatting')
    expect(keys({ wozWaardeOnlineOphalen: false })).toContain('property.wozWaardeEigenschatting')
  })

  it('counts property questions in template completeness', () => {
    const incomplete = evaluateTemplateCompleteness(wws, [], {})
    expect(incomplete.property.isComplete).toBe(false)
    expect(incomplete.isComplete).toBe(false)

    const complete = evaluateTemplateCompleteness(wws, [], {}, {}, {
      propertyAnswers: {
        wozWaardeOnlineOphalen: true,
        energieLabel: false,
        coropGebied: false,
        woningKenmerken: ['geen'],
        woningVoorzieningen: ['geen'],
        specialCareHomeAanwezig: false,
        laadstationsZonderParkeergelegenheidAanwezig: false,
        energieprestatievergoedingAanwezig: false,
      },
    })
    expect(complete.property.isComplete).toBe(true)
    expect(complete.isComplete).toBe(true)
  })

  it('asks reserved carport area only when the carport is shared', () => {
    const keys = (answers: Record<string, unknown>) =>
      listVisibleQuestions(wws, 'carport', answers).map((q) => q.attributeKey)

    expect(keys({})).toEqual(['room.gedeeldeParkeervoorziening', 'room.laadpaalVoorzieningen'])
    expect(keys({ gedeeldeParkeervoorziening: false })).toEqual([
      'room.gedeeldeParkeervoorziening',
      'room.laadpaalVoorzieningen',
    ])
    expect(keys({ gedeeldeParkeervoorziening: true })).toEqual([
      'room.gedeeldeParkeervoorziening',
      'room.gereserveerdOppervlak',
      'room.laadpaalVoorzieningen',
    ])

    expect(
      evaluateRoomCompleteness(wws, 'carport', {
        gedeeldeParkeervoorziening: true,
        laadpaalVoorzieningen: ['geen'],
      }).missingAttributeKeys,
    ).toEqual(['room.gereserveerdOppervlak'])
    expect(
      evaluateRoomCompleteness(wws, 'carport', {
        gedeeldeParkeervoorziening: true,
        gereserveerdOppervlak: 12.5,
        laadpaalVoorzieningen: ['geen'],
      }).isComplete,
    ).toBe(true)
  })
})
