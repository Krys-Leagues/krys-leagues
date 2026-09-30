import type { MajorRoomRosterMember } from "./majors.ts"

export const MAJOR_ROOM_SCORECARD_BUCKET = "shared-scorecard-evidence"
export const MAJOR_ROOM_SCORECARD_MAX_BYTES = 10 * 1024 * 1024

export const MAJOR_ROOM_SCORECARD_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export type MajorRoomScorecardContext = {
  group_id: string
  major_event_id: string
  play_day_id: string
  group_label: string
  instructions: string | null
  player_id: string
  day_number: number
  day_label: string
  roster: MajorRoomRosterMember[]
}

export type MajorRoomScorecardProof = {
  id: string
  schedule_group_id: string
  play_day_id: string
  revision: number
  uploaded_by_player_id: string
  uploaded_at: string
  image_url: string
}

export type MajorRoomScorecardPayload = {
  context: MajorRoomScorecardContext
  proof: MajorRoomScorecardProof | null
}

export function validMajorRoomScorecardFile(file: Pick<File, "size" | "type">) {
  return file.size > 0
    && file.size <= MAJOR_ROOM_SCORECARD_MAX_BYTES
    && Boolean(MAJOR_ROOM_SCORECARD_EXTENSIONS[file.type])
}

export function isCompleteMastersRoomRoster(roster: readonly MajorRoomRosterMember[]) {
  return roster.length >= 2 && roster.length <= 4
}

export function roomScorecardImageUrl(playDayId: string, proofId: string) {
  const query = new URLSearchParams({ playDayId, proofId, image: "1" })
  return `/api/majors/room-scorecard?${query.toString()}`
}

export function adminRoomScorecardImageUrl(proofId: string) {
  return `/api/admin/majors/room-scorecards?${new URLSearchParams({ proofId }).toString()}`
}
