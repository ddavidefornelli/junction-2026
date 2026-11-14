// What a reply sounds like out loud. Text written to be read ("4 723,58 €",
// "2026-11-01", "30.9.2026", "3×") comes out of a voice as symbols and digit
// soup, so before a reply is spoken the amounts, dates and signs are turned
// into the words a person would say, and parts nobody says on the phone
// (sources, addresses) are left out.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// A number as written in the app or by the model: "4 723,58", "4,723.58", "4723.58", "99".
function toNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.') // Finnish decimals
  else s = s.replace(/,/g, '') // English thousands
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// "about 4,700 euros" for big amounts, "99 euros", "14 euros 50".
function euros(n: number): string {
  const sign = n < 0 ? 'minus ' : ''
  const a = Math.abs(n)
  if (a >= 1000) {
    const round = a >= 10000 ? Math.round(a / 1000) * 1000 : Math.round(a / 100) * 100
    return `${sign}${round === a ? '' : 'about '}${round.toLocaleString('en-US')} euros`
  }
  if (a >= 20 || Number.isInteger(a)) {
    const whole = Math.round(a)
    return `${sign}${whole} euro${whole === 1 ? '' : 's'}`
  }
  const whole = Math.floor(a)
  const cents = Math.round((a - whole) * 100)
  return cents ? `${sign}${whole} euros ${cents}` : `${sign}${whole} euros`
}

// After "paid" or "spent" the minus of a payment is already said in words.
const SPENT = /\b(paid|spent|spend|spends|cost|costs|charged|payment of|purchase of)\s*$/i

function amount(all: string, minus: string | undefined, num: string, before: string): string {
  const n = toNumber(num)
  if (n === null) return all
  return euros(minus && !SPENT.test(before) ? -n : n)
}

const NUMBER = String.raw`\d{1,3}(?:[   ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)*`

function day(d: number, m: number, y: number | null, thisYear: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return ''
  return `${d} ${MONTHS[m - 1]}${y && y !== thisYear ? ` ${y}` : ''}`
}

export function spokenForm(text: string, thisYear = new Date().getFullYear()): string {
  let s = text
    // Sources are for reading; nobody reads web addresses down the phone.
    .replace(/\n?\s*Sources?:[\s\S]*$/i, '')
    .replace(/https?:\/\/\S+/g, '')

  // Dates: 2026-11-01, 30.9.2026, 1.11., then months: 2026-07.
  s = s
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (all, y, m, d) => day(+d, +m, +y, thisYear) || all)
    .replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (all, d, m, y) => day(+d, +m, +y, thisYear) || all)
    .replace(/\b(\d{1,2})\.(\d{1,2})\.(?!\d)/g, (all, d, m) => day(+d, +m, null, thisYear) || all)
    .replace(/\b(\d{4})-(\d{2})\b/g, (all, y, m) => (+m >= 1 && +m <= 12 ? `${MONTHS[+m - 1]}${+y !== thisYear ? ` ${y}` : ''}` : all))

  // Amounts: "4 723,58 €", "€99", "-35,49 €", "1 309 € a year", "€/m²".
  s = s
    .replace(/€\s*\/\s*m²/g, 'euros per square metre')
    .replace(/m²/g, 'square metres')
    .replace(new RegExp(String.raw`(?:(?<![\w.,])([−-])\s?)?(${NUMBER})\s?€`, 'g'), (all, minus, num, at, whole) =>
      amount(all, minus, num, whole.slice(0, at)),
    )
    .replace(new RegExp(String.raw`(?:(?<![\w.,])([−-]))?€\s?(${NUMBER})`, 'g'), (all, minus, num, at, whole) =>
      amount(all, minus, num, whole.slice(0, at)),
    )
    .replace(/€/g, 'euros')
    .replace(/\bEUR\b/g, 'euros')

  // Signs a voice reads badly.
  s = s
    .replace(/(\d)\s?(?:×|x\b)/g, '$1 times')
    .replace(/(\d)\s?[–—-]\s?(\d)/g, '$1 to $2')
    .replace(/\s[–—]\s/g, ', ')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/\bi\.e\./gi, 'that is')
    .replace(/\bvs\.?\s/gi, 'versus ')
    .replace(/\s*\(([^()]*)\)/g, ', $1,')
    .replace(/,\s*([.,!?])/g, '$1')

  // Lists and line breaks become sentences.
  s = s
    .replace(/^\s*(?:[-•*]|\d+[.)])\s+/gm, '')
    .replace(/([^.!?:\s])\s*\n+/g, '$1. ')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
  return s
}
