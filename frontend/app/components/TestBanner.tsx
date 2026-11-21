import Link from 'next/link'

// Site-wide project-status notice. Always shown: the project is no longer
// developed, and every visitor needs to know the data here is not real.
export default function TestBanner() {
  return (
    <div role="note" className="bg-ink px-4 py-2 text-center text-[13px] leading-snug text-white/85">
      <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-sun" aria-hidden="true" />
      <strong className="font-semibold text-white">This project is no longer being developed.</strong>{' '}
      It was left at its test stage: the startups, votes and balances here are test data, not real
      companies or real money.{' '}
      <Link href="/about#status" className="whitespace-nowrap font-medium text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">
        Read more
      </Link>
    </div>
  )
}
