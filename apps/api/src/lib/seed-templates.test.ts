import { describe, expect, it } from 'vitest'
import { parseInspectionTemplate } from '@opnameapp/core'
import bbmiTemplate from '../../../../templates/bbmi/bbmi-1.0.0.json'
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

  it('detects photoRequiredWhen changes', () => {
    const current = parseInspectionTemplate(bbmiTemplate)
    const stale = structuredClone(current)
    const room = stale.roomTypes.find((rt) => rt.id === 'omgebouwdeBergruimte')
    const question = room?.questions.find((q) => q.attributeKey === 'room.toegankelijkVoorAuto')
    if (question) question.photoRequiredWhen = 'present'
    expect(templateQuestionSignature(stale)).not.toBe(templateQuestionSignature(current))
  })

  it('ignores jsonb key order', () => {
    const a = {
      roomTypes: [
        { id: 'zolder', questions: [{ showWhen: 'x', attributeKey: 'room.toegangType' }] },
      ],
    }
    const b = {
      roomTypes: [
        { id: 'zolder', questions: [{ attributeKey: 'room.toegangType', showWhen: 'x' }] },
      ],
    }
    expect(templateQuestionSignature(a)).toBe(templateQuestionSignature(b))
  })
})
