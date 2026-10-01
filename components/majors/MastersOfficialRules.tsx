import { MASTERS_OFFICIAL_RULES, MASTERS_RULES_SUBTITLE, MASTERS_RULES_TITLE } from "@/lib/mastersRules"

export default function MastersOfficialRules({ className }: { className?: string }) {
  return (
    <div className={className} data-masters-official-rules>
      <header>
        <p>{MASTERS_RULES_TITLE}</p>
        <h2>{MASTERS_RULES_SUBTITLE}</h2>
      </header>
      {MASTERS_OFFICIAL_RULES.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
    </div>
  )
}
