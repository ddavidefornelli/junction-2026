import { useState } from 'react'
import { householdFacts, householdSnapshot } from './finlandHouseholds'

export function HouseholdContext() {
  const [showMethod, setShowMethod] = useState(false)
  const { financialAssets: assets, debt } = householdSnapshot
  const facts = householdFacts()

  return (
    <section aria-labelledby="household-context-title" className="rounded-3xl border border-emerald-100 bg-white p-5 text-emerald-950 sm:p-6">
      <h2 id="household-context-title" className="text-xl font-bold">How Finnish households are doing</h2>
      <p className="mt-1 text-sm text-emerald-800">A national picture, not a match with customers of your age or area.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-3xl font-bold">{facts.cashSharePercent.toFixed(1)}%</p>
          <h3 className="mt-2 text-sm font-semibold">Cash &amp; deposits</h3>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">Share of all household financial assets · end of {assets.year}</p>
        </article>
        <article className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-3xl font-bold">{facts.fundSharePercent.toFixed(1)}%</p>
          <h3 className="mt-2 text-sm font-semibold">Mutual funds</h3>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">Share of all household financial assets · end of {assets.year}</p>
        </article>
        <article className="rounded-2xl bg-emerald-50 p-4">
          <p className="text-3xl font-bold">{debt.ratioPercent.toFixed(1)}%</p>
          <h3 className="mt-2 text-sm font-semibold">Household debt ratio</h3>
          <p className="mt-1 text-xs leading-relaxed text-emerald-800">Total loans / annual disposable income · {debt.quarter}</p>
        </article>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-emerald-900">
        Across Finland, cash and deposits were {facts.cashToFundRatio.toFixed(1)}× mutual fund holdings in {assets.year}. The national debt ratio fell {Math.abs(facts.debtRatioChangePoints).toFixed(1)} percentage points from {debt.previousQuarter} to {debt.quarter}.
      </p>
      <p className="mt-2 text-xs text-emerald-800">These are totals for all households, not typical individuals, matched peers, or advice about your finances.</p>
      <a className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline underline-offset-2" href="https://pxdata.stat.fi/PXWeb/pxweb/en/StatFin/StatFin__rtp/?tablelist=true" target="_blank" rel="noopener noreferrer">Statistics Finland · financial accounts (2025 / 2026Q2 snapshot) ↗</a>
      <button type="button" onClick={() => setShowMethod((current) => !current)} aria-expanded={showMethod} aria-controls={showMethod ? 'household-sources' : undefined}
        className="mt-4 rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        {showMethod ? 'Hide details' : 'See details'} <span aria-hidden="true">{showMethod ? '↑' : '↓'}</span>
      </button>
      {showMethod && (
        <div id="household-sources" className="mt-4 space-y-2 border-t border-emerald-100 pt-4 text-sm leading-relaxed text-emerald-900">
          <p>Source: Statistics Finland, financial accounts. In table 11qp, the shares are year-end stocks of household assets (sector S14, instruments F2 and F52 divided by F0). In table 129g, the ratio is household loans divided by disposable income over the preceding four quarters (sector S14, indicator F4_B6N). It is not the percentage of people who borrow or invest.</p>
          <p>Official tables:{' '}
            <a className="font-semibold underline underline-offset-2" href={assets.source} target="_blank" rel="noopener noreferrer">financial assets (11qp)</a>{' · '}
            <a className="font-semibold underline underline-offset-2" href={debt.source} target="_blank" rel="noopener noreferrer">household debt ratio (129g)</a>.
          </p>
        </div>
      )}
    </section>
  )
}
