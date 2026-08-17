export default function TestBanner() {
  if (process.env.TEST_BANNER_HIDDEN === 'true') {
    return null
  }

  return (
    <div className="border-b border-[#E5E7EB] bg-[#F3F4F6] px-4 py-1.5 text-center text-xs text-[#4B5563]">
      This is a test version. It runs on a test network, and all balances and purchases are not real money.
    </div>
  )
}
