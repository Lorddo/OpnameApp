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
