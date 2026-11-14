import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { spokenForm } from './speech.ts'

const say = (t) => spokenForm(t, 2026)

test('amounts are said in euros, rounded the way people say them', () => {
  assert.equal(say('You have 4 723,58 €.'), 'You have about 4,700 euros.')
  assert.equal(say('That is 99 € this week, about 14 € a day.'), 'That is 99 euros this week, about 14 euros a day.')
  assert.equal(say('A coffee costs 3,50 €.'), 'A coffee costs 3 euros 50.')
  assert.equal(say('It was −35,49 €.'), 'It was minus 35 euros.')
  assert.equal(say('Saving €1,309 a year'), 'Saving about 1,300 euros a year')
  assert.equal(say('Rent is 1 €'), 'Rent is 1 euro')
  assert.equal(say('12.40 €/m²'), '12.40 euros per square metre')
})

test('dates are said as a person says them', () => {
  assert.equal(say('Next salary about 2026-11-01.'), 'Next salary about 1 November.')
  assert.equal(say('On 30.9.2026 you paid'), 'On 30 September you paid')
  assert.equal(say('In 2025-07 it rose'), 'In July 2025 it rose')
  assert.equal(say('from 17–30 September'), 'from 17 to 30 September')
})

test('sources, links, lists and signs are not read out', () => {
  assert.equal(say('Keep 300 € aside.\n\nSources:\nBank of Finland https://www.suomenpankki.fi/en/'), 'Keep 300 euros aside.')
  assert.equal(say('Two things:\n- spend less on taxis\n- cook at home'), 'Two things: spend less on taxis. cook at home')
  assert.equal(say('You spend 3× as much (mostly bars).'), 'You spend 3 times as much, mostly bars.')
  assert.equal(say('A cut of 20% helps'), 'A cut of 20 percent helps')
})

test('a range of amounts is not read as a minus', () => {
  assert.equal(say('between 100-200 € a month'), 'between 100 to 200 euros a month')
})

test('a payment is not read as minus after "paid"', () => {
  assert.equal(say('On 30.9.2026 you paid −35,49 € at a restaurant.'), 'On 30 September you paid 35 euros at a restaurant.')
  assert.equal(say('Your balance was -200 €.'), 'Your balance was minus 200 euros.')
})
