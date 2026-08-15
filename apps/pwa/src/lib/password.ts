export const MIN_PASSWORD_LENGTH = 8

export type PasswordValidationError = 'tooShort' | 'mismatch'

/** Shared min-length + confirm check for set/change password forms. */
export function validateNewPassword(
  password: string,
  confirm: string,
): PasswordValidationError | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'tooShort'
  if (password !== confirm) return 'mismatch'
  return null
}
