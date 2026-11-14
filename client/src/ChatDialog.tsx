import { useEffect, useRef, type ReactNode } from 'react'
import { WalterAvatar } from './WalterAvatar'
import { setVoiceEnabled, stopSpeaking, useVoice } from './voice'

// The chat with Walter, opened over the page: centred, with the page behind it blurred.
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
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-labelledby="chat-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-lg border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[85vh] flex-col p-5">
        <div className="mb-4 flex items-center gap-3 border-b border-line pb-3">
          <WalterAvatar talking={voice.speaking} />
          <div className="flex-1">
            <h2 id="chat-dialog-title" className="text-sm font-medium">
              Walter
            </h2>
            <p className="text-xs text-muted" aria-live="polite">
              {voice.loading ? 'Getting ready to speak…' : voice.speaking ? 'Speaking…' : 'Your Pankki assistant'}
            </p>
          </div>
          {voice.speaking && (
            <button
              onClick={stopSpeaking}
              className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:border-ink hover:text-ink"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setVoiceEnabled(!voice.enabled)}
            aria-pressed={voice.enabled}
            aria-label={voice.enabled ? 'Turn off Walter’s voice' : 'Turn on Walter’s voice'}
            title={voice.enabled ? 'Voice on' : 'Voice off'}
            className={`flex size-8 items-center justify-center rounded-md ${voice.enabled ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            <SpeakerIcon on={voice.enabled} />
          </button>
          <button
            onClick={() => dialog.current?.close()}
            aria-label="Close chat"
            className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:text-ink"
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
