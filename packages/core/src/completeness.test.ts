import { describe, expect, it } from 'vitest'
import { clearHiddenAnswers, evaluateRoomCompleteness, listVisibleQuestions } from './completeness.js'
import type { InspectionTemplate } from './template-schema.js'

const template: InspectionTemplate = {
  id: 'demo',
  version: '0.0.1',
  label: 'Demo',
  locale: 'nl-NL',
  attributes: {
    'room.plafondHoogteMin190': {
      answerScope: 'room',
      questionKey: 'plafondHoogteMin190',
      label: 'Hoog genoeg?',
      answerType: 'boolean',
    },
    'room.balkenVervangbaarDoorMuren': {
      answerScope: 'room',
      questionKey: 'balkenVervangbaarDoorMuren',
      label: 'Balken vervangbaar?',
      answerType: 'boolean',
    },
  },
  roomTypes: [
    {
      id: 'ruimteMetBalken',
      label: 'Ruimte met balken',
      allowMultiplePerFloor: true,
      questions: [
        {
          attributeKey: 'room.plafondHoogteMin190',
          sortOrder: 1,
          photoRequired: false,
        },
        {
          attributeKey: 'room.balkenVervangbaarDoorMuren',
          sortOrder: 2,
          photoRequired: true,
          showWhen: 'room.this.plafondHoogteMin190 = false',
        },
      ],
    },
    {
      id: 'emptyRoom',
      label: 'Leeg',
      allowMultiplePerFloor: false,
      questions: [],
    },
  ],
}

describe('completeness', () => {
  it('hides dependent questions until showWhen is true', () => {
    const visible = listVisibleQuestions(template, 'ruimteMetBalken', {
      plafondHoogteMin190: true,
    })
    expect(visible.map((q) => q.attributeKey)).toEqual(['room.plafondHoogteMin190'])
  })

  it('requires photos when photoRequired and visible', () => {
    const result = evaluateRoomCompleteness(
      template,
      'ruimteMetBalken',
      { plafondHoogteMin190: false, balkenVervangbaarDoorMuren: true },
      {},
    )
    expect(result.isComplete).toBe(false)
    expect(result.missingPhotoAttributeKeys).toEqual(['room.balkenVervangbaarDoorMuren'])
  })

  it('marks empty roomTypes complete', () => {
    expect(evaluateRoomCompleteness(template, 'emptyRoom', {}).isComplete).toBe(true)
  })

  it('clears hidden answers', () => {
    const cleared = clearHiddenAnswers(template.roomTypes[0]!, {
      plafondHoogteMin190: true,
      balkenVervangbaarDoorMuren: true,
    })
    expect(cleared).toEqual({ plafondHoogteMin190: true })
  })
})

const booleanAttr = (questionKey: string, label: string) =>
  ({
    [`room.${questionKey}`]: {
      answerScope: 'room' as const,
      questionKey,
      label,
      answerType: 'boolean' as const,
    },
  })

const followUps: InspectionTemplate = {
  id: 'bbmi',
  version: '0.1.0',
  label: 'BBMI',
  locale: 'nl-NL',
  attributes: {
    ...booleanAttr('afgeslotenRuimte', 'Afgesloten?'),
    ...booleanAttr('geisoleerd', 'Geïsoleerd?'),
    ...booleanAttr('klimaatregeling', 'Klimaatregeling?'),
    ...booleanAttr('binnendoorBereikbaar', 'Binnendoor?'),
    ...booleanAttr('gedeeldeMuurHoofdgebouw', 'Gedeelde muur?'),
    ...booleanAttr('oppervlak4m2Boven2m', 'Oppervlak?'),
    ...booleanAttr('daglichtMin05m2', 'Daglicht?'),
    ...booleanAttr('toegankelijkVoorAuto', 'Auto?'),
    'room.toegangType': {
      answerScope: 'room',
      questionKey: 'toegangType',
      label: 'Toegang?',
      answerType: 'choice',
      options: [
        { value: 'trap', label: 'Trap' },
        { value: 'vlizo', label: 'Luik of vlizo-trap (ladder)' },
      ],
    },
  },
  roomTypes: [
    {
      id: 'serre',
      label: 'Serre',
      allowMultiplePerFloor: true,
      questions: [
        { attributeKey: 'room.afgeslotenRuimte', sortOrder: 1, photoRequired: false },
        {
          attributeKey: 'room.geisoleerd',
          sortOrder: 2,
          photoRequired: false,
          showWhen: 'room.this.afgeslotenRuimte = true',
        },
        {
          attributeKey: 'room.klimaatregeling',
          sortOrder: 3,
          photoRequired: false,
          showWhen: 'room.this.afgeslotenRuimte = true AND room.this.geisoleerd = true',
        },
      ],
    },
    {
      id: 'externeBergruimte',
      label: 'Externe bergruimte',
      allowMultiplePerFloor: true,
      questions: [
        { attributeKey: 'room.afgeslotenRuimte', sortOrder: 1, photoRequired: false },
        {
          attributeKey: 'room.binnendoorBereikbaar',
          sortOrder: 2,
          photoRequired: false,
          showWhen: 'room.this.afgeslotenRuimte = true',
        },
        {
          attributeKey: 'room.gedeeldeMuurHoofdgebouw',
          sortOrder: 3,
          photoRequired: false,
          showWhen: 'room.this.afgeslotenRuimte = true AND room.this.binnendoorBereikbaar = false',
        },
      ],
    },
    {
      id: 'zolder',
      label: 'Zolder',
      allowMultiplePerFloor: true,
      questions: [
        { attributeKey: 'room.toegangType', sortOrder: 1, photoRequired: false },
        {
          attributeKey: 'room.oppervlak4m2Boven2m',
          sortOrder: 2,
          photoRequired: false,
          showWhen: 'room.this.toegangType = "trap"',
        },
        {
          attributeKey: 'room.daglichtMin05m2',
          sortOrder: 3,
          photoRequired: false,
          showWhen: 'room.this.toegangType = "trap" AND room.this.oppervlak4m2Boven2m = true',
        },
        {
          attributeKey: 'room.geisoleerd',
          sortOrder: 4,
          photoRequired: false,
          showWhen:
            'room.this.toegangType = "trap" AND room.this.oppervlak4m2Boven2m = true AND room.this.daglichtMin05m2 = true',
        },
        {
          attributeKey: 'room.klimaatregeling',
          sortOrder: 5,
          photoRequired: false,
          showWhen:
            'room.this.toegangType = "trap" AND room.this.oppervlak4m2Boven2m = true AND room.this.daglichtMin05m2 = true AND room.this.geisoleerd = true',
        },
      ],
    },
    {
      id: 'omgebouwdeBergruimte',
      label: 'Omgebouwde bergruimte',
      allowMultiplePerFloor: true,
      questions: [
        { attributeKey: 'room.toegankelijkVoorAuto', sortOrder: 1, photoRequired: true },
        {
          attributeKey: 'room.geisoleerd',
          sortOrder: 2,
          photoRequired: false,
          showWhen: 'room.this.toegankelijkVoorAuto = false',
        },
        {
          attributeKey: 'room.klimaatregeling',
          sortOrder: 3,
          photoRequired: false,
          showWhen: 'room.this.toegankelijkVoorAuto = false AND room.this.geisoleerd = true',
        },
      ],
    },
  ],
}

function visibleKeys(roomTypeId: string, answers: Record<string, unknown>) {
  return listVisibleQuestions(followUps, roomTypeId, answers).map((q) => q.attributeKey)
}

describe('serre follow-up questions', () => {
  it('hides isolatie and klimaat until the space is enclosed', () => {
    expect(visibleKeys('serre', {})).toEqual(['room.afgeslotenRuimte'])
    expect(visibleKeys('serre', { afgeslotenRuimte: false })).toEqual(['room.afgeslotenRuimte'])
  })

  it('hides klimaat until isolatie is yes', () => {
    expect(visibleKeys('serre', { afgeslotenRuimte: true })).toEqual([
      'room.afgeslotenRuimte',
      'room.geisoleerd',
    ])
    expect(visibleKeys('serre', { afgeslotenRuimte: true, geisoleerd: false })).toEqual([
      'room.afgeslotenRuimte',
      'room.geisoleerd',
    ])
    expect(visibleKeys('serre', { afgeslotenRuimte: true, geisoleerd: true })).toEqual([
      'room.afgeslotenRuimte',
      'room.geisoleerd',
      'room.klimaatregeling',
    ])
  })
})

describe('externe bergruimte follow-up questions', () => {
  it('hides follow-ups until the space is enclosed', () => {
    expect(visibleKeys('externeBergruimte', { afgeslotenRuimte: false })).toEqual([
      'room.afgeslotenRuimte',
    ])
  })

  it('asks binnendoor first and skips gedeelde muur when that is yes', () => {
    expect(visibleKeys('externeBergruimte', { afgeslotenRuimte: true })).toEqual([
      'room.afgeslotenRuimte',
      'room.binnendoorBereikbaar',
    ])
    expect(
      visibleKeys('externeBergruimte', { afgeslotenRuimte: true, binnendoorBereikbaar: true }),
    ).toEqual(['room.afgeslotenRuimte', 'room.binnendoorBereikbaar'])
  })

  it('asks gedeelde muur only when binnendoor is no', () => {
    expect(
      visibleKeys('externeBergruimte', { afgeslotenRuimte: true, binnendoorBereikbaar: false }),
    ).toEqual([
      'room.afgeslotenRuimte',
      'room.binnendoorBereikbaar',
      'room.gedeeldeMuurHoofdgebouw',
    ])
  })
})

describe('zolder follow-up questions', () => {
  it('hides follow-ups until toegang is trap', () => {
    expect(visibleKeys('zolder', {})).toEqual(['room.toegangType'])
    expect(visibleKeys('zolder', { toegangType: 'vlizo' })).toEqual(['room.toegangType'])
  })

  it('stops the chain as soon as a follow-up is no', () => {
    expect(visibleKeys('zolder', { toegangType: 'trap' })).toEqual([
      'room.toegangType',
      'room.oppervlak4m2Boven2m',
    ])
    expect(visibleKeys('zolder', { toegangType: 'trap', oppervlak4m2Boven2m: false })).toEqual([
      'room.toegangType',
      'room.oppervlak4m2Boven2m',
    ])
    expect(
      visibleKeys('zolder', {
        toegangType: 'trap',
        oppervlak4m2Boven2m: true,
        daglichtMin05m2: false,
      }),
    ).toEqual(['room.toegangType', 'room.oppervlak4m2Boven2m', 'room.daglichtMin05m2'])
    expect(
      visibleKeys('zolder', {
        toegangType: 'trap',
        oppervlak4m2Boven2m: true,
        daglichtMin05m2: true,
        geisoleerd: false,
      }),
    ).toEqual([
      'room.toegangType',
      'room.oppervlak4m2Boven2m',
      'room.daglichtMin05m2',
      'room.geisoleerd',
    ])
  })

  it('shows klimaat only when every previous follow-up is yes', () => {
    expect(
      visibleKeys('zolder', {
        toegangType: 'trap',
        oppervlak4m2Boven2m: true,
        daglichtMin05m2: true,
        geisoleerd: true,
      }),
    ).toEqual([
      'room.toegangType',
      'room.oppervlak4m2Boven2m',
      'room.daglichtMin05m2',
      'room.geisoleerd',
      'room.klimaatregeling',
    ])
  })

  it('treats a vlizo zolder as complete after toegangType only', () => {
    const result = evaluateRoomCompleteness(followUps, 'zolder', { toegangType: 'vlizo' })
    expect(result.isComplete).toBe(true)
    expect(result.visibleCount).toBe(1)
  })
})

describe('omgebouwde bergruimte follow-up questions', () => {
  it('hides follow-ups when the space is accessible for a car', () => {
    expect(visibleKeys('omgebouwdeBergruimte', { toegankelijkVoorAuto: true })).toEqual([
      'room.toegankelijkVoorAuto',
    ])
  })

  it('hides klimaat until isolatie is yes', () => {
    expect(visibleKeys('omgebouwdeBergruimte', { toegankelijkVoorAuto: false })).toEqual([
      'room.toegankelijkVoorAuto',
      'room.geisoleerd',
    ])
    expect(
      visibleKeys('omgebouwdeBergruimte', { toegankelijkVoorAuto: false, geisoleerd: false }),
    ).toEqual(['room.toegankelijkVoorAuto', 'room.geisoleerd'])
    expect(
      visibleKeys('omgebouwdeBergruimte', { toegankelijkVoorAuto: false, geisoleerd: true }),
    ).toEqual(['room.toegankelijkVoorAuto', 'room.geisoleerd', 'room.klimaatregeling'])
  })
})
