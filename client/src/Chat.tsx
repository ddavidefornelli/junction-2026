import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Row } from '../ledger'
import { parseReply, sendChat, suggestionsOf, type Chart, type ChatMessage } from './assistant'
import { ChatChart } from './ChatChart'
import { ChatLookup } from './ChatLookup'
import { SecureNote } from './Security'
import { Talk } from './Talk'
import { speak, speakableText, useVoice } from './voice'

const BUBBLE = 'w-fit max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm'

// The question asked when a bar or a point of a chart is clicked.
const followUp = (type: Chart['type'], label: string) =>
  type === 'line'
    ? `What happened in ${label.replace(/^(\d{4})-(\d{2})$/, (_, y, m) => `${Number(m)}/${y}`)}?`
    : `Tell me more about ${label}.`

// Text with its web addresses (the sources under advice) as links.
const withLinks = (text: string) =>
  text.split(/(https:\/\/[^\s)]+)/).map((piece, k) =>
    k % 2 ? (
      <a key={k} href={piece} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
        {piece.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
      </a>
    ) : (
      piece
    ),
  )

// The conversation with the assistant. The messages live in the parent so they
// survive a change of tab; `context` is the summary the assistant answers from
// (null while the customer's data is still loading) and `ledger` the
// transactions it can look things up in.
export function Chat({
  messages,
  onMessages,
  context,
  ledger,
  starters,
  question = null,
  onAsked,
  prompt = null,
  onPromptHandled,
}: {
  messages: ChatMessage[]
  onMessages: (messages: ChatMessage[]) => void
  context: string | null
  ledger: Row[] | null
  starters: string[]
  // A question typed elsewhere, asked once the data is ready; onAsked clears it.
  question?: string | null
  onAsked?: () => void
  prompt?: { id: number; text: string } | null
  onPromptHandled?: () => void
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const handledPrompt = useRef<number | null>(null)
  const handledQuestion = useRef<string | null>(null)
  const voice = useVoice()

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages, busy])

  // Ask Walter `text`. Resolves with his reply (null when there is none); in a
  // spoken conversation, once he has finished saying it.
  const ask = useCallback(async (text: string): Promise<string | null> => {
    const question = text.trim()
    if (!question || busy || context === null) return null
    const talking = voice.mode === 'talk'
    // After a failed reply the question is still the last message: ask it again rather than twice.
    const last = messages[messages.length - 1]
    const asked: ChatMessage[] =
      last?.role === 'user' && last.content === question ? messages : [...messages, { role: 'user', content: question }]
    onMessages(asked)
    setDraft('')
    setError(false)
    setBusy(true)
    let reply: string | null = null
    try {
      reply = await sendChat(context, ledger, asked, (reply) => onMessages([...asked, { role: 'assistant', content: reply }]), talking)
    } catch {
      // Nothing, or a reply cut short: back to the question, so it can be asked again.
      onMessages(asked)
      setError(true)
    } finally {
      setBusy(false)
    }
    if (reply && talking) await speak(reply)
    else if (reply && voice.enabled) void speak(reply)
    return reply
  }, [busy, context, ledger, messages, onMessages, voice.enabled, voice.mode])

  useEffect(() => {
    if (question === null) {
      handledQuestion.current = null
      return
    }
    if (context === null || busy || handledQuestion.current === question) return
    handledQuestion.current = question
    onAsked?.()
    void ask(question)
  }, [question, context, busy, ask, onAsked])

  // Wait for the customer's data, then send the scenario through Walter's normal chat API.
  // The id guard also prevents StrictMode from sending the same question twice.
  useEffect(() => {
    if (!prompt || context === null || handledPrompt.current === prompt.id) return
    handledPrompt.current = prompt.id
    onPromptHandled?.()
    void ask(prompt.text)
  }, [prompt, context, ask, onPromptHandled])

  function submit(e: FormEvent) {
    e.preventDefault()
    ask(draft)
  }

  const last = messages[messages.length - 1]
  // The reply so far ends in a chart that is still being written.
  const drawing = last?.role === 'assistant' && last.content.lastIndexOf('<chart>') > last.content.lastIndexOf('</chart>')
  // The reply so far is what Walter looked up; the answer is still to come.
  const reading = last?.role === 'assistant' && last.content.trimEnd().endsWith('</lookup>')
  // Follow-up questions Walter offered with his latest reply, shown as buttons.
  const suggestions = last?.role === 'assistant' ? suggestionsOf(last.content) : []
  return (
    <div className="mt-auto">
      {messages.length > 0 ? (
        <div ref={log} aria-live="polite" className="mb-3 max-h-[60vh] space-y-2 overflow-y-auto">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className={`ml-auto bg-ink text-white ${BUBBLE}`}>
                {m.content}
              </p>
            ) : (
              // A reply is text, with a chart where the assistant chose to draw one.
              [...parseReply(m.content).map((part, j) =>
                typeof part === 'string' ? (
                  <p key={`${i}-${j}`} className={`bg-paper ${BUBBLE}`}>
                    {withLinks(part)}
                  </p>
                ) : 'rows' in part ? (
                  <ChatLookup key={`${i}-${j}`} lookup={part} />
                ) : (
                  <ChatChart
                    key={`${i}-${j}`}
                    chart={part}
                    onPick={busy || context === null ? undefined : (label) => ask(followUp(part.type, label))}
                  />
                ),
              ),
              // Hear a finished reply (again).
              !(busy && i === messages.length - 1) && speakableText(m.content) && (
                <button
                  key={`${i}-listen`}
                  onClick={() => void speak(m.content)}
                  disabled={voice.loading}
                  className="block text-xs text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
                >
                  <span aria-hidden="true">🔊 </span>Listen
                </button>
              )]
            ),
          )}
          {!busy && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={context === null}
                  className="rounded-full border border-line bg-white px-3 py-1 text-left text-xs hover:border-ink disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {busy && (last?.role === 'user' || drawing || reading) && (
            <p className="w-fit rounded-lg bg-paper px-3 py-2 text-sm text-muted">
              {drawing ? 'Drawing a chart…' : reading ? 'Working it out…' : 'Thinking…'}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-700">
              Walter could not answer.{' '}
              {last?.role === 'user' && (
                <button onClick={() => ask(last.content)} className="underline underline-offset-4">
                  Try again
                </button>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              disabled={context === null}
              className="rounded-full border border-line px-3 py-1 text-left text-xs hover:border-ink disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {voice.mode === 'talk' ? (
        <Talk ask={ask} disabled={context === null} />
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            aria-label="Chat message"
            placeholder={context === null ? 'Loading your data…' : 'Ask a question…'}
            className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-ink"
          />
          <button
            disabled={busy || context === null || !draft.trim()}
            aria-label="Send message"
            className="rounded-md bg-ink px-3 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
      <div className="mt-2.5">
        <SecureNote>
          Walter sees your figures, never your customer ID or account number. This chat is not saved
          {voice.mode === 'talk' ? '; your voice is turned into text by ElevenLabs and not kept.' : '.'}
        </SecureNote>
      </div>
    </div>
  )
}
