import Image from "next/image"
import Link from "next/link"

export default function MgaHomepageBanner() {
  return (
    <section className="artwork-navigation__mga-section" aria-label="The MGA Open">
      <Link
        href="https://mga-championship-independent.vercel.app/"
        className="artwork-navigation__mga-link"
        aria-label="The MGA Open — view registration"
      >
        <Image
          className="artwork-navigation__mga-artwork"
          src="/approved-pages/mga-registration-now-open-approved.png"
          alt="The MGA Championship — registration now open"
          width={2172}
          height={724}
          priority
          draggable={false}
        />
      </Link>
    </section>
  )
}
