export default function TestBanner() {
  if (process.env.TEST_BANNER_HIDDEN === 'true') {
    return null
  }

  return (
    <div className="bg-ink px-4 py-1.5 text-center text-[13px] text-white/80">
      Test version on Solana devnet. Balances and purchases are not real money.
    </div>
  )
}
