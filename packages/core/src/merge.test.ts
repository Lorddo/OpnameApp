import { describe, expect, it } from 'vitest'
import {
  evaluateCompletenessPerTemplate,
  evaluateMergedRoomCompleteness,
  mergeTemplates,
} from './merge.js'
import type { InspectionTemplate } from './template-schema.js'

const bbmi: InspectionTemplate = {
  id: 'bbmi',
  version: '0.1.0',
  label: 'BBMI',
  locale: 'nl-NL',
  attributes: {
    'room.geisoleerd': {
      answerScope: 'room',
      questionKey: 'geisoleerd',
      label: 'Geïsoleerd?',
      answerType: 'boolean',
    },
    'room.klimaatregeling': {
      answerScope: 'room',
      questionKey: 'klimaatregeling',
      label: 'Klimaatregeling?',
      answerType: 'boolean',
    },
  },
  roomTypes: [
    {
      id: 'serre',
      label: 'Serre',
      allowMultiplePerFloor: true,
      questions: [
        { attributeKey: 'room.geisoleerd', sortOrder: 1, photoRequired: false },
        { attributeKey: 'room.klimaatregeling', sortOrder: 2, photoRequired: true },
      ],
    },
  ],
}

const wws: InspectionTemplate = {
  id: 'wws',
  version: '1.0.0',
  label: 'WWS',
  locale: 'nl-NL',
  attributes: {
    'room.geisoleerd': {
      answerScope: 'room',
      questionKey: 'geisoleerd',
      label: 'Geïsoleerd?',
      answerType: 'boolean',
    },
    'room.daglichtMin05m2': {
      answerScope: 'room',
      questionKey: 'daglichtMin05m2',
      label: 'Daglicht?',
      answerType: 'boolean',
    },
  },
  roomTypes: [
    {
      id: 'serre',
      label: 'Serre',
      allowMultiplePerFloor: false,
      questions: [
        {
          attributeKey: 'room.geisoleerd',
          sortOrder: 5,
          photoRequired: false,
          helpTextOverride: 'WWS help',
        },
        { attributeKey: 'room.daglichtMin05m2', sortOrder: 6, photoRequired: false },
      ],
    },
  ],
}

describe('mergeTemplates', () => {
  it('dedupes attributes and ORs photoRequired / allowMultiplePerFloor', () => {
    const merged = mergeTemplates([bbmi, wws])
    const serre = merged.roomTypes.find((rt) => rt.id === 'serre')!
    expect(serre.allowMultiplePerFloor).toBe(true)
    expect(serre.questions.map((q) => q.attributeKey).sort()).toEqual([
      'room.daglichtMin05m2',
      'room.geisoleerd',
      'room.klimaatregeling',
    ])
    const climate = serre.questions.find((q) => q.attributeKey === 'room.klimaatregeling')!
    expect(climate.photoRequired).toBe(true)
    expect(merged.conflicts.some((c) => c.kind === 'sortOrder')).toBe(true)
  })

  it('computes completeness per template over shared answers', () => {
    const perTemplate = evaluateCompletenessPerTemplate(
      [bbmi, wws],
      'serre',
      { geisoleerd: true, klimaatregeling: true, daglichtMin05m2: true },
      { 'room.klimaatregeling': 1 },
    )
    expect(perTemplate.bbmi?.isComplete).toBe(true)
    expect(perTemplate.wws?.isComplete).toBe(true)
  })

  it('treats unanswered merged questions as incomplete', () => {
    const merged = mergeTemplates([bbmi, wws])
    const result = evaluateMergedRoomCompleteness(merged, 'serre', { geisoleerd: true })
    expect(result.isComplete).toBe(false)
    expect(result.missingAttributeKeys).toEqual(
      expect.arrayContaining(['room.klimaatregeling', 'room.daglichtMin05m2']),
    )
  })
})
