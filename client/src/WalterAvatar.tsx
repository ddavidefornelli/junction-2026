import { useId } from 'react'

// Walter's profile picture: a cartoon grandpa who is good with money, drawn in
// the app's own colours so it stays sharp at any size and needs no image file.
// He blinks, glances around and bobs a little; while `talking` his mouth opens,
// his eyebrows bounce, his moustache wiggles and a ring pulses around him.
// The animations live in index.css (walter-*) and stop for reduced motion.
const SKIN = '#ffd3b4'
const HAIR = '#f3f5fa'
const HAIR_EDGE = '#c6ccd8'
const INK = '#0b2a1d'

export function WalterAvatar({ className = 'h-10 w-10', talking = false }: { className?: string; talking?: boolean }) {
  const id = useId().replace(/:/g, '')
  const stache = 'M32 38.200C29.200 36.300 24.600 36.200 22 38.600 20.500 40 18.300 39.900 17.500 38 16.600 41.300 19.900 43.200 23.300 41.800 26.300 40.600 29.600 40.300 32 40.800Z'
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
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
