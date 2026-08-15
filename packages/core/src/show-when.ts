export type ComparisonOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in'

export type ShowWhenValue = boolean | number | string | Array<boolean | number | string>

export type ShowWhenTarget =
  | { kind: 'room.this'; questionKey: string }
  | { kind: 'floor.this'; questionKey: string }
  | { kind: 'property.this'; questionKey: string }
  | { kind: 'asset.this'; questionKey: string }
  | { kind: 'room.any'; roomType: string; questionKey: string }
  | { kind: 'room.all'; roomType: string; questionKey: string }
  | { kind: 'room.ref'; roomId: string; questionKey: string }

export type ShowWhenNode =
  | {
      type: 'comparison'
      target: ShowWhenTarget
      op: ComparisonOp
      value: ShowWhenValue
    }
  | {
      type: 'and'
      left: ShowWhenNode
      right: ShowWhenNode
    }
  | {
      type: 'or'
      left: ShowWhenNode
      right: ShowWhenNode
    }

export class ShowWhenParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShowWhenParseError'
  }
}

export class ShowWhenEvalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShowWhenEvalError'
  }
}

type Token =
  | { type: 'ident'; value: string }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'op'; value: ComparisonOp }
  | { type: 'and' }
  | { type: 'or' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'lbracket' }
  | { type: 'rbracket' }
  | { type: 'comma' }
  | { type: 'dot' }

function tokenize(input: string): Token[] {
  const src = input.trim()
  const tokens: Token[] = []
  let i = 0

  const peek = () => src[i]
  const advance = () => src[i++]

  while (i < src.length) {
    const ch = peek()
    if (ch === undefined) break
    if (/\s/.test(ch)) {
      i += 1
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' })
      i += 1
      continue
    }
    if (ch === '[') {
      tokens.push({ type: 'lbracket' })
      i += 1
      continue
    }
    if (ch === ']') {
      tokens.push({ type: 'rbracket' })
      i += 1
      continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' })
      i += 1
      continue
    }
    if (ch === '.') {
      tokens.push({ type: 'dot' })
      i += 1
      continue
    }

    if (ch === '"' || ch === "'") {
      const quote = advance()!
      let value = ''
      while (i < src.length && peek() !== quote) {
        value += advance()
      }
      if (peek() !== quote) {
        throw new ShowWhenParseError('Unterminated string literal')
      }
      i += 1
      tokens.push({ type: 'string', value })
      continue
    }

    if (ch === '=' || ch === '!' || ch === '>' || ch === '<') {
      let op = advance()!
      if (peek() === '=') {
        op += advance()
      }
      if (op === '=') {
        // Could be comparison or roomType= inside any/all
        tokens.push({ type: 'op', value: '=' })
      } else if (op === '!=' || op === '>=' || op === '<=' || op === '>') {
        tokens.push({ type: 'op', value: op as ComparisonOp })
      } else if (op === '<') {
        tokens.push({ type: 'op', value: '<' })
      } else {
        throw new ShowWhenParseError(`Unknown operator "${op}"`)
      }
      continue
    }

    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let raw = ''
      if (ch === '-') raw += advance()
      while (i < src.length && /[0-9.]/.test(peek() ?? '')) {
        raw += advance()
      }
      tokens.push({ type: 'number', value: Number(raw) })
      continue
    }

    if (/[A-Za-z_]/.test(ch)) {
      let raw = ''
      while (i < src.length && /[A-Za-z0-9_]/.test(peek() ?? '')) {
        raw += advance()
      }
      if (raw === 'AND') {
        tokens.push({ type: 'and' })
      } else if (raw === 'OR') {
        tokens.push({ type: 'or' })
      } else if (raw === 'true' || raw === 'false') {
        tokens.push({ type: 'boolean', value: raw === 'true' })
      } else if (raw === 'in') {
        tokens.push({ type: 'op', value: 'in' })
      } else {
        tokens.push({ type: 'ident', value: raw })
      }
      continue
    }

    throw new ShowWhenParseError(`Unexpected character "${ch}" at position ${i}`)
  }

  return tokens
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  parse(): ShowWhenNode {
    const node = this.parseOr()
    if (this.pos < this.tokens.length) {
      throw new ShowWhenParseError('Unexpected trailing tokens')
    }
    return node
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private consume(): Token {
    const token = this.tokens[this.pos]
    if (!token) throw new ShowWhenParseError('Unexpected end of expression')
    this.pos += 1
    return token
  }

  private expect(type: Token['type']): Token {
    const token = this.consume()
    if (token.type !== type) {
      throw new ShowWhenParseError(`Expected ${type}, got ${token.type}`)
    }
    return token
  }

  private parseOr(): ShowWhenNode {
    let left = this.parseAnd()
    while (this.peek()?.type === 'or') {
      this.consume()
      const right = this.parseAnd()
      left = { type: 'or', left, right }
    }
    return left
  }

  private parseAnd(): ShowWhenNode {
    let left = this.parsePrimary()
    while (this.peek()?.type === 'and') {
      this.consume()
      const right = this.parsePrimary()
      left = { type: 'and', left, right }
    }
    return left
  }

  private parsePrimary(): ShowWhenNode {
    if (this.peek()?.type === 'lparen') {
      this.consume()
      const node = this.parseOr()
      this.expect('rparen')
      return node
    }
    return this.parseComparison()
  }

  private parseComparison(): ShowWhenNode {
    const target = this.parseTarget()
    const opToken = this.consume()
    if (opToken.type !== 'op') {
      throw new ShowWhenParseError('Expected comparison operator')
    }
    const value = this.parseValue(opToken.value === 'in')
    return { type: 'comparison', target, op: opToken.value, value }
  }

  private parseTarget(): ShowWhenTarget {
    const scope = this.expect('ident')
    if (scope.type !== 'ident') throw new ShowWhenParseError('Expected target scope')

    if (scope.value === 'room' || scope.value === 'floor' || scope.value === 'property' || scope.value === 'asset') {
      this.expect('dot')
      const next = this.expect('ident')
      if (next.type !== 'ident') throw new ShowWhenParseError('Expected target selector')

      if (next.value === 'this') {
        this.expect('dot')
        const question = this.expect('ident')
        if (question.type !== 'ident') throw new ShowWhenParseError('Expected questionKey')
        return { kind: `${scope.value}.this`, questionKey: question.value } as ShowWhenTarget
      }

      if (scope.value === 'room' && (next.value === 'any' || next.value === 'all' || next.value === 'ref')) {
        this.expect('lparen')
        if (next.value === 'ref') {
          const roomIdToken = this.consume()
          const roomId =
            roomIdToken.type === 'string' || roomIdToken.type === 'ident'
              ? roomIdToken.value
              : (() => {
                  throw new ShowWhenParseError('room.ref expects a room id')
                })()
          this.expect('rparen')
          this.expect('dot')
          const question = this.expect('ident')
          if (question.type !== 'ident') throw new ShowWhenParseError('Expected questionKey')
          return { kind: 'room.ref', roomId, questionKey: question.value }
        }

        const roomTypeKey = this.expect('ident')
        if (roomTypeKey.type !== 'ident' || roomTypeKey.value !== 'roomType') {
          throw new ShowWhenParseError('Expected roomType=...')
        }
        const eq = this.consume()
        if (eq.type !== 'op' || eq.value !== '=') {
          throw new ShowWhenParseError('Expected roomType=...')
        }
        const roomTypeToken = this.consume()
        const roomType =
          roomTypeToken.type === 'ident' || roomTypeToken.type === 'string'
            ? roomTypeToken.value
            : (() => {
                throw new ShowWhenParseError('Expected roomType value')
              })()
        this.expect('rparen')
        this.expect('dot')
        const question = this.expect('ident')
        if (question.type !== 'ident') throw new ShowWhenParseError('Expected questionKey')
        return {
          kind: next.value === 'any' ? 'room.any' : 'room.all',
          roomType,
          questionKey: question.value,
        }
      }
    }

    throw new ShowWhenParseError(`Unsupported target starting with "${scope.value}"`)
  }

  private parseValue(asList: boolean): ShowWhenValue {
    if (asList) {
      this.expect('lbracket')
      const values: Array<boolean | number | string> = []
      if (this.peek()?.type !== 'rbracket') {
        values.push(this.parseScalar())
        while (this.peek()?.type === 'comma') {
          this.consume()
          values.push(this.parseScalar())
        }
      }
      this.expect('rbracket')
      return values
    }
    return this.parseScalar()
  }

  private parseScalar(): boolean | number | string {
    const token = this.consume()
    if (token.type === 'boolean' || token.type === 'number' || token.type === 'string') {
      return token.value
    }
    if (token.type === 'ident') {
      return token.value
    }
    throw new ShowWhenParseError('Expected scalar value')
  }
}

export function parseShowWhen(expression: string): ShowWhenNode {
  if (!expression.trim()) {
    throw new ShowWhenParseError('Empty showWhen expression')
  }
  return new Parser(tokenize(expression)).parse()
}

export type RoomAnswers = Record<string, unknown>

export interface ShowWhenEvalContext {
  roomAnswers?: RoomAnswers
  propertyAnswers?: RoomAnswers
  assetAnswers?: RoomAnswers
}

function compare(left: unknown, op: ComparisonOp, right: ShowWhenValue): boolean {
  if (op === 'in') {
    if (!Array.isArray(right)) {
      throw new ShowWhenEvalError('Operator "in" requires a list value')
    }
    const leftValues = Array.isArray(left) ? left : [left]
    return leftValues.some((item) => right.some((candidate) => Object.is(candidate, item) || candidate === item))
  }

  if (typeof left === 'number' && typeof right === 'number') {
    switch (op) {
      case '=':
        return left === right
      case '!=':
        return left !== right
      case '>':
        return left > right
      case '>=':
        return left >= right
      case '<':
        return left < right
      case '<=':
        return left <= right
    }
  }

  switch (op) {
    case '=':
      return left === right
    case '!=':
      return left !== right
    default:
      throw new ShowWhenEvalError(`Operator "${op}" requires numeric operands`)
  }
}

export function evaluateShowWhen(node: ShowWhenNode, ctx: ShowWhenEvalContext): boolean {
  if (node.type === 'and') {
    return evaluateShowWhen(node.left, ctx) && evaluateShowWhen(node.right, ctx)
  }
  if (node.type === 'or') {
    return evaluateShowWhen(node.left, ctx) || evaluateShowWhen(node.right, ctx)
  }

  const target = node.target
  const op = node.op
  const value = node.value
  if (target.kind === 'room.this') {
    return compare(ctx.roomAnswers?.[target.questionKey], op, value)
  }
  if (target.kind === 'property.this') {
    return compare(ctx.propertyAnswers?.[target.questionKey], op, value)
  }
  if (target.kind === 'asset.this') {
    return compare(ctx.assetAnswers?.[target.questionKey], op, value)
  }

  throw new ShowWhenEvalError(
    `Selector "${target.kind}" is parsed but not supported in MVP evaluation`,
  )
}

export function isQuestionVisible(
  showWhen: string | undefined,
  ctx: ShowWhenEvalContext,
): boolean {
  if (!showWhen) return true
  return evaluateShowWhen(parseShowWhen(showWhen), ctx)
}
