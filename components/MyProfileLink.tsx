"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { resolveCurrentPlayer } from "@/lib/currentPlayer"

export default function MyProfileLink({ style }: { style?: React.CSSProperties }) {
  const [href, setHref] = useState("/join")
  useEffect(() => { void resolveCurrentPlayer().then((result) => setHref(result.playerId ? `/players/${result.playerId}` : "/join")) }, [])
  return <Link href={href} style={style}>My Profile</Link>
}
