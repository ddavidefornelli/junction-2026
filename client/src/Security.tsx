import { useEffect, useState, type ReactNode } from 'react'

// Everything the customer sees about how their data is protected. Each statement
// here describes what the app really does (see api/[resource].ts and vite.config.ts):
// claims are worded from the code, not from what would sound reassuring.
const SESSION_START_KEY = 'sessionStart'

// Whether the browser's link to S-Pankki is encrypted. It is on the deployed site
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
    <div role="status" className="rounded-lg bg-white p-5">
      <div className="flex items-center gap-2 text-sm">
        <LockIcon className="size-4 text-credit" />
        <span>{text}{linkEncrypted() ? ' over an encrypted connection' : ''}…</span>
      </div>
      <Channel className="mt-4" />
    </div>
  )
}

// You → S-Pankki → the database, with the traffic between them flowing as sealed packets.
function Channel({ className = '' }: { className?: string }) {
  const stops = [
    ['You', 'This browser tab'],
    ['S-Pankki', 'Holds the keys'],
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


