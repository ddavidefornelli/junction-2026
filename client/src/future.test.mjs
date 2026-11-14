import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { at, dryYear, futureContext, gap, invested, makeFuture, runsOut } from './future.ts'
import { makeBaskets } from './baskets.ts'
import { makeOffers, plan } from './challenges.ts'

const tx = (date, amount, transaction_type, category, mcc_code = null, balance = 1000) =>
  ({ bank_account_id: 'A', tx_date: date, tx_timestamp: `${date}T12:00:00`, category, tx_amount_eur: amount, balance_after_eur: balance, transaction_type, merchant_id: null, mcc_code })

// Three full months: `salary` in and `restaurants` out each month, then one day of July. Balance 1 000 €.
function history(salary = 500, restaurants = 300) {
  const all = []
  for (const m of ['04', '05', '06'])
    all.push(tx(`2026-${m}-01`, salary, 'salary', 'Salary'), tx(`2026-${m}-02`, -restaurants, 'purchase', 'Restaurants', '5812'))
  return [...all, tx('2026-07-01', salary, 'salary', 'Salary')]
}
const all = history()
const baskets = makeBaskets(all)
const future = makeFuture({ all, baskets, challenge: null })

// What `monthly` € paid in at each month's end is worth after `years` at 5% a year.
const grown = (monthly, years) => monthly * ((1.05 ** years - 1) / (1.05 ** (1 / 12) - 1))

test('with no challenge, the changed future is a fifth less on fun extras, invested', () => {
  assert.deepEqual([future.balance, future.keep, future.extra, future.today, future.why], [1000, 200, 60, '2026-07-01', 'upside'])
  assert.match(future.change, /a fifth less.*invest/)
  assert.equal(invested(future), 260)
})

test('same habits: today plus what is kept each month, with no growth', () => {
  const p = at(future, 5, false)
  assert.deepEqual([p.balance, p.growth, p.year], [13000, 0, 2031])
  assert.equal(at(future, 0, true).balance, 1000)
})

test('the changed future invests what it keeps, and the growth compounds', () => {
  const p = at(future, 5, true)
  assert.equal(p.balance, Math.round(1000 + grown(260, 5)))
  assert.equal(p.growth, Math.round(grown(260, 5) - 260 * 60))
  assert.ok(p.growth > 2000 && p.growth < 2100)
  assert.equal(gap(future, 5), p.balance - 13000)
  // Ten years of growth is far more than twice five years of it.
  assert.ok(at(future, 10, true).growth > 4 * p.growth)
})

test('a running saving challenge sets the change', () => {
  const offer = makeOffers({ baskets, tips: [], all }).find((o) => o.kind === 'save')
  const f = makeFuture({ all, baskets, challenge: plan(offer, 100, 0.5, '2026-07-01') })
  assert.ok(Math.abs(f.extra - 150) < 5) // half of 300 € a month
  assert.match(f.change, /keep up your challenge.*invest/)
})

test('a challenge with no euro goal falls back to a fifth less', () => {
  const offer = makeOffers({ baskets, tips: [], all }).find((o) => o.kind === 'nospend')
  assert.equal(makeFuture({ all, baskets, challenge: plan(offer, 30, 3 / 7, '2026-07-01') }).extra, 60)
})

const short = makeFuture({ all: history(250), baskets: makeBaskets(history(250)), challenge: null }) // 50 € short a month

test('habits that empty the account get the call too, as a warning', () => {
  assert.equal(short.why, 'danger')
  assert.ok(Math.abs(runsOut(short) - 1000 / 600) < 1e-9) // 1 000 € at 50 € a month
  assert.equal(runsOut(future), null)
  assert.equal(dryYear(short), 2028) // 20 months after July 2026
  assert.equal(invested(short), 10)
})

test('the apple goes from bruised to fresh with the months of spending covered', () => {
  assert.equal(at(short, 5, false).stage, 0) // 1 000 − 3 000: below zero
  assert.equal(at(short, 5, true).stage, 4) // 1 000 + 10 € a month invested: over six months of 240 €
  assert.equal(at(short, 1, false).stage, 2) // 400 €: over one month of 300 €
  assert.equal(at(future, 0, false).stage, 3) // 1 000 € today: three months of 300 €
  assert.equal(at(future, 5, true).stage, 4)
})

test('no call when the two futures are much alike', () => {
  // 10 € kept and 100 € of fun a month against 2 000 € of spending: ten years on, the gap is under two months of it.
  const flat = []
  for (const m of ['04', '05', '06'])
    flat.push(tx(`2026-${m}-01`, 2010, 'salary', 'Salary'), tx(`2026-${m}-02`, -1900, 'housing_payment', 'Housing'), tx(`2026-${m}-03`, -100, 'purchase', 'Restaurants', '5812'))
  flat.push(tx('2026-07-01', 2010, 'salary', 'Salary'))
  assert.equal(makeFuture({ all: flat, baskets: makeBaskets(flat), challenge: null }), null)
})

test('nothing to project without spending to change', () => {
  assert.equal(makeFuture({ all: [], baskets: null, challenge: null }), null)
  const plain = [tx('2026-04-02', -300, 'housing_payment', 'Housing'), tx('2026-05-02', -300, 'housing_payment', 'Housing')]
  assert.equal(makeFuture({ all: plain, baskets: makeBaskets(plain), challenge: null }), null)
})

test('the caller is told its own figures and the other future’s', () => {
  const other = at(future, 5, true)
  const text = futureContext(future, 5, false, 30)
  assert.match(text, /speaking from 2031/)
  assert.match(text, /You are 35 years old/)
  assert.match(text, /changed nothing/)
  assert.match(text, /in 2031: 13000 €/)
  assert.ok(text.includes(`has ${other.balance} € in 2031: ${other.balance - 13000} € more than you`))
  assert.ok(text.includes(`${other.growth} € of theirs is growth from investing`))

  const invests = futureContext(future, 5, true, null)
  assert.match(invests, /260 €, all of it invested in the market/)
  assert.ok(invests.includes(`Of that, ${other.growth} € is growth`))
  assert.match(invests, /assumed to grow 5% a year/)
  assert.match(futureContext(short, 5, false, null), /ran dry around 2028/)
})
