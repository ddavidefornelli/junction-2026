import { useEffect, useRef, type ReactNode } from 'react'
import { onBackdrop } from './sheet'
import { WalterAvatar } from './WalterAvatar'
import { setMode, setVoiceEnabled, stopSpeaking, useVoice, type Mode } from './voice'

// The chat with Walter, opened over the page: a sheet from the bottom edge on a
// phone (index.css), a centred card with the page behind it blurred on a wide screen.
export function ChatDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const voice = useVoice()

  useEffect(() => {
    // No close() on cleanup: it would fire onClose when StrictMode re-runs the effect.
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  // Walter stops talking when the chat closes.
  useEffect(() => stopSpeaking, [])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => onBackdrop(e) && onClose()}
      aria-labelledby="chat-dialog-title"
      className="sheet max-w-xl bg-white text-ink shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col p-4 sm:p-5">
        <div className="mb-3 flex shrink-0 items-center gap-2 border-b border-line pb-3 sm:gap-3">
          <WalterAvatar talking={voice.speaking} className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="chat-dialog-title" className="text-sm font-medium">
              Walter
            </h2>
            <p className="truncate text-xs text-muted" aria-live="polite">
              {voice.loading ? 'Getting ready…' : voice.speaking ? 'Speaking…' : <span className="max-sm:hidden">Your White assistant</span>}
            </p>
          </div>
          <div role="radiogroup" aria-label="How to talk with Walter" className="flex shrink-0 rounded-full bg-paper p-1 text-sm">
            {(['text', 'talk'] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={voice.mode === m}
                onClick={() => setMode(m)}
                className={`min-h-9 rounded-full px-3 ${voice.mode === m ? 'bg-ink font-semibold text-white' : 'text-muted hover:text-ink'}`}
              >
                {m === 'text' ? 'Chat' : 'Talk'}
              </button>
            ))}
          </div>
          {voice.mode === 'text' && voice.speaking && (
            <button
              onClick={stopSpeaking}
              className="min-h-11 shrink-0 rounded-full bg-paper px-3 text-sm text-muted hover:text-ink"
            >
              Stop
            </button>
          )}
          {voice.mode === 'text' && (
            <button
              onClick={() => setVoiceEnabled(!voice.enabled)}
              aria-pressed={voice.enabled}
              aria-label={voice.enabled ? 'Turn off Walter’s voice' : 'Turn on Walter’s voice'}
              title={voice.enabled ? 'Voice on' : 'Voice off'}
              className={`flex size-11 shrink-0 items-center justify-center rounded-full sm:size-9 ${voice.enabled ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              <SpeakerIcon on={voice.enabled} />
            </button>
          )}
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Close chat"
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-paper hover:text-ink sm:size-9"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" />
      {on ? (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      ) : (
        <path d="m22 9-6 6M16 9l6 6" />
      )}
    </svg>
  )
}
