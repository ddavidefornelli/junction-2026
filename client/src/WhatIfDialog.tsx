import { useEffect, useRef, useState } from 'react'
import { getWhatIfScenarios } from './assistant'
import { WalterAvatar } from './WalterAvatar'

// Walter offers choices first. Only picking one starts a conversation in the chat.
export function WhatIfDialog({ context, onPick, onClose }: {
  context: string | null
  onPick: (question: string) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [questions, setQuestions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  useEffect(() => {
    if (context === null) return
    const controller = new AbortController()
    setQuestions([])
    setError(null)
    getWhatIfScenarios(context, controller.signal)
      .then((items) => { setQuestions(items); setError(null) })
      .catch((e) => {
        if (controller.signal.aborted) return
        console.error('[scenarios] Could not get questions', e)
        setError(e instanceof Error && e.message === 'Not enough spending data for scenarios yet' ? e.message : 'Walter could not find scenarios right now.')
      })
    return () => controller.abort()
  }, [context, attempt])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      aria-labelledby="what-if-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-emerald-100 bg-white p-0 text-emerald-950 shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <WalterAvatar />
          <div className="flex-1">
            <h2 id="what-if-title" className="font-semibold">What if scenarios</h2>
            <p className="text-xs text-emerald-700">Explore your options with Walter</p>
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Close scenarios"
            className="rounded-md px-2 py-1 text-lg leading-none text-emerald-800 hover:bg-emerald-50">×</button>
        </div>
        <p className="mt-5 text-sm text-emerald-900">Choose a question. Walter will work out what it could mean for you.</p>
        <div aria-live="polite" className="mt-4">
          {error ? (
            <p className="text-sm text-red-700">{error}{' '}
              {error !== 'Not enough spending data for scenarios yet' && (
                <button type="button" onClick={() => setAttempt((n) => n + 1)}
                  className="font-medium underline underline-offset-2">Try again</button>
              )}
            </p>
          ) : questions.length ? (
            <ul className="space-y-2">
              {questions.map((question) => (
                <li key={question}>
                  <button type="button" onClick={() => onPick(question)}
                    className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium text-emerald-950 transition hover:border-emerald-700 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                    {question} <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-sm text-emerald-700">{context === null ? 'Loading your data…' : 'Walter is finding scenarios for you…'}</p>
          )}
        </div>
      </div>
    </dialog>
  )
}
