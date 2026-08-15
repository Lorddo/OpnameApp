import type { InspectionTemplate, QuestionBinding, RoomType } from './template-schema.js'
import { attributeQuestionKey } from './attribute-key.js'
import { isQuestionVisible, type RoomAnswers } from './show-when.js'

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

function resolveHelpText(
  binding: QuestionBinding,
  template: InspectionTemplate,
): string | undefined {
  return binding.helpTextOverride ?? template.attributes[binding.attributeKey]?.helpText
}

export function listVisibleQuestions(
  template: InspectionTemplate,
  roomTypeId: string,
  answers: RoomAnswers,
): VisibleQuestion[] {
  const roomType = template.roomTypes.find((rt) => rt.id === roomTypeId)
  if (!roomType) {
    throw new Error(`Unknown roomType "${roomTypeId}"`)
  }

  const visible: VisibleQuestion[] = []
  for (const question of roomType.questions) {
    if (!isQuestionVisible(question.showWhen, { roomAnswers: answers })) {
      continue
    }
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

export function evaluateRoomCompleteness(
  template: InspectionTemplate,
  roomTypeId: string,
  answers: RoomAnswers,
  photosByAttributeKey: Record<string, number> = {},
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

  const visible = listVisibleQuestions(template, roomTypeId, answers)
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
    roomTypeId,
    visibleCount: visible.length,
    answeredCount,
    missingAttributeKeys,
    missingPhotoAttributeKeys,
    isComplete: missingAttributeKeys.length === 0 && missingPhotoAttributeKeys.length === 0,
  }
}

export interface RoomCompletenessRow extends RoomCompleteness {
  roomId: string
}

export interface TemplateCompleteness {
  templateKey: string
  templateVersion: string
  rooms: RoomCompletenessRow[]
  missingAnswerCount: number
  missingPhotoCount: number
  isComplete: boolean
}

/** Completeness for one pinned template over the rooms that exist on the property. */
export function evaluateTemplateCompleteness(
  template: InspectionTemplate,
  rooms: Array<{ id: string; roomType: string }>,
  answersByRoomId: Record<string, RoomAnswers>,
  photosByRoomId: Record<string, Record<string, number>> = {},
): TemplateCompleteness {
  const knownTypes = new Set(template.roomTypes.map((rt) => rt.id))
  const roomRows: RoomCompletenessRow[] = []

  for (const room of rooms) {
    if (!knownTypes.has(room.roomType)) continue
    const result = evaluateRoomCompleteness(
      template,
      room.roomType,
      answersByRoomId[room.id] ?? {},
      photosByRoomId[room.id] ?? {},
    )
    roomRows.push({ ...result, roomId: room.id })
  }

  const missingAnswerCount = roomRows.reduce((n, row) => n + row.missingAttributeKeys.length, 0)
  const missingPhotoCount = roomRows.reduce((n, row) => n + row.missingPhotoAttributeKeys.length, 0)

  return {
    templateKey: template.id,
    templateVersion: template.version,
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
export function clearHiddenAnswers(roomType: RoomType, answers: RoomAnswers): RoomAnswers {
  const next: RoomAnswers = { ...answers }
  for (const question of roomType.questions) {
    const questionKey = attributeQuestionKey(question.attributeKey)
    if (!isQuestionVisible(question.showWhen, { roomAnswers: answers })) {
      delete next[questionKey]
    }
  }
  return next
}
