"use client"

import { calculateScorecardTotals } from "@/lib/scorecards/core"

export function EighteenHoleEditor({
  playerName,
  pars,
  values,
  disabled,
  onChange,
}: {
  playerName: string
  pars: number[]
  values: string[]
  disabled: boolean
  onChange: (holeIndex: number, value: string) => void
}) {
  const complete = values.length === 18 && values.every((value) => /^\d+$/.test(value) && Number(value) > 0)
  const totals = complete ? calculateScorecardTotals(values.map((value, index) => ({ holeNumber: index + 1, par: pars[index], strokes: Number(value) })), pars) : null
  return <section className="rounded-2xl border border-white/10 bg-slate-950/55 p-4" aria-label={`${playerName} 18-hole scorecard`}>
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><span className="text-xs font-bold tracking-[0.22em] text-cyan-300">18-HOLE ENTRY</span><h3 className="text-xl font-black">{playerName}</h3></div><div className="grid grid-cols-4 gap-3 text-right text-sm"><span>Front 9<strong className="block text-lg">{totals?.frontNineStrokes ?? "—"}</strong></span><span>Back 9<strong className="block text-lg">{totals?.backNineStrokes ?? "—"}</strong></span><span>Total<strong className="block text-lg">{totals?.totalStrokes ?? "—"}</strong></span><span>To Par<strong className="block text-lg">{totals ? `${totals.scoreToPar > 0 ? "+" : ""}${totals.scoreToPar}` : "—"}</strong></span></div></div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-1 text-center text-sm">
        <thead><tr><th className="text-left">Hole</th>{pars.map((_, index) => <th key={index}>{index + 1}</th>)}</tr><tr><th className="text-left text-slate-400">Par</th>{pars.map((par, index) => <th className="text-slate-400" key={index}>{par}</th>)}</tr></thead>
        <tbody><tr><th className="text-left">Strokes</th>{pars.map((_, index) => <td key={index}><input className="w-11 rounded-lg border border-white/15 bg-slate-900 px-1 py-2 text-center font-bold" type="number" min={1} max={99} inputMode="numeric" disabled={disabled} value={values[index] ?? ""} onChange={(event) => onChange(index, event.target.value)} aria-label={`${playerName} hole ${index + 1} strokes`} /></td>)}</tr></tbody>
      </table>
    </div>
  </section>
}
