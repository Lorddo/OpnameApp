import type { InspectionTemplate, QuestionBinding, RoomType } from './template-schema.js'
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

function isAnswered(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
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
    const questionKey = question.attributeKey.split('.')[1] ?? question.attributeKey
    const value = answers[questionKey]
    if (!isAnswered(value)) {
      missingAttributeKeys.push(question.attributeKey)
    } else {
      answeredCount += 1
    }
    if (question.photoRequired && (photosByAttributeKey[question.attributeKey] ?? 0) < 1) {
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

/**
 * Clear answers that are no longer visible under the current showWhen rules.
 * Returns a new answers object (does not mutate input).
 */
export function clearHiddenAnswers(
  roomType: RoomType,
  answers: RoomAnswers,
): RoomAnswers {
  const next: RoomAnswers = { ...answers }
  for (const question of roomType.questions) {
    const questionKey = question.attributeKey.split('.')[1] ?? question.attributeKey
    if (!isQuestionVisible(question.showWhen, { roomAnswers: answers })) {
      delete next[questionKey]
    }
  }
  return next
}
