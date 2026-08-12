import { z } from 'zod'

export const AnswerScopeSchema = z.enum(['room', 'floor', 'property', 'asset'])
export type AnswerScope = z.infer<typeof AnswerScopeSchema>

export const AnswerTypeSchema = z.enum(['boolean', 'choice', 'text', 'number'])
export type AnswerType = z.infer<typeof AnswerTypeSchema>

export const ChoiceOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
})
export type ChoiceOption = z.infer<typeof ChoiceOptionSchema>

export const AttributeDefinitionSchema = z
  .object({
    answerScope: AnswerScopeSchema,
    questionKey: z.string().min(1),
    label: z.string().min(1),
    answerType: AnswerTypeSchema,
    options: z.array(ChoiceOptionSchema).optional(),
    helpText: z.string().optional(),
    /** Optional numeric constraints — reserved for later template use */
    unit: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
  })
  .superRefine((attr, ctx) => {
    if (attr.answerType === 'choice' && (!attr.options || attr.options.length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'choice attributes require non-empty options',
        path: ['options'],
      })
    }
    if (attr.answerType !== 'choice' && attr.options !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'options are only allowed for choice attributes',
        path: ['options'],
      })
    }
    if (attr.answerType !== 'number') {
      for (const key of ['unit', 'min', 'max', 'step'] as const) {
        if (attr[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `${key} is only allowed for number attributes`,
            path: [key],
          })
        }
      }
    }
  })
export type AttributeDefinition = z.infer<typeof AttributeDefinitionSchema>

export const QuestionBindingSchema = z.object({
  attributeKey: z.string().min(1),
  sortOrder: z.number().int(),
  photoRequired: z.boolean().default(false),
  showWhen: z.string().optional(),
  helpTextOverride: z.string().optional(),
})
export type QuestionBinding = z.infer<typeof QuestionBindingSchema>

export const RoomTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  allowMultiplePerFloor: z.boolean(),
  questions: z.array(QuestionBindingSchema).default([]),
})
export type RoomType = z.infer<typeof RoomTypeSchema>

export const InspectionTemplateSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    label: z.string().min(1),
    locale: z.string().min(1),
    attributes: z.record(z.string(), AttributeDefinitionSchema),
    roomTypes: z.array(RoomTypeSchema).min(1),
  })
  .superRefine((template, ctx) => {
    for (const [key, attr] of Object.entries(template.attributes)) {
      const expected = `${attr.answerScope}.${attr.questionKey}`
      if (key !== expected) {
        ctx.addIssue({
          code: 'custom',
          message: `attribute key "${key}" must equal "${expected}"`,
          path: ['attributes', key],
        })
      }
    }

    const roomTypeIds = new Set<string>()
    for (const [index, roomType] of template.roomTypes.entries()) {
      if (roomTypeIds.has(roomType.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate roomType id "${roomType.id}"`,
          path: ['roomTypes', index, 'id'],
        })
      }
      roomTypeIds.add(roomType.id)

      for (const [qIndex, question] of roomType.questions.entries()) {
        if (!(question.attributeKey in template.attributes)) {
          ctx.addIssue({
            code: 'custom',
            message: `unknown attributeKey "${question.attributeKey}"`,
            path: ['roomTypes', index, 'questions', qIndex, 'attributeKey'],
          })
        }
      }
    }
  })

export type InspectionTemplate = z.infer<typeof InspectionTemplateSchema>

export function parseInspectionTemplate(input: unknown): InspectionTemplate {
  return InspectionTemplateSchema.parse(input)
}

export function safeParseInspectionTemplate(input: unknown) {
  return InspectionTemplateSchema.safeParse(input)
}
