// One short encouragement for each score band. The score can be preliminary,
// so avoid implying a change over time or a comparison with other customers.
const PROFILE_TAGLINES = [
  'One step at a time.',
  "You've got this.",
  'Keep going!',
  'Looking good!',
  'Keep it up!',
] as const

export function financialProfileTagline(score: number): string {
  return PROFILE_TAGLINES[Math.min(4, Math.max(0, Math.floor(score / 20)))]
}
