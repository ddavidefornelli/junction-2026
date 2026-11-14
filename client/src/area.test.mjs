import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { makeArea, RENTS } from './area.ts'

test('a Helsinki postal code gets its rent zone', () => {
  assert.equal(makeArea('00100', null, null).zone, '091_1') // city centre
  assert.equal(makeArea('00530', null, null).zone, '091_2') // Kallio
  assert.equal(makeArea('00940', null, null).zone, '091_4') // Kontula
})

test('Espoo, Vantaa and nearby towns use their published area figure', () => {
  assert.equal(makeArea('02600', null, null).zone, '049')
  assert.equal(makeArea('01360', null, null).zone, '092')
  assert.equal(makeArea('01120', null, null).zone, 'keh') // Sipoo
})

test('typical rent is the zone price per m² times the space per person', () => {
  const a = makeArea('00940', 700, 2800)
  assert.ok(Math.abs(a.typicalRent - RENTS['091_4'].all * a.m2PerPerson) < 1e-9)
  assert.ok(Math.abs(a.m2ForPayment - 700 / RENTS['091_4'].all) < 1e-9)
  assert.equal(a.housingShare, 0.25)
})

test('no housing payment or income: no comparison, area figures still there', () => {
  const a = makeArea('00530', 0, null)
  assert.equal(a.housing, null)
  assert.equal(a.m2ForPayment, null)
  assert.equal(a.housingShare, null)
  assert.ok(a.medianIncomeMonthly > 0)
})

test('unknown or missing postal codes give nothing', () => {
  assert.equal(makeArea('99999', 700, 2800), null)
  assert.equal(makeArea(null, 700, 2800), null)
})
