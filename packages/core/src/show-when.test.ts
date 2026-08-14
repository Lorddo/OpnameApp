import { describe, expect, it } from 'vitest'
import {
  evaluateShowWhen,
  parseShowWhen,
  ShowWhenEvalError,
  ShowWhenParseError,
} from './show-when.js'

describe('parseShowWhen', () => {
  it('parses room.this comparisons with AND/OR and parentheses', () => {
    const ast = parseShowWhen(
      'room.this.geisoleerd = true AND (room.this.afgeslotenRuimte = false OR room.this.plafondHoogteMin190 = true)',
    )
    expect(ast.type).toBe('and')
  })

  it('parses later selectors without evaluating them', () => {
    const ast = parseShowWhen('property.this.bouwjaar >= 1990')
    expect(ast).toMatchObject({
      type: 'comparison',
      target: { kind: 'property.this', questionKey: 'bouwjaar' },
      op: '>=',
      value: 1990,
    })
  })

  it('parses room.any(roomType=serre).geisoleerd', () => {
    const ast = parseShowWhen('room.any(roomType=serre).geisoleerd = true')
    expect(ast).toMatchObject({
      type: 'comparison',
      target: { kind: 'room.any', roomType: 'serre', questionKey: 'geisoleerd' },
    })
  })

  it('rejects invalid syntax', () => {
    expect(() => parseShowWhen('room.this. = true')).toThrow(ShowWhenParseError)
  })
})

describe('evaluateShowWhen', () => {
  it('evaluates choice strings', () => {
    const ast = parseShowWhen('room.this.toegangType = "trap"')
    expect(evaluateShowWhen(ast, { roomAnswers: { toegangType: 'trap' } })).toBe(true)
    expect(evaluateShowWhen(ast, { roomAnswers: { toegangType: 'vlizo' } })).toBe(false)
    expect(evaluateShowWhen(ast, { roomAnswers: {} })).toBe(false)
  })

  it('throws a clear error for unsupported selectors', () => {
    const ast = parseShowWhen('floor.this.demo = true')
    expect(() => evaluateShowWhen(ast, { roomAnswers: {} })).toThrow(ShowWhenEvalError)
  })
})
