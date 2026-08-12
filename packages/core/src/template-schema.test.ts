import { describe, expect, it } from 'vitest'
import { safeParseInspectionTemplate } from './template-schema.js'

describe('InspectionTemplateSchema', () => {
  it('accepts a minimal valid template', () => {
    const result = safeParseInspectionTemplate({
      id: 'demo',
      version: '0.0.1',
      label: 'Demo',
      locale: 'nl-NL',
      attributes: {
        'room.demoFlag': {
          answerScope: 'room',
          questionKey: 'demoFlag',
          label: 'Demo?',
          answerType: 'boolean',
        },
      },
      roomTypes: [
        {
          id: 'demoRoom',
          label: 'Demo room',
          allowMultiplePerFloor: false,
          questions: [
            {
              attributeKey: 'room.demoFlag',
              sortOrder: 1,
              photoRequired: false,
            },
          ],
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects mismatched attribute keys', () => {
    const result = safeParseInspectionTemplate({
      id: 'demo',
      version: '0.0.1',
      label: 'Demo',
      locale: 'nl-NL',
      attributes: {
        wrongKey: {
          answerScope: 'room',
          questionKey: 'demoFlag',
          label: 'Demo?',
          answerType: 'boolean',
        },
      },
      roomTypes: [
        {
          id: 'demoRoom',
          label: 'Demo room',
          allowMultiplePerFloor: false,
          questions: [],
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
