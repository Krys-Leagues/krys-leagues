const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type Phase121RatingCandidate = Readonly<{
  snapshot_id: string
  course_id: string
  difficulty: "easy" | "hard"
  rating_confidence: "READY_CANDIDATE"
  course_rating: number
  slope: number
  source_scope: "KWT_ONLY"
  weekly_rows_used: 0
  publication_status: "UNPUBLISHED"
  publication_approval: "PENDING_HUMAN_RATING_REVIEW" | "PENDING_EXPLICIT_PUBLICATION_APPROVAL"
  formal_review_disposition: string
  owner_rating_approval: "APPROVED_BY_KRYS" | "PENDING"
  owner_rating_approval_basis: string
  owner_rating_approval_date: string | null
}>

export type Phase121IndexCandidate = Readonly<{
  snapshot_id: string
  calculation_run_id: string
  canonical_player_id: string
  source_round_ids: readonly string[]
  rating_snapshot_ids: readonly string[]
  all_eligible_rating_snapshot_ids: readonly string[]
  rating_version_ids: readonly string[]
  differential_model_version: "krys-handicap-candidate-a-v1"
  latest_ten_source_round_ids: readonly string[]
  best_five_source_round_ids: readonly string[]
  chronology_confidence: "OFFICIAL_KWT_SEQUENCE"
  source_scope: "KWT_ONLY"
  weekly_rows_used: 0
  owner_numeric_fairness_decision: "ACCEPTED"
  owner_acceptance_scope: "NUMERIC_FAIRNESS_ONLY"
  publication_decision: "PENDING_EXPLICIT_APPROVAL"
  publication_status: "UNPUBLISHED"
  resulting_index: number
}>

export type Phase121ReviewDisposition = Readonly<{
  snapshot_id: string
  course_id: string
  formal_review_disposition: "ACCEPT_FOR_FORMAL_REVIEW" | "HOLD_INVESTIGATE" | "HOLD_PROVISIONAL" | "HOLD_UNRATED"
  formal_approval: "PENDING" | "OWNER_APPROVED"
  owner_approval_reviewer: "Krys" | ""
  owner_approval_date: string | null
  owner_approval_basis: string
  publication_status: "UNPUBLISHED"
}>

export type Phase121PublicationPackage = Readonly<{
  productionProject: "jfbndcwdsvsjgnzwvexp"
  calculationRunId: string
  ratings: readonly Phase121RatingCandidate[]
  indexes: readonly Phase121IndexCandidate[]
  dispositions: readonly Phase121ReviewDisposition[]
  approval: Readonly<{
    decision: "NUMERIC_FAIRNESS_ACCEPTED"
    reviewers: readonly ["Krys", "Tricky"]
    scope: "numeric fairness only; not blanket rating approval, identity approval, security approval, or publication approval"
  }>
}>

function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function validatePhase121PublicationPackage(input: Phase121PublicationPackage): true {
  require(input.productionProject === "jfbndcwdsvsjgnzwvexp", "unexpected Supabase project")
  require(UUID.test(input.calculationRunId), "invalid Phase 121 calculation run id")
  require(input.ratings.length === 78, `expected 78 rating candidates, got ${input.ratings.length}`)
  require(input.indexes.length === 166, `expected 166 index candidates, got ${input.indexes.length}`)
  require(input.dispositions.length === 82, `expected 82 course dispositions, got ${input.dispositions.length}`)
  require(input.approval.decision === "NUMERIC_FAIRNESS_ACCEPTED", "owner acceptance is missing")
  require(input.approval.reviewers.join("|") === "Krys|Tricky", "owner reviewer names changed")
  require(input.approval.scope.startsWith("numeric fairness only"), "owner acceptance scope was broadened")

  const ratingIds = new Set(input.ratings.map((row) => row.snapshot_id))
  const indexIds = new Set(input.indexes.map((row) => row.snapshot_id))
  require(ratingIds.size === input.ratings.length, "duplicate rating candidate id")
  require(indexIds.size === input.indexes.length, "duplicate index candidate id")
  require(new Set(input.indexes.map((row) => row.canonical_player_id)).size === 166, "duplicate canonical player in index package")

  for (const row of input.ratings) {
    require(UUID.test(row.snapshot_id), `invalid rating snapshot id ${row.snapshot_id}`)
    require(row.difficulty === "easy" || row.difficulty === "hard", "invalid rating difficulty")
    require(Number.isFinite(row.course_rating), `invalid rating value for ${row.course_id}`)
    require(Number.isFinite(row.slope) && row.slope > 0.01, `invalid slope for ${row.course_id}`)
    require(row.source_scope === "KWT_ONLY", `non-KWT rating source for ${row.course_id}`)
    require(row.weekly_rows_used === 0, `Weekly evidence entered rating candidate ${row.course_id}`)
    require(row.publication_status === "UNPUBLISHED", "rating candidate is published")
    require(row.publication_approval === "PENDING_HUMAN_RATING_REVIEW" || row.publication_approval === "PENDING_EXPLICIT_PUBLICATION_APPROVAL", "rating candidate approval bypass")
    require(row.owner_rating_approval === "APPROVED_BY_KRYS" || row.owner_rating_approval === "PENDING", "invalid owner rating approval")
    require(row.owner_rating_approval_date === null || row.owner_rating_approval_date === "2026-10-21", "unexpected owner approval date")
    if (row.owner_rating_approval === "APPROVED_BY_KRYS") {
      require(row.formal_review_disposition === "ACCEPT_FOR_FORMAL_REVIEW", `owner-approved rating remains held for ${row.course_id}`)
      require(row.publication_approval === "PENDING_EXPLICIT_PUBLICATION_APPROVAL", `owner-approved rating bypassed publication gate for ${row.course_id}`)
    }
  }

  for (const row of input.indexes) {
    require(UUID.test(row.snapshot_id) && UUID.test(row.calculation_run_id), `invalid index UUID for ${row.canonical_player_id}`)
    require(UUID.test(row.canonical_player_id), `invalid canonical player UUID ${row.canonical_player_id}`)
    require(row.source_round_ids.length > 0, `index has no source rounds ${row.canonical_player_id}`)
    require(row.latest_ten_source_round_ids.length > 0 && row.latest_ten_source_round_ids.length <= 10, `invalid latest-ten selection ${row.canonical_player_id}`)
    require(row.best_five_source_round_ids.length === 5, `invalid best-five selection ${row.canonical_player_id}`)
    require(row.rating_snapshot_ids.length === row.rating_version_ids.length, `rating version count mismatch ${row.canonical_player_id}`)
    require(row.rating_snapshot_ids.every((id) => ratingIds.has(id)), `index references an unapproved rating ${row.canonical_player_id}`)
    require(row.all_eligible_rating_snapshot_ids.every((id) => ratingIds.has(id)), `index has an unapproved eligible rating ${row.canonical_player_id}`)
    require(row.differential_model_version === "krys-handicap-candidate-a-v1", "unexpected differential model")
    require(row.chronology_confidence === "OFFICIAL_KWT_SEQUENCE", "unsupported chronology")
    require(row.source_scope === "KWT_ONLY", "index source scope is not KWT-only")
    require(row.weekly_rows_used === 0, `Weekly evidence entered index ${row.canonical_player_id}`)
    require(row.owner_numeric_fairness_decision === "ACCEPTED", "numeric fairness acceptance missing")
    require(row.owner_acceptance_scope === "NUMERIC_FAIRNESS_ONLY", "owner acceptance scope broadened")
    require(row.publication_decision === "PENDING_EXPLICIT_APPROVAL", "index publication was implicitly approved")
    require(row.publication_status === "UNPUBLISHED", "index candidate is published")
    require(Number.isFinite(row.resulting_index), `invalid index value ${row.canonical_player_id}`)
  }

  for (const row of input.dispositions) {
    require(row.formal_approval === "PENDING" || row.formal_approval === "OWNER_APPROVED", `invalid rating approval for ${row.course_id}`)
    require(row.owner_approval_reviewer === "Krys" || row.owner_approval_reviewer === "", `invalid owner reviewer for ${row.course_id}`)
    require(row.owner_approval_date === null || row.owner_approval_date === "2026-10-21", `unexpected owner approval date for ${row.course_id}`)
    if (row.formal_approval === "OWNER_APPROVED") {
      require(row.formal_review_disposition === "ACCEPT_FOR_FORMAL_REVIEW", `owner-approved disposition is not accepted for ${row.course_id}`)
      require(row.owner_approval_reviewer === "Krys", `owner-approved rating lacks Krys reviewer for ${row.course_id}`)
    }
    require(row.publication_status === "UNPUBLISHED", `rating disposition is published for ${row.course_id}`)
  }

  return true
}
