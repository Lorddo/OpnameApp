import type { InspectionTemplate, QuestionBinding, RoomType } from './template-schema.js'
import { evaluateRoomCompleteness, listVisibleQuestions, type RoomCompleteness } from './completeness.js'
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
  attributes: InspectionTemplate['attributes']
  conflicts: MergeConflict[]
}

export function mergeTemplates(templates: InspectionTemplate[]): MergedInspectionView {
  if (templates.length === 0) {
    throw new Error('mergeTemplates requires at least one template')
  }

  const attributes: InspectionTemplate['attributes'] = {}
  const roomTypeMap = new Map<string, MergedRoomType>()
  const conflicts: MergeConflict[] = []

  for (const template of templates) {
    for (const [key, attr] of Object.entries(template.attributes)) {
      attributes[key] ??= attr
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
      if (existing.label !== roomType.label) {
        // Keep first label; conflict tracked lightly via labelSources.
      }

      for (const question of roomType.questions) {
        const found = existing.questions.find((q) => q.attributeKey === question.attributeKey)
        if (!found) {
          existing.questions.push({
            ...question,
            sourceTemplateKeys: [template.id],
          })
          continue
        }

        found.sourceTemplateKeys.push(template.id)
        found.photoRequired = found.photoRequired || question.photoRequired

        // Visibility: keep all showWhen expressions; evaluator ORs them later.
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
            roomTypeId: roomType.id,
            attributeKey: question.attributeKey,
            values: [
              { templateKey: found.sourceTemplateKeys[0]!, value: found.sortOrder },
              { templateKey: template.id, value: question.sortOrder },
            ],
          })
          // Keep lowest sortOrder for now (stable, deterministic).
          found.sortOrder = Math.min(found.sortOrder, question.sortOrder)
        }

        if (
          question.helpTextOverride !== undefined &&
          found.helpTextOverride !== undefined &&
          question.helpTextOverride !== found.helpTextOverride
        ) {
          conflicts.push({
            kind: 'helpTextOverride',
            roomTypeId: roomType.id,
            attributeKey: question.attributeKey,
            values: [
              { templateKey: found.sourceTemplateKeys[0]!, value: found.helpTextOverride },
              { templateKey: template.id, value: question.helpTextOverride },
            ],
          })
          // Keep first helpTextOverride until product rule is decided.
        } else if (question.helpTextOverride !== undefined && found.helpTextOverride === undefined) {
          found.helpTextOverride = question.helpTextOverride
        }
      }
    }
  }

  const roomTypes = [...roomTypeMap.values()].map((rt) => ({
    ...rt,
    questions: [...rt.questions].sort((a, b) => a.sortOrder - b.sortOrder),
  }))

  return { roomTypes, attributes, conflicts }
}

export function isMergedQuestionVisible(
  question: Pick<MergedQuestion, 'showWhen' | 'sourceTemplateKeys'>,
  answers: RoomAnswers,
): boolean {
  // After merge, showWhen may already be OR-combined. Empty → visible.
  return isQuestionVisible(question.showWhen, { roomAnswers: answers })
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

export function listMergedVisibleQuestions(
  merged: MergedInspectionView,
  roomTypeId: string,
  answers: RoomAnswers,
) {
  const roomType = merged.roomTypes.find((rt) => rt.id === roomTypeId)
  if (!roomType) {
    throw new Error(`Unknown merged roomType "${roomTypeId}"`)
  }

  // Reuse single-template helper shape by adapting.
  const synthetic: InspectionTemplate = {
    id: 'merged',
    version: '0.0.0',
    label: 'merged',
    locale: 'nl-NL',
    attributes: merged.attributes,
    roomTypes: [
      {
        id: roomType.id,
        label: roomType.label,
        allowMultiplePerFloor: roomType.allowMultiplePerFloor,
        questions: roomType.questions,
      },
    ],
  }

  return listVisibleQuestions(synthetic, roomTypeId, answers)
}
