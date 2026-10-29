import Image from "next/image"
import Link from "next/link"

export default function MgaHomepageBanner() {
  return (
    <Link
      href="/majors/major-2"
      className="artwork-navigation__mga-link"
      aria-label="The MGA Open — view registration"
    >
      <Image
        className="artwork-navigation__mga-artwork"
        src="/approved-pages/the mga open registration nov 1st.png"
        alt="Gardens of Babylon artwork for The MGA Open"
        width={2172}
        height={724}
        priority
        draggable={false}
      />
    </Link>
  )
}
