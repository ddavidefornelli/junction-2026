import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseReply, sendChat, type ChatMessage } from './assistant'
import { ChatChart } from './ChatChart'

const BUBBLE = 'w-fit max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm'

// The conversation with the assistant. The messages live in the parent so they
// survive a change of tab; `context` is the summary the assistant answers from
// (null while the customer's data is still loading).
export function Chat({
  messages,
  onMessages,
  context,
  starters,
}: {
  messages: ChatMessage[]
  onMessages: (messages: ChatMessage[]) => void
  context: string | null
  starters: string[]
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const log = useRef<HTMLDivElement>(null)

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages, busy])

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy || context === null) return
    // After a failed reply the question is still the last message: ask it again rather than twice.
    const last = messages[messages.length - 1]
    const asked: ChatMessage[] =
      last?.role === 'user' && last.content === question ? messages : [...messages, { role: 'user', content: question }]
    onMessages(asked)
    setDraft('')
    setError(false)
    setBusy(true)
    try {
      await sendChat(context, asked, (reply) => onMessages([...asked, { role: 'assistant', content: reply }]))
    } catch {
      // Nothing, or a reply cut short: back to the question, so it can be asked again.
      onMessages(asked)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    ask(draft)
  }

  const last = messages[messages.length - 1]
  // The reply so far ends in a chart that is still being written.
  const drawing = last?.role === 'assistant' && last.content.lastIndexOf('<chart>') > last.content.lastIndexOf('</chart>')
  return (
    <div className="mt-auto">
      {messages.length > 0 ? (
        <div ref={log} aria-live="polite" className="mb-3 max-h-80 space-y-2 overflow-y-auto">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <p key={i} className={`ml-auto bg-ink text-white ${BUBBLE}`}>
                {m.content}
              </p>
            ) : (
              // A reply is text, with a chart where the assistant chose to draw one.
              parseReply(m.content).map((part, j) =>
                typeof part === 'string' ? (
                  <p key={`${i}-${j}`} className={`bg-paper ${BUBBLE}`}>
                    {part}
                  </p>
                ) : (
                  <ChatChart key={`${i}-${j}`} chart={part} />
                ),
              )
            ),
          )}
          {busy && (last?.role === 'user' || drawing) && (
            <p className="w-fit rounded-lg bg-paper px-3 py-2 text-sm text-muted">
              {drawing ? 'Drawing a chart…' : 'Thinking…'}
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
    </div>
  )
}
