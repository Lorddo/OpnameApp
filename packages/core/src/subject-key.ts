/** Stable map key for answers of one subject (`property:uuid`, `room:uuid`). */
export function subjectAnswerKey(subjectType: string, subjectId: string): string {
  return `${subjectType}:${subjectId}`
}

/** Stable observation id map key so photos stay linked across saves. */
export function observationMapKey(
  subjectType: string,
  subjectId: string,
  attributeKey: string,
): string {
  return `${subjectType}:${subjectId}|${attributeKey}`
}

export function parseSubjectAnswerKey(
  key: string,
): { subjectType: string; subjectId: string } | null {
  const sep = key.indexOf(':')
  if (sep <= 0) return null
  return { subjectType: key.slice(0, sep), subjectId: key.slice(sep + 1) }
}
