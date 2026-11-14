import { useEffect, useRef, type ReactNode } from 'react'
import { WalterAvatar } from './WalterAvatar'

// The chat with Walter, opened over the page: centred, with the page behind it blurred.
export function ChatDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    // No close() on cleanup: it would fire onClose when StrictMode re-runs the effect.
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

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
          <WalterAvatar />
          <div className="flex-1">
            <h2 id="chat-dialog-title" className="text-sm font-medium">
              Walter
            </h2>
            <p className="text-xs text-muted">Your Pankki assistant</p>
          </div>
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
