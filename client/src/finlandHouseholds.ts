// Verified against Statistics Finland, PXWeb StatFin/rtp (accessed 2026-11-14).
// Table 11qp, 2025: sector S14 (households), debtor sector S0 (total),
// information rtp-K (stocks, EUR millions); instruments F0, F2 and F52.
// Table 129g: sector S14, information F4_B6N (indebtedness ratio, %),
// quarters 2025Q2 and 2026Q2. These are NATIONAL AGGREGATES, not peer data.
export const householdSnapshot = {
  financialAssets: {
    year: '2025',
    totalMillionsEur: 436871,
    cashAndDepositsMillionsEur: 131302,
    mutualFundsMillionsEur: 54781,
    source: 'https://pxdata.stat.fi/PXWeb/pxweb/en/StatFin/StatFin__rtp/11qp.px/',
  },
  debt: {
    quarter: '2026Q2',
    ratioPercent: 117.6,
    previousQuarter: '2025Q2',
    previousRatioPercent: 120.2,
    source: 'https://pxdata.stat.fi/PXWeb/pxweb/en/StatFin/StatFin__rtp/129g.px/',
  },
} as const

const oneDecimal = (value: number) => Math.round(value * 10) / 10

export function householdFacts() {
  const { financialAssets: assets, debt } = householdSnapshot
  return {
    cashSharePercent: oneDecimal(assets.cashAndDepositsMillionsEur / assets.totalMillionsEur * 100),
    fundSharePercent: oneDecimal(assets.mutualFundsMillionsEur / assets.totalMillionsEur * 100),
    cashToFundRatio: oneDecimal(assets.cashAndDepositsMillionsEur / assets.mutualFundsMillionsEur),
    debtRatioChangePoints: oneDecimal(debt.ratioPercent - debt.previousRatioPercent),
  }
}
