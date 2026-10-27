export type MonthlySourceMetadataAnomaly = {
  field: string
  rawValue: string
  reason: "NON_INTEGER_OPTIONAL_METADATA"
  handling: "TYPED_NULL_RAW_PRESERVED"
}

/**
 * Ancillary Monthly metadata is nullable in the historical score schema.
 * Preserve a malformed source token as provenance instead of guessing a value.
 */
export function parseOptionalMonthlyInteger(
  value: string,
  field: string,
  anomalies: MonthlySourceMetadataAnomaly[],
) {
  const rawValue = value
  const trimmed = rawValue.trim()
  if (!trimmed) return null
  if (!/^-?\d+$/.test(trimmed)) {
    anomalies.push({
      field,
      rawValue,
      reason: "NON_INTEGER_OPTIONAL_METADATA",
      handling: "TYPED_NULL_RAW_PRESERVED",
    })
    return null
  }
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) {
    anomalies.push({
      field,
      rawValue,
      reason: "NON_INTEGER_OPTIONAL_METADATA",
      handling: "TYPED_NULL_RAW_PRESERVED",
    })
    return null
  }
  return parsed
}
