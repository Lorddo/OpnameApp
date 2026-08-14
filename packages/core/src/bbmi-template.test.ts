import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  evaluateRoomCompleteness,
  evaluateTemplateCompleteness,
  listVisibleQuestions,
  parseInspectionTemplate,
} from './index.js'

const templatesDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../templates/bbmi')

function loadBbmi(filename: string) {
  const raw = JSON.parse(readFileSync(path.join(templatesDir, filename), 'utf8'))
  return parseInspectionTemplate(raw)
}

describe('BBMI 1.0.0', () => {
  const bbmi = loadBbmi('bbmi-1.0.0.json')

  it('is the published special-room checklist: room-scope only, no standard rooms', () => {
    expect(bbmi.id).toBe('bbmi')
    expect(bbmi.version).toBe('1.0.0')
    expect(Object.values(bbmi.attributes).every((attr) => attr.answerScope === 'room')).toBe(true)
    expect(bbmi.roomTypes.map((rt) => rt.id).sort()).toEqual(
      [
        'bergingKastAppartement',
        'bergruimte',
        'carport',
        'erker',
        'externeBergruimte',
        'meterkast',
        'omgebouwdeBergruimte',
        'parkeerplaats',
        'ruimteMetBalken',
        'serre',
        'souterrain',
        'zolder',
        'zwembad',
      ].sort(),
    )
    expect(bbmi.roomTypes.some((rt) => /woonkamer|keuken|badkamer|slaapkamer/i.test(rt.id))).toBe(
      false,
    )
  })

  it('requires a photo only on omgebouwde bergruimte (customer test hook)', () => {
    const required = bbmi.roomTypes.flatMap((rt) =>
      rt.questions.filter((q) => q.photoRequired).map((q) => `${rt.id}:${q.attributeKey}`),
    )
    expect(required).toEqual(['omgebouwdeBergruimte:room.toegankelijkVoorAuto'])
  })

  it('treats a vlizo zolder as complete after toegangType', () => {
    const result = evaluateRoomCompleteness(bbmi, 'zolder', { toegangType: 'vlizo' })
    expect(result.isComplete).toBe(true)
    expect(result.visibleCount).toBe(1)
  })

  it('hides berging/kast verbonden-vraag when binnen hoofdobject is yes', () => {
    const keys = (answers: Record<string, unknown>) =>
      listVisibleQuestions(bbmi, 'bergingKastAppartement', answers).map((q) => q.attributeKey)
    expect(keys({ binnenHoofdobject: true })).toEqual(['room.binnenHoofdobject'])
    expect(keys({ binnenHoofdobject: false })).toEqual([
      'room.binnenHoofdobject',
      'room.directVerbondenWoning',
    ])
  })

  it('skips rooms that are not in this template when scoring completeness', () => {
    const result = evaluateTemplateCompleteness(
      bbmi,
      [
        { id: 'room-1', roomType: 'serre' },
        { id: 'room-2', roomType: 'woonkamer' },
      ],
      { 'room-1': { afgeslotenRuimte: false } },
    )
    expect(result.rooms.map((row) => row.roomId)).toEqual(['room-1'])
    expect(result.isComplete).toBe(true)
  })

  it('flags the test photo hook when omgebouwde bergruimte has no photo', () => {
    const result = evaluateTemplateCompleteness(
      bbmi,
      [{ id: 'room-1', roomType: 'omgebouwdeBergruimte' }],
      { 'room-1': { toegankelijkVoorAuto: true } },
    )
    expect(result.isComplete).toBe(false)
    expect(result.missingPhotoCount).toBe(1)
  })
})

describe('BBMI 0.1.0', () => {
  it('remains loadable for already pinned inspections', () => {
    const bbmi = loadBbmi('bbmi-0.1.0.json')
    expect(bbmi.id).toBe('bbmi')
    expect(bbmi.version).toBe('0.1.0')
    expect(bbmi.roomTypes.length).toBe(13)
  })
})
