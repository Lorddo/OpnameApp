import type { InspectionTemplate, QuestionBinding } from './template-schema.js'
import {
  evaluatePropertyCompleteness,
  evaluateRoomCompleteness,
  listVisiblePropertyQuestions,
  listVisibleQuestions,
  type PropertyCompleteness,
  type RoomCompleteness,
} from './completeness.js'
import { isQuestionVisible, type RoomAnswers } from './show-when.js'

export interface MergeConflict {
  kind: 'sortOrder' | 'helpTextOverride'
  roomTypeId: string
  attributeKey: string
  values: Array<{ templateKey: string; value: unknown }>
}

export interface MergedQuestion extends QuestionBinding {
  sourceTemplateKeys: string[]
}

export interface MergedRoomType {
  id: string
  label: string
  allowMultiplePerFloor: boolean
  questions: MergedQuestion[]
  labelSources: Array<{ templateKey: string; label: string }>
}

export interface MergedInspectionView {
  roomTypes: MergedRoomType[]
  propertyQuestions: MergedQuestion[]
  attributes: InspectionTemplate['attributes']
  conflicts: MergeConflict[]
}

function mergeQuestionIntoList(
  questions: MergedQuestion[],
  question: QuestionBinding,
  templateId: string,
  roomTypeId: string,
  conflicts: MergeConflict[],
) {
  const found = questions.find((q) => q.attributeKey === question.attributeKey)
  if (!found) {
    questions.push({
      ...question,
      sourceTemplateKeys: [templateId],
    })
    return
  }

  found.sourceTemplateKeys.push(templateId)
  found.photoRequired = found.photoRequired || question.photoRequired
  if (found.photoRequiredWhen === 'always' || question.photoRequiredWhen === 'always') {
    found.photoRequiredWhen = 'always'
  }

  if (question.showWhen) {
    if (!found.showWhen) {
      found.showWhen = question.showWhen
    } else if (found.showWhen !== question.showWhen) {
      found.showWhen = `(${found.showWhen}) OR (${question.showWhen})`
    }
  }

  if (found.sortOrder !== question.sortOrder) {
    conflicts.push({
      kind: 'sortOrder',
      roomTypeId,
      attributeKey: question.attributeKey,
      values: [
        { templateKey: found.sourceTemplateKeys[0]!, value: found.sortOrder },
        { templateKey: templateId, value: question.sortOrder },
      ],
    })
    found.sortOrder = Math.min(found.sortOrder, question.sortOrder)
  }

  if (
    question.helpTextOverride !== undefined &&
    found.helpTextOverride !== undefined &&
    question.helpTextOverride !== found.helpTextOverride
  ) {
    conflicts.push({
      kind: 'helpTextOverride',
      roomTypeId,
      attributeKey: question.attributeKey,
      values: [
        { templateKey: found.sourceTemplateKeys[0]!, value: found.helpTextOverride },
        { templateKey: templateId, value: question.helpTextOverride },
      ],
    })
  } else if (question.helpTextOverride !== undefined && found.helpTextOverride === undefined) {
    found.helpTextOverride = question.helpTextOverride
  }
}

export function mergeTemplates(templates: InspectionTemplate[]): MergedInspectionView {
  if (templates.length === 0) {
    throw new Error('mergeTemplates requires at least one template')
  }

  const attributes: InspectionTemplate['attributes'] = {}
  const roomTypeMap = new Map<string, MergedRoomType>()
  const propertyQuestions: MergedQuestion[] = []
  const conflicts: MergeConflict[] = []

  for (const template of templates) {
    for (const [key, attr] of Object.entries(template.attributes)) {
      attributes[key] ??= attr
    }

    for (const question of template.propertyQuestions ?? []) {
      mergeQuestionIntoList(propertyQuestions, question, template.id, 'property', conflicts)
    }

    for (const roomType of template.roomTypes) {
      const existing = roomTypeMap.get(roomType.id)
      if (!existing) {
        roomTypeMap.set(roomType.id, {
          id: roomType.id,
          label: roomType.label,
          allowMultiplePerFloor: roomType.allowMultiplePerFloor,
          questions: roomType.questions.map((q) => ({
            ...q,
            sourceTemplateKeys: [template.id],
          })),
          labelSources: [{ templateKey: template.id, label: roomType.label }],
        })
        continue
      }

      existing.allowMultiplePerFloor =
        existing.allowMultiplePerFloor || roomType.allowMultiplePerFloor
      existing.labelSources.push({ templateKey: template.id, label: roomType.label })

      for (const question of roomType.questions) {
        mergeQuestionIntoList(existing.questions, question, template.id, roomType.id, conflicts)
      }
    }
  }

  const roomTypes = [...roomTypeMap.values()].map((rt) => ({
    ...rt,
    questions: [...rt.questions].sort((a, b) => a.sortOrder - b.sortOrder),
  }))

  return {
    roomTypes,
    propertyQuestions: [...propertyQuestions].sort((a, b) => a.sortOrder - b.sortOrder),
    attributes,
    conflicts,
  }
}

export function isMergedQuestionVisible(
  question: Pick<MergedQuestion, 'showWhen' | 'sourceTemplateKeys'>,
  answers: RoomAnswers,
  propertyAnswers: RoomAnswers = {},
): boolean {
  return isQuestionVisible(question.showWhen, { roomAnswers: answers, propertyAnswers })
}

export function evaluateCompletenessPerTemplate(
  templates: InspectionTemplate[],
  roomTypeId: string,
  answers: RoomAnswers,
  photosByAttributeKey: Record<string, number> = {},
): Record<string, RoomCompleteness> {
  const result: Record<string, RoomCompleteness> = {}
  for (const template of templates) {
    if (!template.roomTypes.some((rt) => rt.id === roomTypeId)) {
      result[template.id] = {
        roomTypeId,
        visibleCount: 0,
        answeredCount: 0,
        missingAttributeKeys: [],
        missingPhotoAttributeKeys: [],
        isComplete: true,
      }
      continue
    }
    result[template.id] = evaluateRoomCompleteness(
      template,
      roomTypeId,
      answers,
      photosByAttributeKey,
    )
  }
  return result
}

function asSyntheticTemplate(
  merged: MergedInspectionView,
  roomTypeId?: string,
): InspectionTemplate {
  const roomType = roomTypeId
    ? merged.roomTypes.find((rt) => rt.id === roomTypeId)
    : merged.roomTypes[0]
  if (roomTypeId && !roomType) {
    throw new Error(`Unknown merged roomType "${roomTypeId}"`)
  }

  return {
    id: 'merged',
    version: '0.0.0',
    label: 'merged',
    locale: 'nl-NL',
    attributes: merged.attributes,
    roomTypes: roomType
      ? [
          {
            id: roomType.id,
            label: roomType.label,
            allowMultiplePerFloor: roomType.allowMultiplePerFloor,
            questions: roomType.questions,
          },
        ]
      : [
          {
            id: '_placeholder',
            label: 'placeholder',
            allowMultiplePerFloor: false,
            questions: [],
          },
        ],
    propertyQuestions: merged.propertyQuestions,
  }
}

export function exclusiveAttributeKeysForTemplate(
  merged: Pick<MergedInspectionView, 'roomTypes' | 'propertyQuestions'>,
  templateKey: string,
): string[] {
  const keys = new Set<string>()
  for (const q of merged.propertyQuestions) {
    if (q.sourceTemplateKeys.length === 1 && q.sourceTemplateKeys[0] === templateKey) {
      keys.add(q.attributeKey)
    }
  }
  for (const rt of merged.roomTypes) {
    for (const q of rt.questions) {
      if (q.sourceTemplateKeys.length === 1 && q.sourceTemplateKeys[0] === templateKey) {
        keys.add(q.attributeKey)
      }
    }
  }
  return [...keys]
}

export function exclusiveRoomTypeIdsForTemplate(
  merged: Pick<MergedInspectionView, 'roomTypes'>,
  templateKey: string,
): string[] {
  return merged.roomTypes
    .filter((rt) => rt.labelSources.length === 1 && rt.labelSources[0]?.templateKey === templateKey)
    .map((rt) => rt.id)
}

export function listMergedVisibleQuestions(
  merged: MergedInspectionView,
  roomTypeId: string,
  answers: RoomAnswers,
  propertyAnswers: RoomAnswers = {},
) {
  return listVisibleQuestions(
    asSyntheticTemplate(merged, roomTypeId),
    roomTypeId,
    answers,
    propertyAnswers,
  )
}

export function listMergedVisiblePropertyQuestions(
  merged: MergedInspectionView,
  propertyAnswers: RoomAnswers = {},
) {
  return listVisiblePropertyQuestions(asSyntheticTemplate(merged), propertyAnswers)
}

export function evaluateMergedRoomCompleteness(
  merged: MergedInspectionView,
  roomTypeId: string,
  answers: RoomAnswers,
  photosByAttributeKey: Record<string, number> = {},
  propertyAnswers: RoomAnswers = {},
): RoomCompleteness {
  return evaluateRoomCompleteness(
    asSyntheticTemplate(merged, roomTypeId),
    roomTypeId,
    answers,
    photosByAttributeKey,
    propertyAnswers,
  )
}

export function evaluateMergedPropertyCompleteness(
  merged: MergedInspectionView,
  propertyAnswers: RoomAnswers = {},
  propertyPhotos: Record<string, number> = {},
): PropertyCompleteness {
  return evaluatePropertyCompleteness(
    asSyntheticTemplate(merged),
    propertyAnswers,
    propertyPhotos,
  )
}
