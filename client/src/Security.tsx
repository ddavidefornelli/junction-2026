import { useEffect, useRef, useState, type ReactNode } from 'react'

// Everything the customer sees about how their data is protected. Each statement
// here describes what the app really does (see api/[resource].ts and vite.config.ts):
// claims are worded from the code, not from what would sound reassuring.

const SESSION_START_KEY = 'sessionStart'

// Whether the browser's link to Pankki is encrypted. It is on the deployed site
// (HTTPS); a local development server is plain HTTP, and says so.
export const linkEncrypted = () => {
  try {
    return window.location.protocol === 'https:'
  } catch {
    return false
  }
}

const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function markSessionStart() {
  try { sessionStorage.setItem(SESSION_START_KEY, String(Date.now())) } catch { /* private browsing */ }
}

// Logging out leaves nothing of the session in this tab.
export function clearSession() {
  try { sessionStorage.clear() } catch { /* private browsing */ }
  revealed.clear()
}

function sessionStart(): string | null {
  try {
    const at = Number(sessionStorage.getItem(SESSION_START_KEY))
    return at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null
  } catch {
    return null
  }
}

export function LockIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

// A shield whose outline and tick draw themselves: the moment something is secured.
export function ShieldSeal({ className = 'size-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`shrink-0 text-credit ${className}`} aria-hidden="true">
      <path d="M24 4.5 39 10v12.500c0 9.500-6.200 17.300-15 21-8.800-3.700-15-11.500-15-21V10z" fill="currentColor" opacity=".1" />
      <path
        d="M24 4.500 39 10v12.500c0 9.500-6.200 17.300-15 21-8.800-3.700-15-11.500-15-21V10z"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"
        pathLength={1} className="draw-line"
      />
      <path
        d="m16.500 24.500 5.500 5.500 10-11.500"
        fill="none" stroke="currentColor" strokeWidth="2.600" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} className="draw-line [animation-delay:450ms]"
      />
    </svg>
  )
}

// Figures already shown this session: they arrive scrambled only the first time.
const revealed = new Set<string>()
const REVEAL_MS = 1100

// A sensitive figure that arrives as scrambled digits and settles into the real
// value, left to right. Screen readers get the real value at once.
export function CipherText({ text, id }: { text: string; id: string }) {
  const key = `${id}:${text}`
  const [shown, setShown] = useState(() => (revealed.has(key) || reducedMotion() ? text.length : 0))

  useEffect(() => {
    if (revealed.has(key) || reducedMotion()) {
      setShown(text.length)
      return
    }
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / REVEAL_MS)
      setShown(Math.floor(progress * text.length))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else revealed.add(key)
    }
    // Hold the scramble for a beat before it starts to settle.
    const timer = setTimeout(() => { frame = requestAnimationFrame(tick) }, 350)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [key, text])

  const done = shown >= text.length
  // Re-rendered every frame while settling, so the hidden digits keep changing.
  const hidden = done
    ? ''
    : [...text.slice(shown)].map((c) => (/\d/.test(c) ? String(Math.floor(Math.random() * 10)) : c)).join('')
  return (
    <span aria-label={text}>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        {!done && <span className="text-muted/60">{hidden}</span>}
      </span>
    </span>
  )
}

// The quiet line under a place where data moves or is typed.
export function SecureNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted">
      <LockIcon className="mt-px size-3.5" />
      <span>{children}</span>
    </p>
  )
}

// Shown while the account is being fetched: the data travelling, under lock.
export function SecureLoading({ text = 'Fetching your account' }: { text?: string }) {
  return (
    <div role="status" className="rounded-lg border border-line bg-white p-5">
      <div className="flex items-center gap-2 text-sm">
        <LockIcon className="size-4 text-credit" />
        <span>{text}{linkEncrypted() ? ' over an encrypted connection' : ''}…</span>
      </div>
      <Channel className="mt-4" />
    </div>
  )
}

// You → Pankki → the database, with the traffic between them flowing as sealed packets.
function Channel({ className = '' }: { className?: string }) {
  const stops = [
    ['You', 'This browser tab'],
    ['Pankki', 'Holds the keys'],
    ['Your data', 'Encrypted storage'],
  ]
  return (
    <div className={`flex items-start ${className}`} aria-hidden="true">
      {stops.map(([name, what], i) => (
        <div key={name} className={`flex items-start ${i > 0 ? 'flex-1' : ''}`}>
          {i > 0 && (
            <div className="relative mx-2 mt-[15px] h-0.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="flow-line absolute inset-0" />
            </div>
          )}
          <div className="w-20 text-center sm:w-24">
            <div className="mx-auto flex size-8 items-center justify-center rounded-full border border-credit/30 bg-credit/10 text-credit">
              <LockIcon className="size-4" />
            </div>
            <p className="mt-1.5 text-xs font-medium">{name}</p>
            <p className="text-[11px] leading-tight text-muted">{what}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-credit" aria-hidden="true">
      <circle cx="8" cy="8" r="7.25" fill="currentColor" opacity=".12" />
      <path d="M4.750 8.250 7 10.500l4.250-4.750" fill="none" stroke="currentColor" strokeWidth="1.600" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// The always-visible status in the header. It opens the plain-words account of
// how the customer's data is protected.
export function ProtectedBadge() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const encrypted = linkEncrypted()
  const started = sessionStart()

  useEffect(() => {
    const el = dialog.current
    if (open && el && !el.open) el.showModal()
  }, [open])

  const facts: [string, string][] = [
    encrypted
      ? ['Encrypted on the way', 'Everything between this browser and Pankki travels over an encrypted connection (HTTPS).']
      : ['Local development build', 'This copy runs on your own computer, so the browser link is plain HTTP. On the live site it is encrypted (HTTPS). Pankki still reaches your data over an encrypted connection.'],
    ['Encrypted where it is kept', 'Your transactions are stored in a database that encrypts everything on disk (AES-256).'],
    ['Keys never leave the bank', 'The keys to the database stay on Pankki’s server. They are never sent to this browser.'],
    ['Look, don’t touch', 'This app can only read your account. Nothing here can move money or change your data.'],
    ['Walter doesn’t know who you are', 'The assistant works from your figures alone. Your customer ID and account number are never sent to it, and the chat is not saved.'],
    ['Gone when you leave', 'Your session lives in this tab only. Closing the tab or logging out ends it and clears it.'],
  ]

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex items-center gap-1.5 rounded-full border border-credit/30 bg-credit/5 py-1 pr-2.5 pl-2 text-xs font-medium text-credit hover:bg-credit/10"
      >
        <span className="relative flex size-2" aria-hidden="true">
          <span className="seal-pulse absolute inset-0 rounded-full bg-credit" />
          <span className="relative size-2 rounded-full bg-credit" />
        </span>
        <LockIcon className="size-3.5" />
        Protected
      </button>
      {open && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(e) => e.target === dialog.current && dialog.current?.close()}
          aria-labelledby="protected-title"
          className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
        >
          <div className="max-h-[85vh] overflow-y-auto p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 id="protected-title" className="font-medium">How your data is protected</h2>
              <button
                onClick={() => dialog.current?.close()}
                aria-label="Close"
                className="-mt-1 rounded-md px-2 py-1 text-lg leading-none text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
            <Channel className="mt-5 rounded-md bg-paper px-2 py-4" />
            <ul className="mt-5 space-y-3.5">
              {facts.map(([title, text]) => (
                <li key={title} className="flex gap-2.5 text-sm">
                  <Tick />
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="mt-0.5 text-muted">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
            {started && (
              <p className="mt-5 border-t border-line pt-3 text-xs text-muted">
                This session started at {started}. It ends when you close this tab or log out.
              </p>
            )}
          </div>
        </dialog>
      )}
    </>
  )
}
