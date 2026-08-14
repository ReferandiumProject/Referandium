// This is the single source of truth for packages that can be purchased
// through /api/stripe/checkout. Both the checkout route and the /buy page
// import from here so the package ids can never drift apart.

export const PURCHASE_PACKAGES = [
  { id: 'listing_1', product: 'listing_pack' as const, credits: 1, amount: 800, label: '1 listing' },
  { id: 'listing_3', product: 'listing_pack' as const, credits: 3, amount: 2400, label: '3 listings' },
  { id: 'listing_5', product: 'listing_pack' as const, credits: 5, amount: 4000, label: '5 listings' },
  { id: 'investment_10', product: 'investment_pack' as const, usdc: 10, amount: 1000, label: 'Add $10' },
  { id: 'investment_25', product: 'investment_pack' as const, usdc: 25, amount: 2500, label: 'Add $25' },
  { id: 'investment_50', product: 'investment_pack' as const, usdc: 50, amount: 5000, label: 'Add $50' },
] as const

export type PurchasePackage = typeof PURCHASE_PACKAGES[number]

export function findPurchasePackage(packageId: unknown): PurchasePackage | undefined {
  if (typeof packageId !== 'string') return undefined
  return (PURCHASE_PACKAGES as readonly PurchasePackage[]).find((p) => p.id === packageId)
}
