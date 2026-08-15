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

  it('allows omitting photoRequiredWhen', () => {
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
              photoRequired: true,
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.roomTypes[0]?.questions[0]?.photoRequiredWhen).toBeUndefined()
    }
  })

  it('rejects unknown photoRequiredWhen values', () => {
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
              photoRequired: true,
              photoRequiredWhen: 'sometimes',
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts photoRequiredWhen present and always', () => {
    const present = safeParseInspectionTemplate({
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
              photoRequired: true,
              photoRequiredWhen: 'present',
            },
          ],
        },
      ],
    })
    const always = safeParseInspectionTemplate({
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
              photoRequired: true,
              photoRequiredWhen: 'always',
            },
          ],
        },
      ],
    })
    expect(present.success).toBe(true)
    expect(always.success).toBe(true)
    if (present.success) {
      expect(present.data.roomTypes[0]?.questions[0]?.photoRequiredWhen).toBe('present')
    }
    if (always.success) {
      expect(always.data.roomTypes[0]?.questions[0]?.photoRequiredWhen).toBe('always')
    }
  })

  it('accepts multiChoice attributes with options', () => {
    const result = safeParseInspectionTemplate({
      id: 'demo',
      version: '0.0.1',
      label: 'Demo',
      locale: 'nl-NL',
      attributes: {
        'room.voorzieningen': {
          answerScope: 'room',
          questionKey: 'voorzieningen',
          label: 'Welke voorzieningen zijn aanwezig?',
          answerType: 'multiChoice',
          options: [
            { value: 'douche', label: 'Douche' },
            { value: 'geen', label: 'Geen van deze' },
          ],
        },
      },
      roomTypes: [
        {
          id: 'badkamer',
          label: 'Badkamer',
          allowMultiplePerFloor: true,
          questions: [
            {
              attributeKey: 'room.voorzieningen',
              sortOrder: 1,
              photoRequired: true,
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

  it('accepts propertyQuestions with property-scope attributes', () => {
    const result = safeParseInspectionTemplate({
      id: 'demo',
      version: '0.0.1',
      label: 'Demo',
      locale: 'nl-NL',
      attributes: {
        'property.woz': {
          answerScope: 'property',
          questionKey: 'woz',
          label: 'WOZ?',
          answerType: 'boolean',
        },
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
          questions: [{ attributeKey: 'room.demoFlag', sortOrder: 1, photoRequired: false }],
        },
      ],
      propertyQuestions: [
        {
          attributeKey: 'property.woz',
          sortOrder: 1,
          photoRequired: false,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty roomTypes when assetTypes are present', () => {
    const result = safeParseInspectionTemplate({
      id: 'epaw',
      version: '0.1.0',
      label: 'EPA-w',
      locale: 'nl-NL',
      attributes: {
        'asset.orientatie': {
          answerScope: 'asset',
          questionKey: 'orientatie',
          label: 'Oriëntatie?',
          answerType: 'choice',
          options: [
            { value: 'N', label: 'Noord' },
            { value: 'onbekend', label: 'Onbekend' },
          ],
        },
      },
      roomTypes: [],
      assetTypes: [
        {
          id: 'gevel',
          label: 'Gevel',
          location: 'floor',
          allowMultiple: true,
          questions: [{ attributeKey: 'asset.orientatie', sortOrder: 1, photoRequired: false }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects room-scope attributes on assetTypes', () => {
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
      roomTypes: [],
      assetTypes: [
        {
          id: 'gevel',
          label: 'Gevel',
          location: 'floor',
          allowMultiple: true,
          questions: [{ attributeKey: 'room.demoFlag', sortOrder: 1, photoRequired: false }],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects room-scope attributes in propertyQuestions', () => {
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
          questions: [],
        },
      ],
      propertyQuestions: [
        { attributeKey: 'room.demoFlag', sortOrder: 1, photoRequired: false },
      ],
    })
    expect(result.success).toBe(false)
  })
})
