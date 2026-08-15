import { describe, expect, it } from 'vitest'
import { nextSelectedTemplates, type TemplatePin } from './templates'

const bbmi: TemplatePin = { templateKey: 'bbmi', templateVersion: '1.0.0' }
const wws: TemplatePin = { templateKey: 'wws', templateVersion: '1.0.0' }

describe('nextSelectedTemplates', () => {
  it('enables a new inspection pin', () => {
    expect(nextSelectedTemplates([bbmi], wws, true)).toEqual([bbmi, wws])
  })

  it('disables a pin when another remains', () => {
    expect(nextSelectedTemplates([bbmi, wws], wws, false)).toEqual([bbmi])
  })

  it('does not drop the last remaining inspection', () => {
    expect(nextSelectedTemplates([bbmi], bbmi, false)).toBeNull()
  })

  it('is a no-op when the pin is already in the requested state', () => {
    expect(nextSelectedTemplates([bbmi], bbmi, true)).toBeNull()
    expect(nextSelectedTemplates([bbmi], wws, false)).toBeNull()
  })
})
