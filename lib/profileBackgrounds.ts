import { supabase } from "@/lib/supabase"

export const PROFILE_BACKGROUND_BUCKET = "player-profile-backgrounds"
export const PROFILE_BACKGROUND_MAX_BYTES = 10 * 1024 * 1024

export type ApprovedProfileBackground = {
  id: string
  display_name: string
  storage_path: string
}

export async function validateProfileBackgroundFile(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return "Choose a PNG, JPEG, or WEBP image."
  if (file.size <= 0 || file.size > PROFILE_BACKGROUND_MAX_BYTES) return "Profile backgrounds must be no larger than 10 MB."
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP"
  return (file.type === "image/png" && !png) || (file.type === "image/jpeg" && !jpeg) || (file.type === "image/webp" && !webp)
    ? "The selected file contents do not match its image type."
    : null
}

export function profileBackgroundObjectPath(file: File) {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
  return `approved/background-${crypto.randomUUID()}.${extension}`
}

export function profileBackgroundPublicUrl(path: string | null | undefined) {
  return path ? supabase.storage.from(PROFILE_BACKGROUND_BUCKET).getPublicUrl(path).data.publicUrl : null
}

export async function loadApprovedProfileBackgrounds() {
  const { data, error } = await supabase.rpc("get_approved_player_profile_backgrounds")
  if (error) throw new Error(error.message)
  return (data || []) as ApprovedProfileBackground[]
}
