/** Dutch postcode stored as `1234 AA` (4 digits, space, 2 letters). */

const COMPLETE_NL_POSTCODE = /^\d{4} [A-Z]{2}$/

/**
 * Pull digits and letters out of any typing and format as `1234 AA`.
 * Incomplete input stays compact until both parts are present (`1234`, `1234 A`).
 */
export function formatNlPostcode(input: string): string {
  const compact = input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const match = compact.match(/^(\d{0,4})([A-Z]{0,2})/)
  if (!match) return ''
  const digits = match[1] ?? ''
  const letters = match[2] ?? ''
  if (!letters) return digits
  return digits ? `${digits} ${letters}` : letters
}

export function isCompleteNlPostcode(value: string): boolean {
  return COMPLETE_NL_POSTCODE.test(value)
}
