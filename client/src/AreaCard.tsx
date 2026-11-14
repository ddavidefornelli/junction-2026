import { AREA_SOURCE, type AreaView } from './area'
import { gapWords } from './benchmarks'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))
const perM2 = (n: number) => `${n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/m²`
const pct = (n: number) => `${Math.round(n * 100)}%`

// What the customer's postal code says about rent and their neighbours, from
// Statistics Finland open data (see area.ts). Their own housing payment sits
// next to what renting costs there, as a reference, not a verdict.
export function AreaCard({ data }: { data: AreaView }) {
  const facts: [string, string][] = [
    [pct(data.renters), 'of homes here are rented'],
    [pct(data.livingAlone), 'of homes have one person'],
    [`${data.m2PerPerson.toLocaleString('fi-FI')} m²`, 'of home per person'],
    [eur(data.medianIncomeMonthly), `typical income a month, after tax${data.income ? ` (yours: ${eur(data.income)})` : ''}`],
  ]

  return (
    <section aria-labelledby="area-title" className="rounded-lg bg-white">
      <div className="p-5">
        <h2 id="area-title" className="font-medium">Your area</h2>
        <p className="mt-1 text-sm text-muted">
          {data.name} · {data.code} {data.city}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-paper p-3">
            <p className="text-xs text-muted">You pay for your home</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{data.housing ? eur(data.housing) : '–'}</p>
            <p className="text-xs text-muted">a month</p>
          </div>
          <div className="rounded-md bg-paper p-3">
            <p className="text-xs text-muted">Rent for one person here</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{eur(data.typicalRent)}</p>
            <p className="text-xs text-muted">a month, typical</p>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-sm">
          {data.housing && (
            <li>
              You pay <span className="font-medium">{gapWords(data.housing / data.typicalRent)}</span>
              {gapWords(data.housing / data.typicalRent) === 'about the same' ? ' as' : ' than'} a typical renter here.
            </li>
          )}
          {data.m2ForPayment && (
            <li>Your payment would rent about <span className="font-medium">{Math.round(data.m2ForPayment)} m²</span> here.</li>
          )}
          {data.housingShare !== null && (
            <li>Your home takes <span className="font-medium">{pct(data.housingShare)}</span> of the money you get each month.</li>
          )}
        </ul>

        <div className="mt-4 rounded-md border border-line p-3 text-sm">
          <p className="font-medium">Rent per m² in {data.zoneLabel}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted">One-room flat</dt>
              <dd className="tabular-nums">{perM2(data.rentOne)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Two-room flat</dt>
              <dd className="tabular-nums">{perM2(data.rentTwo)}</dd>
            </div>
          </dl>
          {data.rentTwo < data.rentOne && (
            <p className="mt-2 text-xs text-muted">💡 Each m² of a two-room flat costs {pct(1 - data.rentTwo / data.rentOne)} less than one of a one-room flat.</p>
          )}
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([value, label]) => (
            <li key={label}>
              <p className="font-medium tabular-nums">{value}</p>
              <p className="text-xs text-muted">{label}</p>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-muted">
          Rent for one person is the rent per m² of free-market flats here times the space people here have per person. If you own your home, it compares your loan payment with renting. Source: {AREA_SOURCE}.
        </p>
      </div>
    </section>
  )
}
