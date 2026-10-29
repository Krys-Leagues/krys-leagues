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
        src="/approved-pages/the mga open.jpg"
        alt="Gardens of Babylon artwork for The MGA Open"
        width={2048}
        height={682}
        priority
        draggable={false}
      />
    </Link>
  )
}
