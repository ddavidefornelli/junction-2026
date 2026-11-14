import { TRIM, type BasketId, type Baskets } from './baskets'

const wholeEur = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur = (n: number) => wholeEur.format(Math.round(n))

// Names and examples in plain words: the card has to make sense at a glance.
export const BASKET_NAMES: Record<BasketId, { name: string; examples: string; color: string }> = {
  fixed: { name: 'Must pay every month', examples: 'Rent, bills, food', color: 'bg-ink' },
  irregular: { name: 'Must pay sometimes', examples: 'Doctor, fixing things at home', color: 'bg-amber-500' },
  everyday: { name: 'Fun extras', examples: 'Eating out, fun, shopping', color: 'bg-emerald-600' },
}

export function BasketsCard({ data }: { data: Baskets }) {
  const order: BasketId[] = ['fixed', 'irregular', 'everyday']
  const { irregular, everyday } = data.baskets

  return (
    <section aria-labelledby="baskets-title" className="rounded-lg bg-white">
      <div className="p-5">
        <h2 id="baskets-title" className="font-medium">Where your money goes</h2>
        <p className="mt-1 text-sm text-muted">Each month you spend about {eur(data.spending)}.</p>

        <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-line" aria-hidden="true">
          {order.map((id) => (
            <div key={id} className={BASKET_NAMES[id].color} style={{ width: `${data.baskets[id].share * 100}%` }} />
          ))}
        </div>

        <ul className="mt-4 space-y-3">
          {order.map((id) => (
            <li key={id} className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`size-3 shrink-0 rounded-full ${BASKET_NAMES[id].color}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{BASKET_NAMES[id].name}</p>
                  <p className="text-xs text-muted">{BASKET_NAMES[id].examples}</p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-medium">{eur(data.baskets[id].monthly)}</p>
            </li>
          ))}
        </ul>

        {(irregular.monthly > 0 || everyday.monthly > 0) && (
          <ul className="mt-4 space-y-1.5 rounded-md bg-paper p-3 text-sm">
            {irregular.monthly > 0 && <li>💡 Put {eur(irregular.monthly)} away each month. Then surprise costs won’t hurt.</li>}
            {everyday.monthly > 0 && <li>💡 Spend a bit less on fun extras and you keep {eur(everyday.monthly * TRIM)} more each month.</li>}
          </ul>
        )}
      </div>
    </section>
  )
}
