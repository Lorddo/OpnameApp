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
    const ast = parseShowWhen('floor.this.demo = true')
    expect(ast).toMatchObject({
      type: 'comparison',
      target: { kind: 'floor.this', questionKey: 'demo' },
      op: '=',
      value: true,
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

  it('treats multiChoice arrays as a match when any selected value is in the list', () => {
    const ast = parseShowWhen('room.this.sanitaireVoorzieningen in ["douche", "badDouche"]')
    expect(
      evaluateShowWhen(ast, { roomAnswers: { sanitaireVoorzieningen: ['wastafel', 'douche'] } }),
    ).toBe(true)
    expect(evaluateShowWhen(ast, { roomAnswers: { sanitaireVoorzieningen: ['wastafel'] } })).toBe(
      false,
    )
  })

  it('evaluates property.this against propertyAnswers', () => {
    const ast = parseShowWhen('property.this.wozWaardeOnlineOphalen = false')
    expect(
      evaluateShowWhen(ast, {
        propertyAnswers: { wozWaardeOnlineOphalen: false },
      }),
    ).toBe(true)
    expect(
      evaluateShowWhen(ast, {
        propertyAnswers: { wozWaardeOnlineOphalen: true },
      }),
    ).toBe(false)
  })

  it('evaluates room questions that depend on property.this', () => {
    const ast = parseShowWhen('property.this.onderkant = "kruipruimte"')
    expect(
      evaluateShowWhen(ast, {
        roomAnswers: { verwarmd: true },
        propertyAnswers: { onderkant: 'kruipruimte' },
      }),
    ).toBe(true)
  })

  it('throws a clear error for unsupported selectors', () => {
    const ast = parseShowWhen('floor.this.demo = true')
    expect(() => evaluateShowWhen(ast, { roomAnswers: {} })).toThrow(ShowWhenEvalError)
  })
})
