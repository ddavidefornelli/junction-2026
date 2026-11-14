// What mcc_code adds to a purchase: the kind of place it was made at, which is
// finer than the category ("Transportation" covers both the commute and taxis).
// This helps label transactions and suggest cheaper ways to meet the same need.
//
// The meanings are the standard ISO 18245 ones. Tips rest on published Finnish
// prices where a comparison exists (each names its source), and carry no euro
// figure where none does.
// The dataset's own amounts are not real prices, so a tip applies a published
// percentage to what the customer spends rather than quoting ticket prices.

import type { Transaction } from './api'
import { eur } from './format'

export type Kind = {
  name: string // shown on a transaction
  many: string // used in suggestions
  tip?: Tip
}

// A cheaper way to cover the same need.
type Tip = {
  advice: string // a full sentence
  // The share of the spend the advice saves: `saves` on the `part` of it that
  // can realistically move. Null when no Finnish source gives a figure.
  saves: number | null
  part?: number // default: all of it
  source: string | null // null: common sense, not a published comparison
}

const KINDS: Record<string, Kind> = {
  '5411': { name: 'Supermarket', many: 'supermarkets' },
  '5422': {
    name: 'Butcher',
    many: 'butchers',
    tip: {
      // No Finnish butcher-versus-supermarket comparison was found, hence no figure.
      advice: 'For everyday cooking, packaged meat from a supermarket is often cheaper: compare the price per kilo.',
      saves: null,
      source: null,
    },
  },
  '5451': { name: 'Dairy shop', many: 'dairy shops' },
  '5499': {
    name: 'Convenience store',
    many: 'convenience stores',
    tip: {
      // Average basket of 24 products: K-Market 78.28 €, Prisma 65.78 € (511 stores, 10 cities).
      advice: 'The same basket costs about 16% less at a hypermarket.',
      saves: 0.16,
      source: 'ruoanhinta.fi, 8/2026',
    },
  },
  '5812': {
    name: 'Restaurant',
    many: 'restaurants',
    tip: {
      // 15 € against about 3 €: the reference food budget of one adult, 256–312 € a month, over three meals a day.
      advice:
        'A restaurant lunch costs about 15 €, a meal cooked at home about 3 €. This is what eating one of those meals in four at home would save.',
      saves: 0.8,
      part: 0.25,
      source: 'Helsingin Sanomat; Consumer Research Centre reference budgets 2025',
    },
  },
  '5813': { name: 'Bar', many: 'bars' },
  '5814': { name: 'Fast food', many: 'fast food places' },
  '4111': { name: 'Public transport', many: 'public transport' },
  '4121': {
    name: 'Taxi',
    many: 'taxis',
    tip: {
      // Against the cheapest taxi: 1 - 3.30 / 13.
      advice: 'A 10 km taxi trip costs 13–20 € booked by app and more otherwise; an HSL ticket costs 3.30 €.',
      saves: 0.75,
      source: 'Traficom 6/2024; HSL 2026',
    },
  },
  '5541': {
    name: 'Service station',
    many: 'staffed service stations',
    tip: {
      // Published as a ranking of chains, without a difference in cents.
      advice: 'Self-service stations are cheaper on average, and prices within one city differ by 5–10 cents a litre.',
      saves: null,
      source: 'Iltalehti 7/2022',
    },
  },
  '5542': { name: 'Self-service fuel', many: 'self-service fuel stations' },
  '7523': { name: 'Parking', many: 'car parks' },
  '7832': { name: 'Cinema', many: 'cinemas' },
  '7922': { name: 'Theatre and tickets', many: 'theatres and ticket sellers' },
  '7991': { name: 'Attraction', many: 'attractions' },
  '7996': { name: 'Amusement park', many: 'amusement parks' },
  '7999': { name: 'Recreation', many: 'recreation services' },
  '5912': { name: 'Pharmacy', many: 'pharmacies' },
  '8011': { name: 'Doctor', many: 'doctors' },
  '8021': { name: 'Dentist', many: 'dentists' },
  '8099': { name: 'Health service', many: 'health services' },
  '5200': { name: 'Home store', many: 'home stores' },
  '5251': { name: 'Hardware store', many: 'hardware stores' },
  '5712': { name: 'Furniture store', many: 'furniture stores' },
  '5732': { name: 'Electronics store', many: 'electronics stores' },
  '5734': { name: 'Software store', many: 'software stores' },
  '5651': { name: 'Clothing store', many: 'clothing stores' },
  '5691': { name: 'Fashion store', many: 'fashion stores' },
  '5941': { name: 'Sports store', many: 'sports stores' },
  '5942': { name: 'Bookshop', many: 'bookshops' },
  '5945': { name: 'Toy and hobby store', many: 'toy and hobby stores' },
  '5999': { name: 'Specialty shop', many: 'specialty shops' },
  '4511': { name: 'Airline', many: 'airlines' },
  '4722': { name: 'Travel agency', many: 'travel agencies' },
  '7011': { name: 'Hotel', many: 'hotels' },
  '7512': { name: 'Car rental', many: 'car rental companies' },
}

// Undefined for payments with no MCC (rent, utilities, and a few percent of purchases).
export const kindOf = (tx: Pick<Transaction, 'mcc_code'>): Kind | undefined => KINDS[tx.mcc_code ?? '']

export type Suggestion = {
  title: string
  text: string
  source: string | null
  saving: number | null // euros a month; null when no source gives a figure
}

const WINDOW_MONTHS = 3 // recent enough to describe current habits
const MIN_SAVING = 5 // euros a month; below this a suggestion is noise
const MIN_SPEND = 20 // euros a month, for a tip with no figure to be worth making

// Cheaper ways to cover what the customer already buys, biggest saving first.
// `all` is every transaction, oldest first.
export function suggestions(all: Transaction[]): Suggestion[] {
  const months = [...new Set(all.map((tx) => tx.tx_date.slice(0, 7)))].sort()
  const window = new Set(months.slice(0, -1).slice(-WINDOW_MONTHS)) // full months only
  if (window.size === 0) return []

  const spent = new Map<Kind, number>() // monthly, per kind that has a tip
  for (const tx of all) {
    const kind = kindOf(tx)
    if (!kind?.tip || tx.tx_amount_eur >= 0 || !window.has(tx.tx_date.slice(0, 7))) continue
    spent.set(kind, (spent.get(kind) ?? 0) - tx.tx_amount_eur / window.size)
  }
  return [...spent]
    .map(([kind, amount]) => {
      const { advice, saves, part = 1, source } = kind.tip!
      return {
        title: kind.many[0].toUpperCase() + kind.many.slice(1),
        text: `About ${eur(amount)} a month goes to ${kind.many}. ${advice}`,
        source,
        saving: saves === null ? null : amount * part * saves,
        amount,
      }
    })
    .filter((s) => (s.saving === null ? s.amount >= MIN_SPEND : s.saving >= MIN_SAVING))
    .sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0))
}
