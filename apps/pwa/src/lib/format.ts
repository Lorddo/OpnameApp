import { formatNlPostcode } from '@opnameapp/core'

export function formatAddress(
  input: {
    postcode: string
    houseNumber: string
    houseNumberAddition?: string | null
    city?: string | null
  },
  opts?: { additionSeparator?: string },
): string {
  const sep = opts?.additionSeparator ?? ' '
  const addition = input.houseNumberAddition ? `${sep}${input.houseNumberAddition}` : ''
  const city = input.city ? `, ${input.city}` : ''
  const postcode = formatNlPostcode(input.postcode) || input.postcode
  return `${postcode} ${input.houseNumber}${addition}${city}`.trim()
}

export function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-GB' : 'nl-NL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function statusLabel(t: (key: string) => string, status: string) {
  const key = `projects.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

export function roomTypeLabel(
  roomTypes: Array<{ id: string; label: string }> | undefined,
  roomTypeId: string,
) {
  return roomTypes?.find((rt) => rt.id === roomTypeId)?.label ?? roomTypeId
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
