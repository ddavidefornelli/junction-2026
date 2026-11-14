import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { classifyPurchases, ClassifyError } from './laya.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('classifies purchases using the configured local endpoint and three questions', async () => {
  const questions = []
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:8000/v1/systemone')
    assert.equal(init.method, 'POST')
    const body = JSON.parse(init.body)
    questions.push(body)
    const q = body.questions.q
    const answer = q.type === 'choice'
      ? { choice: body.state.category === 'restaurants' ? 'd' : 'n' }
      : { noul: q.instructions.includes('saving money') ? 0.9 : 0.1 }
    return new Response(JSON.stringify({ answers: { q: answer } }), { status: 200 })
  }
  const result = await classifyPurchases(
    { baseUrl: 'http://127.0.0.1:8000/' }, 'Save money',
    [{ category: 'restaurants', transaction_type: 'card' }, { category: 'groceries', transaction_type: 'card' }],
  )
  assert.deepEqual(result, ['bad', 'neutral'])
  assert.equal(questions.length, 5) // goal asked once, then two questions per kind
})

test('reports an unavailable local model rather than silently returning verdicts', async () => {
  globalThis.fetch = async () => { throw new Error('connection refused') }
  await assert.rejects(
    classifyPurchases({ baseUrl: 'http://127.0.0.1:8000' }, 'Save', [{ category: 'groceries', transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502 && /Could not reach Laya/.test(e.message),
  )
})

test('requires a configured model and rejects invalid purchases and responses', async () => {
  await assert.rejects(classifyPurchases({}, 'Save', []), (e) => e instanceof ClassifyError && e.status === 503)
  const config = { baseUrl: 'http://127.0.0.1:8000' }
  await assert.rejects(classifyPurchases(config, 'Save', [null]), (e) => e instanceof ClassifyError && e.status === 400)
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: {} }), { status: 200 })
  await assert.rejects(
    classifyPurchases(config, 'Save', [{ category: null, transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502,
  )
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { q: { noul: null } } }), { status: 200 })
  await assert.rejects(
    classifyPurchases(config, 'Save', [{ category: null, transaction_type: null }]),
    (e) => e instanceof ClassifyError && e.status === 502,
  )
})
