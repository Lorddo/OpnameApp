import { z } from 'zod'
import { formatNlPostcode, isCompleteNlPostcode } from '@opnameapp/core'

export const nlPostcodeSchema = z
  .string()
  .min(1)
  .transform(formatNlPostcode)
  .refine(isCompleteNlPostcode, { message: 'postcode must be 4 digits and 2 letters' })

export const templatePinSchema = z.object({
  templateKey: z.string().min(1),
  templateVersion: z.string().min(1),
})

export const inspectionStatusSchema = z.enum([
  'draft',
  'assigned',
  'in_progress',
  'completed',
  'synced',
])

export const INSPECTION_STATUSES = inspectionStatusSchema.options
