import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { classifyPurchases, ClassifyError } from './laya.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('classifies purchase kinds without asking for a customer goal', async () => {
  const questions = []
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8000/v1/systemone')
    assert.equal(init.method, 'POST')
    const body = JSON.parse(init.body)
    questions.push(body)
    const q = body.questions.q
    const answer = { choice: body.state.category === 'restaurants' ? 'd' : 'n' }
    assert.equal(q.type, 'choice')
    return new Response(JSON.stringify({ answers: { q: answer } }), { status: 200 })
  }
  const result = await classifyPurchases(
    { baseUrl: 'http://127.0.0.1:8000/' },
    [{ category: 'restaurants', transaction_type: 'card' }, { category: 'groceries', transaction_type: 'card' }],
  )
  assert.deepEqual(result, ['flexible', 'essential'])
  assert.equal(questions.length, 2)
})

test('reports an unavailable local model rather than silently returning labels', async () => {
  globalThis.fetch = async () => { throw new Error('connection refused') }
  await assert.rejects(
    classifyPurchases({ baseUrl: 'http://127.0.0.1:8000' }, [{ category: 'groceries', transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502 && /Could not reach Laya/.test(e.message),
  )
})

test('requires a configured model and rejects invalid purchases and responses', async () => {
  await assert.rejects(classifyPurchases({}, []), (e) => e instanceof ClassifyError && e.status === 503)
  const config = { baseUrl: 'http://127.0.0.1:8000' }
  await assert.rejects(classifyPurchases(config, [null]), (e) => e instanceof ClassifyError && e.status === 400)
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: {} }), { status: 200 })
  await assert.rejects(
    classifyPurchases(config, [{ category: null, transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502,
  )
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { q: { choice: 'unknown' } } }), { status: 200 })
  await assert.rejects(
    classifyPurchases(config, [{ category: null, transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502,
  )
})

test('caches each transaction kind and retries after a failure', async () => {
  let calls = 0
  let down = true
  globalThis.fetch = async (_url, init) => {
    calls++
    if (down) return new Response('', { status: 500 })
    const q = JSON.parse(init.body).questions.q
    return new Response(JSON.stringify({ answers: { q: { choice: q.type === 'choice' ? 'd' : 'n' } } }), { status: 200 })
  }
  const config = { baseUrl: 'http://cache.test' }
  const kinds = [{ category: 'travel', transaction_type: 'card' }]
  await assert.rejects(classifyPurchases(config, kinds), (e) => e instanceof ClassifyError && e.status === 502)
  down = false
  calls = 0
  assert.deepEqual(await classifyPurchases(config, kinds), ['flexible'])
  assert.equal(calls, 1)
  assert.deepEqual(await Promise.all([classifyPurchases(config, kinds), classifyPurchases(config, kinds)]), [['flexible'], ['flexible']])
  assert.equal(calls, 1) // answered from memory
  await classifyPurchases(config, [{ category: 'groceries', transaction_type: 'card' }])
  assert.equal(calls, 2)
})

test('retries a call that fails for a moment, so classification succeeds', async () => {
  let failures = 1
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls++
    if (failures-- > 0) throw new TypeError('fetch failed')
    const q = JSON.parse(init.body).questions.q
    return new Response(JSON.stringify({ answers: { q: { choice: 'd' } } }), { status: 200 })
  }
  const config = { baseUrl: 'http://retry.test' }
  assert.deepEqual(await classifyPurchases(config, [{ category: 'travel', transaction_type: 'card' }]), ['flexible'])
  assert.equal(calls, 2)
})

test('does not retry a request Laya rejects', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return new Response('', { status: 401 })
  }
  await assert.rejects(
    classifyPurchases({ baseUrl: 'http://reject.test' }, [{ category: null, transaction_type: null }]),
    (e) => e instanceof ClassifyError && /401/.test(e.message),
  )
  assert.equal(calls, 1)
})
