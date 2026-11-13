const eurFmt = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' })
const dateFmt = new Intl.DateTimeFormat('fi-FI')

export const eur = (n: number | null) => (n == null ? '–' : eurFmt.format(n))

export const signedEur = (n: number) => (n > 0 ? '+' : '') + eurFmt.format(n)

export const date = (iso: string) => dateFmt.format(new Date(iso))

export const percent = (n: number | null) =>
  n == null ? '–' : new Intl.NumberFormat('fi-FI', { style: 'percent', maximumFractionDigits: 1 }).format(n)

// "housing_payment" -> "Housing payment"
export const label = (s: string | null) => {
  if (!s) return '–'
  const t = s.replace(/_/g, ' ')
  return t[0].toUpperCase() + t.slice(1)
}
