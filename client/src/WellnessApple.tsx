// Five illustrated stages, from a bruised apple to a fresh one. Drawn locally as
// SVG so the score remains visual even without an external image service.
const stages = [
  { skin: '#827151', shine: '#a39370', leaf: '#77784a', spot: '#574c38' },
  { skin: '#aa9d65', shine: '#c4b779', leaf: '#869b58', spot: '#76684b' },
  { skin: '#b6c679', shine: '#d5dd9a', leaf: '#86ae5f', spot: '#929360' },
  { skin: '#8ec771', shine: '#b5db91', leaf: '#419a58', spot: '#71a86a' },
  { skin: '#39a65f', shine: '#83cf8a', leaf: '#207f44', spot: '#39a65f' },
] as const

const GOLDEN = { skin: '#e8b72f', shine: '#fff0a6', leaf: '#3e8b48', spot: '#b77b12' }

export function WellnessApple({ stage, golden = false, className = '' }: { stage: number | null; golden?: boolean; className?: string }) {
  const color = golden ? GOLDEN : stage === null ? { skin: '#d7e6d7', shine: '#edf5e9', leaf: '#a8c9ae', spot: '#d7e6d7' } : stages[stage]
  const description = golden
    ? 'Golden apple: financial profile score 100 out of 100'
    : stage === null
      ? 'Apple: score not available'
      : `Apple wellness stage ${stage + 1} of 5`
  return (
    <svg viewBox="0 0 220 220" className={className} role="img" aria-label={description}>
      <path d="M110 72 C110 53 112 38 125 29" fill="none" stroke="#6d573c" strokeWidth="7" strokeLinecap="round" />
      <path d="M119 51 C132 28 152 25 169 32 C161 52 140 62 119 51Z" fill={color.leaf} />
      <path d="M110 75 C88 58 63 59 50 77 C30 102 39 146 58 174 C72 195 91 194 110 183 C129 195 148 196 162 175 C181 147 190 102 170 77 C157 59 132 58 110 75Z" fill={color.skin} stroke="#365d40" strokeWidth="3" />
      <path d="M77 81 C55 92 53 116 60 135" fill="none" stroke={color.shine} strokeWidth="11" strokeLinecap="round" opacity=".8" />
      <path d="M111 79 C103 72 95 70 86 72" fill="none" stroke={color.shine} strokeWidth="3" strokeLinecap="round" />
      {stage !== null && stage < 3 && (
        <g fill={color.spot} opacity={stage === 0 ? '.92' : stage === 1 ? '.7' : '.42'}>
          <ellipse cx="151" cy="119" rx={stage === 0 ? 21 : 14} ry={stage === 0 ? 25 : 17} />
          <ellipse cx="83" cy="151" rx={stage === 0 ? 15 : 10} ry={stage === 0 ? 13 : 8} />
          {stage === 0 && <ellipse cx="105" cy="105" rx="7" ry="6" />}
        </g>
      )}
      {stage !== null && stage >= 3 && (
        <path d="M148 119 C153 116 158 117 162 121" fill="none" stroke={color.spot} strokeWidth="3" strokeLinecap="round" opacity=".55" />
      )}
    </svg>
  )
}
