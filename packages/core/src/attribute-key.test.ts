import { describe, expect, it } from 'vitest'
import { attributeQuestionKey } from './attribute-key.js'

describe('attributeQuestionKey', () => {
  it('strips the scope prefix', () => {
    expect(attributeQuestionKey('room.toegangType')).toBe('toegangType')
    expect(attributeQuestionKey('property.buildYear')).toBe('buildYear')
  })

  it('keeps keys without a prefix', () => {
    expect(attributeQuestionKey('toegangType')).toBe('toegangType')
  })

  it('keeps nested suffixes after the first dot', () => {
    expect(attributeQuestionKey('room.foo.bar')).toBe('foo.bar')
  })
})
