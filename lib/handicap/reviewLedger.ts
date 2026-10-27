export type ReviewSubjectKind = "PLAYER_IDENTITY" | "COURSE_ALIAS" | "DUPLICATE_CANDIDATE" | "SOURCE_RECORD"
export type ReviewDecision = "ACCEPT" | "QUARANTINE" | "REJECT_WITH_EVIDENCE" | "NEEDS_MORE_INFORMATION"

export type ReviewLedgerEntry = Readonly<{
  decisionId: string
  decisionSequence: number
  subjectKind: ReviewSubjectKind
  subjectKey: string
  decision: ReviewDecision
  evidenceRefs: readonly string[]
  rationale: string
  reviewerId: string | null
}>

export type ReviewLedger = Readonly<{ entries: readonly ReviewLedgerEntry[] }>

function required(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`)
}

export function createReviewEntry(input: ReviewLedgerEntry): ReviewLedgerEntry {
  required(input.decisionId, "decisionId")
  required(input.subjectKey, "subjectKey")
  required(input.rationale, "rationale")
  if (!Number.isInteger(input.decisionSequence) || input.decisionSequence < 1) throw new Error("decisionSequence must be a positive integer")
  return Object.freeze({ ...input, evidenceRefs: Object.freeze([...input.evidenceRefs]) })
}

export function emptyReviewLedger(): ReviewLedger {
  return { entries: [] }
}

export function appendReviewDecision(ledger: ReviewLedger, entry: ReviewLedgerEntry): ReviewLedger {
  const reviewed = createReviewEntry(entry)
  if (ledger.entries.some((item) => item.decisionId === reviewed.decisionId)) throw new Error(`review decision already exists: ${reviewed.decisionId}`)
  return { entries: [...ledger.entries, reviewed] }
}

export function decisionsFor(ledger: ReviewLedger, subjectKind: ReviewSubjectKind, subjectKey: string): readonly ReviewLedgerEntry[] {
  return ledger.entries
    .filter((entry) => entry.subjectKind === subjectKind && entry.subjectKey === subjectKey)
    .slice()
    .sort((left, right) => right.decisionSequence - left.decisionSequence || left.decisionId.localeCompare(right.decisionId))
}

export function currentDecision(ledger: ReviewLedger, subjectKind: ReviewSubjectKind, subjectKey: string): ReviewLedgerEntry | null {
  return decisionsFor(ledger, subjectKind, subjectKey)[0] ?? null
}
