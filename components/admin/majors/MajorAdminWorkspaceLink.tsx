"use client"

import Link from "next/link"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { majorAdminRouteContext, majorAdminWorkspaceHref } from "@/lib/majorAdminSelection"

export function MajorAdminWorkspaceLink({ children = "← Major workspace", className, style }: {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const [href, setHref] = useState("/admin/majors")

  useEffect(() => {
    const { eventId } = majorAdminRouteContext(window.location.search)
    // Hydrate the stable event-aware return target from the current deep link.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (eventId) setHref(majorAdminWorkspaceHref(eventId))
  }, [])

  return <Link href={href} className={className} style={style}>{children}</Link>
}
