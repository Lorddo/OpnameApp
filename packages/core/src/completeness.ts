import type { InspectionTemplate, QuestionBinding, RoomType } from './template-schema.js'
import { attributeQuestionKey } from './attribute-key.js'
import { isQuestionVisible, type RoomAnswers, type ShowWhenEvalContext } from './show-when.js'

export interface VisibleQuestion extends QuestionBinding {
  attributeLabel: string
  answerType: string
  helpText?: string
  options?: Array<{ value: string; label: string }>
}

export interface RoomCompleteness {
  roomTypeId: string
  visibleCount: number
  answeredCount: number
  missingAttributeKeys: string[]
  missingPhotoAttributeKeys: string[]
  isComplete: boolean
}

export type PropertyCompleteness = Omit<RoomCompleteness, 'roomTypeId'>

function resolveHelpText(
  binding: QuestionBinding,
  template: InspectionTemplate,
): string | undefined {
  return binding.helpTextOverride ?? template.attributes[binding.attributeKey]?.helpText
}

function evalContext(
  roomAnswers: RoomAnswers,
  propertyAnswers: RoomAnswers = {},
): ShowWhenEvalContext {
  return { roomAnswers, propertyAnswers }
}

function listVisibleBindings(
  template: InspectionTemplate,
  questions: QuestionBinding[],
  ctx: ShowWhenEvalContext,
): VisibleQuestion[] {
  const visible: VisibleQuestion[] = []
  for (const question of questions) {
    if (!isQuestionVisible(question.showWhen, ctx)) continue
    const attr = template.attributes[question.attributeKey]
    if (!attr) continue
    visible.push({
      ...question,
      attributeLabel: attr.label,
      answerType: attr.answerType,
      helpText: resolveHelpText(question, template),
      options: attr.options,
    })
  }
  return visible.sort((a, b) => a.sortOrder - b.sortOrder)
}

export function listVisibleQuestions(
  template: InspectionTemplate,
  roomTypeId: string,
  answers: RoomAnswers,
  propertyAnswers: RoomAnswers = {},
): VisibleQuestion[] {
  const roomType = template.roomTypes.find((rt) => rt.id === roomTypeId)
  if (!roomType) {
    throw new Error(`Unknown roomType "${roomTypeId}"`)
  }
  return listVisibleBindings(template, roomType.questions, evalContext(answers, propertyAnswers))
}

export function listVisiblePropertyQuestions(
  template: InspectionTemplate,
  propertyAnswers: RoomAnswers = {},
  roomAnswers: RoomAnswers = {},
): VisibleQuestion[] {
  return listVisibleBindings(
    template,
    template.propertyQuestions ?? [],
    evalContext(roomAnswers, propertyAnswers),
  )
}

/** Exclusive "none of these" option used by WWS multiChoice checklists. */
export const NONE_OPTION = 'geen'

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function hasNoneOfTheseOption(
  options?: Array<{ value: string; label?: string }> | null,
): boolean {
  return Boolean(options?.some((opt) => opt.value === NONE_OPTION))
}

/** Empty checklists with a `geen` option default to "none of these". */
export function withNoneOfTheseDefault(
  value: unknown,
  options?: Array<{ value: string; label?: string }> | null,
): unknown {
  if (!hasNoneOfTheseOption(options)) return value
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
    return [NONE_OPTION]
  }
  return value
}

export function applyNoneOfTheseDefaults(
  questions: Array<{
    attributeKey: string
    answerType: string
    options?: Array<{ value: string; label?: string }>
  }>,
  answers: RoomAnswers,
): RoomAnswers {
  let changed = false
  const next: RoomAnswers = { ...answers }
  for (const question of questions) {
    if (question.answerType !== 'multiChoice' || !hasNoneOfTheseOption(question.options)) continue
    const questionKey = attributeQuestionKey(question.attributeKey)
    const effective = withNoneOfTheseDefault(next[questionKey], question.options)
    if (effective !== next[questionKey]) {
      next[questionKey] = effective
      changed = true
    }
  }
  return changed ? next : answers
}

/** `geen` means none of the list items apply — no evidence photo needed. */
function skipsRequiredPhoto(value: unknown): boolean {
  if (value === NONE_OPTION) return true
  return Array.isArray(value) && value.length === 1 && value[0] === NONE_OPTION
}

export function isPhotoRequired(
  question: Pick<QuestionBinding, 'photoRequired' | 'photoRequiredWhen'>,
  value: unknown,
): boolean {
  if (!question.photoRequired) return false
  if (!isAnswered(value)) return false
  if ((question.photoRequiredWhen ?? 'present') === 'always') return true
  if (value === false) return false
  return !skipsRequiredPhoto(value)
}

export function evaluateQuestionCompleteness(
  visible: VisibleQuestion[],
  answers: RoomAnswers,
  photosByAttributeKey: Record<string, number> = {},
): PropertyCompleteness {
  const missingAttributeKeys: string[] = []
  const missingPhotoAttributeKeys: string[] = []
  let answeredCount = 0

  for (const question of visible) {
    const questionKey = attributeQuestionKey(question.attributeKey)
    const value = withNoneOfTheseDefault(answers[questionKey], question.options)
    if (!isAnswered(value)) {
      missingAttributeKeys.push(question.attributeKey)
    } else {
      answeredCount += 1
    }
    if (
      isPhotoRequired(question, value) &&
      (photosByAttributeKey[question.attributeKey] ?? 0) < 1
    ) {
      missingPhotoAttributeKeys.push(question.attributeKey)
    }
  }

  return {
    visibleCount: visible.length,
    answeredCount,
    missingAttributeKeys,
    missingPhotoAttributeKeys,
    isComplete: missingAttributeKeys.length === 0 && missingPhotoAttributeKeys.length === 0,
  }
}

export function evaluateRoomCompleteness(
  template: InspectionTemplate,
  roomTypeId: string,
  answers: RoomAnswers,
  photosByAttributeKey: Record<string, number> = {},
  propertyAnswers: RoomAnswers = {},
): RoomCompleteness {
  const roomType = template.roomTypes.find((rt) => rt.id === roomTypeId)
  if (!roomType) {
    throw new Error(`Unknown roomType "${roomTypeId}"`)
  }

  if (roomType.questions.length === 0) {
    return {
      roomTypeId,
      visibleCount: 0,
      answeredCount: 0,
      missingAttributeKeys: [],
      missingPhotoAttributeKeys: [],
      isComplete: true,
    }
  }

  const visible = listVisibleQuestions(template, roomTypeId, answers, propertyAnswers)
  return { roomTypeId, ...evaluateQuestionCompleteness(visible, answers, photosByAttributeKey) }
}

export function evaluatePropertyCompleteness(
  template: InspectionTemplate,
  propertyAnswers: RoomAnswers = {},
  propertyPhotos: Record<string, number> = {},
): PropertyCompleteness {
  if (!template.propertyQuestions?.length) {
    return {
      visibleCount: 0,
      answeredCount: 0,
      missingAttributeKeys: [],
      missingPhotoAttributeKeys: [],
      isComplete: true,
    }
  }
  const visible = listVisiblePropertyQuestions(template, propertyAnswers)
  return evaluateQuestionCompleteness(visible, propertyAnswers, propertyPhotos)
}

export interface RoomCompletenessRow extends RoomCompleteness {
  roomId: string
}

export interface TemplateCompleteness {
  templateKey: string
  templateVersion: string
  property: PropertyCompleteness
  rooms: RoomCompletenessRow[]
  missingAnswerCount: number
  missingPhotoCount: number
  isComplete: boolean
}

export type TemplateCompletenessOptions = {
  propertyAnswers?: RoomAnswers
  propertyPhotos?: Record<string, number>
}

/** Completeness for one pinned template over property questions plus rooms on the property. */
export function evaluateTemplateCompleteness(
  template: InspectionTemplate,
  rooms: Array<{ id: string; roomType: string }>,
  answersByRoomId: Record<string, RoomAnswers>,
  photosByRoomId: Record<string, Record<string, number>> = {},
  options: TemplateCompletenessOptions = {},
): TemplateCompleteness {
  const propertyAnswers = options.propertyAnswers ?? {}
  const property = evaluatePropertyCompleteness(
    template,
    propertyAnswers,
    options.propertyPhotos ?? {},
  )
  const knownTypes = new Set(template.roomTypes.map((rt) => rt.id))
  const roomRows: RoomCompletenessRow[] = []

  for (const room of rooms) {
    if (!knownTypes.has(room.roomType)) continue
    const result = evaluateRoomCompleteness(
      template,
      room.roomType,
      answersByRoomId[room.id] ?? {},
      photosByRoomId[room.id] ?? {},
      propertyAnswers,
    )
    roomRows.push({ ...result, roomId: room.id })
  }

  const missingAnswerCount =
    property.missingAttributeKeys.length +
    roomRows.reduce((n, row) => n + row.missingAttributeKeys.length, 0)
  const missingPhotoCount =
    property.missingPhotoAttributeKeys.length +
    roomRows.reduce((n, row) => n + row.missingPhotoAttributeKeys.length, 0)

  return {
    templateKey: template.id,
    templateVersion: template.version,
    property,
    rooms: roomRows,
    missingAnswerCount,
    missingPhotoCount,
    isComplete: missingAnswerCount === 0 && missingPhotoCount === 0,
  }
}

/**
 * Clear answers that are no longer visible under the current showWhen rules.
 * Returns a new answers object (does not mutate input).
 */
export function clearHiddenQuestionAnswers(
  questions: Array<Pick<QuestionBinding, 'attributeKey' | 'showWhen'>>,
  answers: RoomAnswers,
  ctx: ShowWhenEvalContext,
): RoomAnswers {
  const next: RoomAnswers = { ...answers }
  for (const question of questions) {
    const questionKey = attributeQuestionKey(question.attributeKey)
    if (!isQuestionVisible(question.showWhen, ctx)) {
      delete next[questionKey]
    }
  }
  return next
}

export function clearHiddenAnswers(
  roomType: RoomType,
  answers: RoomAnswers,
  propertyAnswers: RoomAnswers = {},
): RoomAnswers {
  return clearHiddenQuestionAnswers(roomType.questions, answers, {
    roomAnswers: answers,
    propertyAnswers,
  })
}
