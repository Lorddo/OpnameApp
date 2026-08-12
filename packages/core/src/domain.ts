/** Shared domain identifiers used across PWA and API. */

export type Uuid = string

export type OrgType = 'inspection' | 'client' | 'platform'

export type OrgRole = 'inspector' | 'admin'

export type InspectionStatus =
  | 'draft'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'synced'

export type Visibility = 'private' | 'public_to_client'

export type SubjectType = 'property' | 'floor' | 'room' | 'asset' | 'observation'

export interface TemplateRef {
  templateKey: string
  templateVersion: string
}
