export default function TestBanner() {
  if (process.env.TEST_BANNER_HIDDEN === 'true') {
    return null
  }

  return (
    <div className="bg-ink px-4 py-1.5 text-center text-[13px] text-white/80">
      <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-sun" aria-hidden="true" />
      Test version on Solana devnet. Balances and purchases are not real money.
    </div>
  )
}
