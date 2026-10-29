"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { DEFAULT_MAJOR_TIME_ZONE, detectBrowserTimeZone, isValidIanaTimeZone } from "@/lib/majorTimeZone"

export type MajorTimeZoneSource = "saved" | "browser" | "event"

export function useMajorDisplayTimeZone() {
  const [timeZone, setTimeZone] = useState(() => detectBrowserTimeZone() || DEFAULT_MAJOR_TIME_ZONE)
  const [source, setSource] = useState<MajorTimeZoneSource>(() => detectBrowserTimeZone() ? "browser" : "event")
  const [savedTimeZone, setSavedTimeZone] = useState<string | null>(null)
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (cancelled) return
      const user = userData.user
      setAuthenticated(Boolean(user))
      if (!user) {
        setLoading(false)
        return
      }
      const result = await supabase.rpc("get_my_major_timezone")
      if (cancelled) return
      if (!result.error && typeof result.data === "string" && isValidIanaTimeZone(result.data)) {
        setSavedTimeZone(result.data)
        setTimeZone(result.data)
        setSource("saved")
      } else if (result.error) {
        setMessage("Your saved timezone could not be loaded; browser timezone is being used until you confirm it.")
      }
      setLoading(false)
    })()

    return () => { cancelled = true }
  }, [])

  const saveTimeZone = useCallback(async (requested: string) => {
    const nextTimeZone = requested.trim()
    if (!isValidIanaTimeZone(nextTimeZone)) {
      setMessage("Enter a valid IANA timezone identifier, such as America/New_York or Europe/London.")
      return false
    }
    setMessage("")
    if (!authenticated) {
      setTimeZone(nextTimeZone)
      setSource("browser")
      return true
    }
    setSaving(true)
    const result = await supabase.rpc("save_my_major_timezone", { p_timezone: nextTimeZone })
    setSaving(false)
    if (result.error) {
      setMessage(result.error.message)
      return false
    }
    setSavedTimeZone(nextTimeZone)
    setTimeZone(nextTimeZone)
    setSource("saved")
    setMessage("Timezone saved for your future Major schedules.")
    return true
  }, [authenticated])

  return {
    timeZone,
    source,
    savedTimeZone,
    authenticated,
    loading,
    saving,
    message,
    needsConfirmation: !loading && !savedTimeZone,
    saveTimeZone,
  }
}
