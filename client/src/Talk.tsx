import { useEffect, useRef, useState, type ReactNode } from 'react'
import { WalterAvatar } from './WalterAvatar'
import { listen, microphoneSupported, releaseMicrophone, transcribe, type Recording } from './listen'
import { stopSpeaking, useVoice } from './voice'

type Phase = 'off' | 'listening' | 'transcribing' | 'answering'

// A spoken conversation with Walter: the customer talks, Walter answers out
// loud, then listens again, until the customer ends it. `ask` sends what was
// said to Walter and resolves with his reply once he has finished saying it
// (null when he could not answer). `who` and `avatar` put someone else on the
// line instead of Walter (the customer's future self, FutureCall.tsx).
export function Talk({ ask, disabled, who = 'Walter', avatar }: {
  ask: (text: string) => Promise<string | null>
  disabled: boolean
  who?: string
  avatar?: ReactNode
}) {
  const voice = useVoice()
  const [phase, setPhase] = useState<Phase>('off')
  const [level, setLevel] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const active = useRef(false)
  const recording = useRef<Recording | null>(null)
  const request = useRef<AbortController | null>(null)
  const askRef = useRef(ask)
  askRef.current = ask

  function end(message: string | null = null) {
    active.current = false
    recording.current?.cancel()
    recording.current = null
    request.current?.abort()
    request.current = null
    stopSpeaking()
    releaseMicrophone()
    setPhase('off')
    setLevel(0)
    setNote(message)
  }

  // The conversation ends when the panel goes (the chat closes, or back to typing).
  useEffect(() => () => end(), [])

  async function turn() {
    setNote(null)
    setPhase('listening')
    try {
      const rec = await listen(setLevel)
      if (!active.current) return rec.cancel()
      recording.current = rec
      const audio = await rec.result
      recording.current = null
      if (!active.current) return
      if (!audio) return end('I didn’t hear anything. Tap the microphone when you’re ready.')

      setPhase('transcribing')
      const controller = new AbortController()
      request.current = controller
      const text = await transcribe(audio, controller.signal)
      request.current = null
      if (!active.current) return
      if (!text) return end('Sorry, I didn’t catch that. Tap the microphone and try again.')

      setPhase('answering')
      const reply = await askRef.current(text)
      if (!active.current) return
      if (reply === null) return end(null) // the chat shows what went wrong
      void turn() // Walter has answered: listen again
    } catch (e) {
      if (!active.current) return
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      console.error('[talk] Turn failed', e)
      end(denied ? `${who} needs your microphone. Allow it in your browser and try again.` : 'Something went wrong while listening. Try again.')
    }
  }

  function press() {
    if (phase === 'off') {
      active.current = true
      void turn()
    } else if (phase === 'listening') {
      recording.current?.finish() // done talking
    } else if (voice.speaking || voice.loading) {
      stopSpeaking() // interrupt Walter; he listens again
    }
  }

  if (!microphoneSupported())
    return <p className="text-sm text-muted">This browser can’t record audio.{who === 'Walter' && ' Switch to Chat to type to Walter instead.'}</p>

  const speaking = phase === 'answering' && (voice.speaking || voice.loading)
  const status =
    phase === 'listening'
      ? 'Listening… tap when you’re done'
      : phase === 'transcribing'
        ? 'Getting that down…'
        : speaking
          ? voice.loading
            ? 'Getting ready to speak…'
            : `${who} is speaking… tap to interrupt`
          : phase === 'answering'
            ? 'Thinking…'
            : disabled
              ? who === 'Walter' ? 'Loading your data…' : voice.speaking ? `${who} is speaking…` : 'Connecting…'
              : who === 'Walter' ? 'Tap the microphone and ask Walter anything' : 'Tap the microphone and talk'
  const canPress = phase === 'off' ? !disabled : phase === 'listening' || speaking

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative flex size-24 items-center justify-center">
        {phase === 'listening' && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-credit/20 transition-transform duration-75"
            style={{ transform: `scale(${1 + level * 0.45})` }}
          />
        )}
        {avatar ?? <WalterAvatar className="relative size-20" talking={voice.speaking} />}
      </div>
      <p className="min-h-5 text-center text-sm text-muted" aria-live="polite">
        {note ?? status}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={press}
          disabled={!canPress}
          aria-label={phase === 'off' ? `Start talking to ${who}` : phase === 'listening' ? 'Done talking' : `Interrupt ${who}`}
          className={`flex size-14 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-40 ${phase === 'listening' ? 'bg-red-600 hover:bg-red-700' : 'bg-ink hover:bg-ink/90'}`}
        >
          {phase === 'listening' ? <StopIcon /> : speaking ? <HandIcon /> : <MicIcon />}
        </button>
      </div>
      {phase !== 'off' && (
        <button onClick={() => end()} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
          End conversation
        </button>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 16 0v-2a2 2 0 0 0-4 0" />
    </svg>
  )
}
