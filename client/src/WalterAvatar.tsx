import { useId, useSyncExternalStore } from 'react'

// Walter's profile picture: a cartoon grandpa who is good with money, drawn in
// the app's own colours so it stays sharp at any size and needs no image file.
// He blinks, glances around and bobs a little; while `talking` his mouth opens,
// his eyebrows bounce, his moustache wiggles and a ring pulses around him.
// The animations live in index.css (walter-*) and stop for reduced motion.
const SKIN = '#ffd3b4'
const HAIR = '#f3f5fa'
const HAIR_EDGE = '#c6ccd8'
const INK = '#0b2a1d'

// Easter egg: click any Walter three times in a row and every Walter in the
// app turns into a bald chemistry teacher in a pork-pie hat. Three more clicks
// bring the grandpa back. Kept in memory only, so a reload resets it.
const TRIPLE_CLICK_GAP_MS = 600
let heisenberg = false
let clicks = 0
let lastClick = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function countClick() {
  const now = Date.now()
  clicks = now - lastClick <= TRIPLE_CLICK_GAP_MS ? clicks + 1 : 1
  lastClick = now
  if (clicks < 3) return
  clicks = 0
  heisenberg = !heisenberg
  listeners.forEach((listener) => listener())
}

export function WalterAvatar({ className = 'h-10 w-10', talking = false }: { className?: string; talking?: boolean }) {
  const id = useId().replace(/:/g, '')
  const isHeisenberg = useSyncExternalStore(subscribe, () => heisenberg)
  if (isHeisenberg) return <HeisenbergAvatar id={id} className={className} talking={talking} />
  const stache = 'M32 38.200C29.200 36.300 24.600 36.200 22 38.600 20.500 40 18.300 39.900 17.500 38 16.600 41.300 19.900 43.200 23.300 41.800 26.300 40.600 29.600 40.300 32 40.800Z'
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      onClick={countClick}
      className={`walter shrink-0 rounded-full ${talking ? 'walter-talking' : ''} ${className}`}
    >
      <defs>
        <clipPath id={`${id}-frame`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        <radialGradient id={`${id}-sky`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#3fb36a" />
          <stop offset="1" stopColor="#00843d" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        {/* a cobalt sky with a few twinkling coins of light */}
        <rect width="64" height="64" fill={`url(#${id}-sky)`} />
        <g fill="#ffd43b">
          <path className="walter-sparkle" d="M10 11l1.100 2.700 2.700 1.100-2.700 1.100L10 18.600 8.900 15.900 6.200 14.800 8.900 13.700z" />
          <path className="walter-sparkle walter-sparkle-2" d="M54 9l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
          <path className="walter-sparkle walter-sparkle-3" d="M56 33l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </g>

        {/* jacket, shirt and a bow tie in S-green */}
        <path d="M7 64c0-10 10.500-15.500 25-15.500S57 54 57 64z" fill={INK} />
        <path d="M25 48.800 32 57l7-8.200c-2.200-.5-4.500-.7-7-.7s-4.800.2-7 .7z" fill="#fff" />
        <g className={talking ? 'walter-tie' : ''}>
          <path d="M32 51.500 25.500 47.800v7.400zM32 51.500l6.500-3.700v7.400z" fill="#12b76a" />
          <circle cx="32" cy="51.500" r="1.700" fill="#0b7a4b" />
          <circle cx="28" cy="50" r=".6" fill="#fff" fillOpacity=".7" />
          <circle cx="36" cy="53" r=".6" fill="#fff" fillOpacity=".7" />
        </g>

        <g className="walter-bob">
          {/* ears and fluffy side hair */}
          <circle cx="16.800" cy="32" r="3.600" fill="#f7b995" />
          <circle cx="47.200" cy="32" r="3.600" fill="#f7b995" />
          <g fill={HAIR} stroke={HAIR_EDGE} strokeWidth=".6">
            <circle cx="17.500" cy="24.500" r="4.200" />
            <circle cx="15.800" cy="28.600" r="3.400" />
            <circle cx="46.500" cy="24.500" r="4.200" />
            <circle cx="48.200" cy="28.600" r="3.400" />
          </g>

          {/* head, a shiny top and one proud curl */}
          <ellipse cx="32" cy="31.500" rx="15" ry="16" fill={SKIN} />
          <ellipse cx="26" cy="19.500" rx="3.600" ry="1.600" fill="#fff" fillOpacity=".55" transform="rotate(-20 26 19.500)" />
          <path className="walter-curl" d="M32 16.200c-1.600-3.600 1.600-6.400 4.400-5 2 1 1.200 3.900-1 3.300" fill="none" stroke={HAIR_EDGE} strokeWidth="2.200" strokeLinecap="round" />

          {/* rosy cheeks */}
          <ellipse cx="21.500" cy="37.500" rx="3.200" ry="2.200" fill="#ff7d96" fillOpacity=".45" />
          <ellipse cx="42.500" cy="37.500" rx="3.200" ry="2.200" fill="#ff7d96" fillOpacity=".45" />

          {/* bushy eyebrows */}
          <g className={talking ? 'walter-brows' : ''} fill="none" stroke={HAIR_EDGE} strokeWidth="2.800" strokeLinecap="round">
            <path d="M21.200 23.200c2.600-2.200 5.800-2.500 8.400-.6" />
            <path d="M34.400 22.600c2.600-1.900 5.800-1.600 8.400.6" />
          </g>

          {/* big round glasses, with eyes that glance and blink */}
          <g fill="#fff" fillOpacity=".7">
            <circle cx="26" cy="29.800" r="5.600" />
            <circle cx="38" cy="29.800" r="5.600" />
          </g>
          <g className="walter-look">
            <g className="walter-blink" fill={INK}>
              <circle cx="26.300" cy="30" r="2.300" />
              <circle cx="38.300" cy="30" r="2.300" />
              <circle cx="27.100" cy="29.100" r=".8" fill="#fff" />
              <circle cx="39.100" cy="29.100" r=".8" fill="#fff" />
            </g>
          </g>
          <g fill="none" stroke={INK} strokeWidth="1.700">
            <circle cx="26" cy="29.800" r="5.600" />
            <circle cx="38" cy="29.800" r="5.600" />
            <path d="M31.600 29.300q.4-1 .4-1t.4 1M20.400 28.800 17.600 27.600M43.600 28.800l2.800-1.200" strokeLinecap="round" />
          </g>
          <path d="M22.400 26.800a4.200 4.200 0 0 1 2.600-1.600M34.400 26.800a4.200 4.200 0 0 1 2.600-1.600" stroke="#fff" strokeWidth="1.100" strokeLinecap="round" fill="none" />

          {/* a round nose */}
          <ellipse cx="32" cy="35" rx="3.100" ry="2.600" fill="#f6a184" />
          <ellipse cx="31" cy="34.100" rx="1" ry=".6" fill="#fff" fillOpacity=".6" />

          {/* the mouth: a big grin, or open and chatting */}
          {talking ? (
            <g className="walter-mouth">
              <ellipse cx="32" cy="43.300" rx="3.600" ry="2.600" fill="#5b1f2a" />
              <ellipse cx="32" cy="44.600" rx="2.200" ry="1.100" fill="#ff6b81" />
            </g>
          ) : (
            <g>
              <path d="M26.800 41.600Q32 47.800 37.200 41.600Z" fill="#5b1f2a" />
              <path d="M27.600 42.200h8.800l-.6.9h-7.600z" fill="#fff" />
              <ellipse cx="32" cy="44.500" rx="2" ry=".9" fill="#ff6b81" />
            </g>
          )}

          {/* a handlebar moustache that curls up at the ends */}
          <g className={talking ? 'walter-stache' : ''} fill={HAIR} stroke={HAIR_EDGE} strokeWidth=".6">
            <path d={stache} />
            <path d={stache} transform="matrix(-1 0 0 1 64 0)" />
          </g>
        </g>
      </g>
    </svg>
  )
}

// Walter's alter ego: bald, a black pork-pie hat, rectangular glasses, a stern
// brow and a goatee, in front of a desert sky with a few blue crystals.
const BEARD = '#6b4a2f'

function HeisenbergAvatar({ id, className, talking }: { id: string; className: string; talking: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      onClick={countClick}
      className={`walter walter-reveal shrink-0 rounded-full ${talking ? 'walter-talking' : ''} ${className}`}
    >
      <defs>
        <clipPath id={`${id}-frame`}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        <radialGradient id={`${id}-desert`} cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#f6cf6a" />
          <stop offset="1" stopColor="#c9772c" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${id}-frame)`}>
        <rect width="64" height="64" fill={`url(#${id}-desert)`} />
        <g fill="#6fd3f7" stroke="#2b8fc0" strokeWidth=".4">
          <path className="walter-sparkle" d="M9 12l2.400-1.600 1.600 2.600-1.200 3.200-2.800.4z" />
          <path className="walter-sparkle walter-sparkle-2" d="M53 9l2-1.200 1.400 2.200-1 2.600-2.400.2z" />
          <path className="walter-sparkle walter-sparkle-3" d="M55 33l2-1.200 1.400 2.200-1 2.600-2.400.2z" />
        </g>

        {/* dark jacket over a khaki shirt */}
        <path d="M7 64c0-10 10.500-15.500 25-15.500S57 54 57 64z" fill="#2c2f33" />
        <path d="M25 48.800 32 57l7-8.200c-2.200-.5-4.500-.7-7-.7s-4.800.2-7 .7z" fill="#b9b57f" />

        <g className="walter-bob">
          {/* ears and a bald head */}
          <circle cx="17.600" cy="32" r="3.400" fill="#f7b995" />
          <circle cx="46.400" cy="32" r="3.400" fill="#f7b995" />
          <ellipse cx="32" cy="32" rx="14.400" ry="16" fill={SKIN} />

          {/* the pork-pie hat */}
          <ellipse cx="32" cy="20.200" rx="20" ry="3.400" fill="#111" />
          <path d="M21 20V12.600Q21 9.600 24.500 9.400h15Q43 9.600 43 12.600V20z" fill="#1b1b1b" />
          <path d="M23 10.600h18" stroke="#3a3a3a" strokeWidth="1.200" strokeLinecap="round" />
          <rect x="21" y="16.300" width="22" height="2.600" fill="#3d3d3d" />

          {/* stern eyebrows */}
          <g className={talking ? 'walter-brows' : ''} fill="none" stroke={BEARD} strokeWidth="2.200" strokeLinecap="round">
            <path d="M21.400 24.200 29.400 26" />
            <path d="M42.600 24.200 34.600 26" />
          </g>

          {/* rectangular glasses with narrowed eyes */}
          <g fill="#fff" fillOpacity=".55">
            <rect x="20.800" y="27" width="9.800" height="6.400" rx="1.400" />
            <rect x="33.400" y="27" width="9.800" height="6.400" rx="1.400" />
          </g>
          <g className="walter-look">
            <g className="walter-blink" fill="#1b1b1b">
              <ellipse cx="25.800" cy="30.300" rx="2" ry="1.700" />
              <ellipse cx="38.200" cy="30.300" rx="2" ry="1.700" />
            </g>
          </g>
          <g fill="none" stroke="#1b1b1b" strokeWidth="1.300">
            <rect x="20.800" y="27" width="9.800" height="6.400" rx="1.400" />
            <rect x="33.400" y="27" width="9.800" height="6.400" rx="1.400" />
            <path d="M30.600 29.200h2.800M20.800 29 17.800 28.200M43.200 29l3-.8" strokeLinecap="round" />
          </g>

          {/* nose */}
          <path d="M32 31.500 30 37.400h4z" fill="#f6a184" />

          {/* goatee, with the mouth set in it */}
          <path
            className={talking ? 'walter-stache' : ''}
            d="M25.800 40.200Q32 37.600 38.200 40.200L38.700 44.400Q37.200 49.200 32 49.600 26.800 49.200 25.300 44.400z"
            fill={BEARD}
          />
          {talking ? (
            <g className="walter-mouth">
              <ellipse cx="32" cy="43.200" rx="2.800" ry="2" fill="#3a1218" />
            </g>
          ) : (
            <path d="M28.600 43.200Q32 42.400 35.400 43.200" stroke="#3a1218" strokeWidth="1.300" strokeLinecap="round" fill="none" />
          )}
        </g>
      </g>
    </svg>
  )
}
