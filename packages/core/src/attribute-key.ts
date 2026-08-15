/** Strip scope prefix from attribute keys (`room.toegangType` → `toegangType`). */
export function attributeQuestionKey(attributeKey: string): string {
  return attributeKey.includes('.') ? attributeKey.split('.').slice(1).join('.') : attributeKey
}
