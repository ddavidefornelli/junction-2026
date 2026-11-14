import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ScenarioError, whatIfScenarios } from './scenarios.ts'

const context = 'Money out by category, recent months:\n- 2026-10: Restaurants 200 €, Entertainment 100 €'
const questions = [
  'How much could I save each month if I spent 20% less on Restaurants?',
  'How much could I save each month if I spent 10% less on Entertainment?',
  'What if I spent 30% less on Restaurants?',
]

test('Walter suggests multiple English what-if questions without starting a chat', async () => {
  const original = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [
      ...questions, questions[0], 'This is not a question', '', 42,
    ] }) } }] }), { status: 200 })
  }
  try {
    assert.deepEqual(await whatIfScenarios({ apiKey: 'test-key' }, context), questions)
    assert.equal(request.url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(request.options.headers.Authorization, 'Bearer test-key')
    const body = JSON.parse(request.options.body)
    assert.equal(body.response_format.type, 'json_object')
    assert.match(body.messages[1].content, /Restaurants 200 €/)
  } finally {
    globalThis.fetch = original
  }
})

test('rejects missing spending data and unusable model answers', async () => {
  await assert.rejects(whatIfScenarios({ apiKey: 'test-key' }, ''), { status: 400 })
  await assert.rejects(whatIfScenarios({ apiKey: 'test-key' }, 'Current balance: 100 €'), { status: 422 })
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [questions[0]] }) } }] }), { status: 200 })
  try {
    await assert.rejects(whatIfScenarios({ apiKey: 'test-key' }, context), (error) => error instanceof ScenarioError && error.status === 502)
  } finally {
    globalThis.fetch = original
  }
})
