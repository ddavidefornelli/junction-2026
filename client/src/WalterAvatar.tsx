// Walter's profile picture: a drawn portrait in the app's own colours, so it
// stays sharp at any size and needs no image file. While `talking`, his mouth
// moves and a ring pulses around him.
export function WalterAvatar({ className = 'h-10 w-10', talking = false }: { className?: string; talking?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 rounded-full ${talking ? 'walter-talking' : ''} ${className}`}>
      <defs>
        <clipPath id="walter-frame">
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <g clipPath="url(#walter-frame)">
        <rect width="64" height="64" fill="#d6e4f2" />
        {/* jacket, shirt and bow tie */}
        <path d="M6 64c0-11 11-17 26-17s26 6 26 17z" fill="#0a2540" />
        <path d="M24 47.5 32 58l8-10.5c-2.500-.9-5.200-1.300-8-1.300s-5.500.4-8 1.300z" fill="#fff" />
        <path d="M32 50.500 26.500 47.500v6zM32 50.500l5.500-3v6z" fill="#0b7a4b" />
        <circle cx="32" cy="50.500" r="1.400" fill="#085c39" />
        {/* neck, ears, head */}
        <rect x="27.500" y="39" width="9" height="9" rx="3" fill="#e3b48f" />
        <circle cx="18.800" cy="30" r="3" fill="#eebf9b" />
        <circle cx="45.200" cy="30" r="3" fill="#eebf9b" />
        <ellipse cx="32" cy="29" rx="13" ry="15" fill="#f4cba8" />
        {/* hair: thin on top, fuller at the sides */}
        <path d="M19.300 27c-1.800-7 2.700-14.500 12.700-14.500S46.500 20 44.700 27c-.6-4.500-2.200-7.200-4.200-8.500-2.300 1.300-5.300 1.900-8.500 1.900s-6.200-.6-8.500-1.900c-2 1.300-3.600 4-4.200 8.500z" fill="#c4cad3" />
        {/* eyes and glasses */}
        <circle cx="26.300" cy="29.500" r="1.300" fill="#0a2540" />
        <circle cx="37.700" cy="29.500" r="1.300" fill="#0a2540" />
        <g fill="#fff" fillOpacity=".3" stroke="#0a2540" strokeWidth="1.500">
          <circle cx="26.300" cy="29.500" r="4.700" />
          <circle cx="37.700" cy="29.500" r="4.700" />
        </g>
        <path d="M31 29.500h2M21.600 29.500h-2.600M42.400 29.500h2.600" stroke="#0a2540" strokeWidth="1.500" strokeLinecap="round" />
        {/* moustache and smile */}
        <path d="M32 35.500c-2.200-1.800-5.800-1.500-7.500 1.400 2.600 1 5.500.9 7.500-.4 2 1.300 4.900 1.400 7.500.4-1.700-2.900-5.300-3.200-7.500-1.400z" fill="#aab1bc" />
        {talking ? (
          <ellipse className="walter-mouth" cx="32" cy="39.600" rx="2.800" ry="1.800" fill="#7a3b2e" />
        ) : (
          <path d="M28.800 39.200c2 1.500 4.400 1.500 6.400 0" fill="none" stroke="#b5785a" strokeWidth="1.300" strokeLinecap="round" />
        )}
      </g>
    </svg>
  )
}
