import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { numberWords, ordinalWords, spokenForm } from './speech.ts'

const say = (t) => spokenForm(t, 2026)

test('numbers are spelled out, so the voice never guesses at digits', () => {
  assert.equal(numberWords(0), 'zero')
  assert.equal(numberWords(14), 'fourteen')
  assert.equal(numberWords(99), 'ninety-nine')
  assert.equal(numberWords(125), 'one hundred twenty-five')
  assert.equal(numberWords(4700), 'four thousand seven hundred')
  assert.equal(numberWords(13000), 'thirteen thousand')
  assert.equal(numberWords(1250000), 'one million two hundred fifty thousand')
  assert.equal(numberWords(2.5), 'two point five')
  assert.equal(ordinalWords(1), 'first')
  assert.equal(ordinalWords(22), 'twenty-second')
  assert.equal(ordinalWords(30), 'thirtieth')
  assert.equal(ordinalWords(12), 'twelfth')
})

test('amounts are said in euros, rounded the way people say them', () => {
  assert.equal(say('You have 4 723,58 €.'), 'You have about four thousand seven hundred euros.')
  assert.equal(say('That is 99 € this week, about 14 € a day.'), 'That is ninety-nine euros this week, about fourteen euros a day.')
  assert.equal(say('A coffee costs 3,50 €.'), 'A coffee costs three euros fifty.')
  assert.equal(say('Saving €1,309 a year'), 'Saving about one thousand three hundred euros a year')
  assert.equal(say('Rent is 1 €'), 'Rent is one euro')
  assert.equal(say('Your balance was -200 €.'), 'Your balance was minus two hundred euros.')
  assert.equal(say('About 420 euros a month'), 'About four hundred twenty euros a month')
  assert.equal(say('2000 euros'), 'two thousand euros')
})

test('dates and years are said as a person says them', () => {
  assert.equal(say('Next salary about 2026-11-01.'), 'Next salary about November first.')
  assert.equal(say('On 30.9.2026 you paid −35,49 € at a restaurant.'), 'On September thirtieth you paid thirty-five euros at a restaurant.')
  assert.equal(say('In 2025-07 it rose'), 'In July twenty twenty-five it rose')
  assert.equal(say('from 17–30 September'), 'from September seventeenth to thirtieth')
  assert.equal(say('by November 3rd'), 'by November third')
  assert.equal(say('since 2005'), 'since two thousand five')
  assert.equal(say('after 22:00'), "after twenty-two o'clock")
})

test('sources, links, lists and signs are not read out', () => {
  assert.equal(say('Keep 300 € aside.\n\nSources:\nBank of Finland https://www.suomenpankki.fi/en/'), 'Keep three hundred euros aside.')
  assert.equal(say('Two things:\n- spend less on taxis\n- cook at home'), 'Two things: spend less on taxis. cook at home')
  assert.equal(say('You spend 3× as much (mostly bars).'), 'You spend three times as much, mostly bars.')
  assert.equal(say('A cut of 20% helps'), 'A cut of twenty percent helps')
  assert.equal(say('between 100-200 € a month'), 'between one hundred to two hundred euros a month')
  assert.equal(say('12.40 €/m²'), 'twelve point four euros per square metre')
})
