export type DictionaryEncoding = Readonly<{
  values: readonly string[]
  indexes: readonly number[]
}>

/**
 * Encode repeated values without using the input position as the dictionary
 * index. The dictionary contains first-occurrence values, so every index is
 * guaranteed to point at the matching value.
 */
export function encodeDictionary(values: readonly string[]): DictionaryEncoding {
  const dictionary = new Map<string, number>()
  const unique: string[] = []

  for (const value of values) {
    if (!dictionary.has(value)) {
      dictionary.set(value, unique.length + 1)
      unique.push(value)
    }
  }

  return Object.freeze({
    values: Object.freeze(unique),
    indexes: Object.freeze(values.map((value) => dictionary.get(value)!)),
  })
}

/**
 * Nullable dictionary encoding reserves index 0 for null/undefined/empty
 * values. Non-empty values use the same first-occurrence contract as
 * encodeDictionary.
 */
export function encodeNullableDictionary(values: readonly (string | null | undefined)[]): DictionaryEncoding {
  const normalized = values.map((value) => value ?? "")
  const encoded = encodeDictionary(normalized.filter((value) => value !== ""))
  const indexes = normalized.map((value) => {
    if (value === "") return 0
    const index = encoded.values.indexOf(value)
    if (index < 0) throw new Error(`Nullable dictionary value was not encoded: ${value}`)
    return index + 1
  })

  return Object.freeze({
    values: encoded.values,
    indexes: Object.freeze(indexes),
  })
}

export function decodeDictionary(encoding: DictionaryEncoding): string[] {
  return encoding.indexes.map((index) => {
    if (!Number.isInteger(index) || index < 1 || index > encoding.values.length) {
      throw new Error(`Dictionary index out of range: ${index}`)
    }
    return encoding.values[index - 1]
  })
}

export function decodeNullableDictionary(encoding: DictionaryEncoding): Array<string | null> {
  return encoding.indexes.map((index) => {
    if (index === 0) return null
    if (!Number.isInteger(index) || index < 1 || index > encoding.values.length) {
      throw new Error(`Nullable dictionary index out of range: ${index}`)
    }
    return encoding.values[index - 1]
  })
}
