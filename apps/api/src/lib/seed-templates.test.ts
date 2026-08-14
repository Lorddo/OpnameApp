import { describe, expect, it } from 'vitest'
import { listVisibleQuestions, parseInspectionTemplate } from '@opnameapp/core'
import bbmiTemplate from '../seed/bbmi-0.1.0.json'
import { templateQuestionSignature } from './seed-templates.js'

describe('templateQuestionSignature', () => {
  it('detects missing showWhen on zolder follow-ups', () => {
    const current = parseInspectionTemplate(bbmiTemplate)
    const stale = structuredClone(current)
    const zolder = stale.roomTypes.find((rt) => rt.id === 'zolder')
    for (const q of zolder?.questions ?? []) {
      delete q.showWhen
    }
    expect(templateQuestionSignature(stale)).not.toBe(templateQuestionSignature(current))
  })

  it('ignores jsonb key order', () => {
    const a = { roomTypes: [{ id: 'zolder', questions: [{ showWhen: 'x', attributeKey: 'room.toegangType' }] }] }
    const b = { roomTypes: [{ id: 'zolder', questions: [{ attributeKey: 'room.toegangType', showWhen: 'x' }] }] }
    expect(templateQuestionSignature(a)).toBe(templateQuestionSignature(b))
  })
})

describe('bbmi follow-up chains', () => {
  const bbmi = parseInspectionTemplate(bbmiTemplate)
  const keys = (roomTypeId: string, answers: Record<string, unknown>) =>
    listVisibleQuestions(bbmi, roomTypeId, answers).map((q) => q.attributeKey)

  it('stops serre after afgesloten=no and klimaat after isolatie=no', () => {
    expect(keys('serre', { afgeslotenRuimte: false })).toEqual(['room.afgeslotenRuimte'])
    expect(keys('serre', { afgeslotenRuimte: true, geisoleerd: false })).toEqual([
      'room.afgeslotenRuimte',
      'room.geisoleerd',
    ])
  })

  it('asks externe bergruimte binnendoor first and gedeelde muur only when that is no', () => {
    expect(keys('externeBergruimte', { afgeslotenRuimte: false })).toEqual(['room.afgeslotenRuimte'])
    expect(keys('externeBergruimte', { afgeslotenRuimte: true, binnendoorBereikbaar: true })).toEqual(
      ['room.afgeslotenRuimte', 'room.binnendoorBereikbaar'],
    )
    expect(
      keys('externeBergruimte', { afgeslotenRuimte: true, binnendoorBereikbaar: false }),
    ).toEqual([
      'room.afgeslotenRuimte',
      'room.binnendoorBereikbaar',
      'room.gedeeldeMuurHoofdgebouw',
    ])
  })

  it('stops zolder follow-ups on vlizo or any no in the trap chain', () => {
    expect(keys('zolder', { toegangType: 'vlizo' })).toEqual(['room.toegangType'])
    expect(keys('zolder', { toegangType: 'trap', oppervlak4m2Boven2m: false })).toEqual([
      'room.toegangType',
      'room.oppervlak4m2Boven2m',
    ])
  })

  it('stops omgebouwde bergruimte after auto=yes and klimaat after isolatie=no', () => {
    expect(keys('omgebouwdeBergruimte', { toegankelijkVoorAuto: true })).toEqual([
      'room.toegankelijkVoorAuto',
    ])
    expect(
      keys('omgebouwdeBergruimte', { toegankelijkVoorAuto: false, geisoleerd: false }),
    ).toEqual(['room.toegankelijkVoorAuto', 'room.geisoleerd'])
  })

  it('hides berging/kast verbonden-vraag when binnen hoofdobject is yes', () => {
    expect(keys('bergingKastAppartement', {})).toEqual(['room.binnenHoofdobject'])
    expect(keys('bergingKastAppartement', { binnenHoofdobject: true })).toEqual([
      'room.binnenHoofdobject',
    ])
    expect(keys('bergingKastAppartement', { binnenHoofdobject: false })).toEqual([
      'room.binnenHoofdobject',
      'room.directVerbondenWoning',
    ])
  })
})
