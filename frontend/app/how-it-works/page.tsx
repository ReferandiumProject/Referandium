import Link from 'next/link'

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 text-[#111827] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center sm:mb-14">
          <h1 className="text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">
            How Referandium works
          </h1>
          <p className="mt-4 text-base text-[#6B7280]">
            A three-stage path from community validation to on-chain funding.
          </p>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3B82F6] text-sm font-bold text-white">
                1
              </span>
              <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
                Validation — live now
              </h2>
            </div>
            <p className="mt-4 text-[#6B7280]">
              Founders list a startup and set a vote threshold: the net number
              of votes the community must show before the startup can move on.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Everyone who signs up receives 100 free voting tokens every day.
              You spend them voting <strong>YES</strong> on startups you believe
              in, or <strong>NO</strong> on ones you think should not advance. Net
              votes equal YES minus NO, so genuine disagreement genuinely holds a
              startup back.
            </p>
            <p className="mt-4 text-[#6B7280]">
              These tokens are not money. They cannot be bought, sold, or
              withdrawn. They have no monetary value, and you cannot lose money
              by voting. They are simply a way to express and signal opinion.
            </p>
            <p className="mt-4 text-[#6B7280]">
              You can change your mind freely: flip a YES position to NO or vice
              versa, withdraw votes from a startup entirely, or move them to a
              different startup. The 100 daily tokens expire at the end of each
              day if you do not use them, but votes already deployed stay in
              place and continue to count.
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Browse startups
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981] text-sm font-bold text-white">
                2
              </span>
              <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
                Raising — live now
              </h2>
            </div>
            <p className="mt-4 text-[#6B7280]">
              When a startup reaches its vote threshold, voting closes permanently
              and a capital raise opens. This is the first point at which real
              money enters — and only into startups the community has already
              validated.
            </p>
            <p className="mt-4 text-[#6B7280]">
              The votes you deployed on a startup that reaches its threshold are
              consumed as part of the validation process. They are not refunded,
              because they have already served their purpose: proving the idea
              has real community support. This is how the model works, not a
              penalty.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Anyone can buy into the raise using USDC from their platform balance.
              The price rises as more is bought and falls when people sell. Buyers
              hold tokens representing their stake in that raise, and can sell back
              at any time while the raise is open — but selling returns USDC at
              the current price, which may be lower than what was originally paid.
              There is no guaranteed exit at cost.
            </p>
            <p className="mt-4 text-[#6B7280]">
              A 1% fee applies to each buy and each sell. The raise completes when
              it reaches the startup&apos;s capital target.
            </p>
            <div className="mt-4 rounded-lg border border-[#F59E0B]/30 bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
              When the raise completes, a portion of the pool — roughly a third —
              is paid out to the startup, and the virtual reserve that supported
              the price during the raise ends. Both of these cause the price to
              drop substantially at that moment. Anyone buying late in the raise
              is the most exposed to this drop.
            </div>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#8B5CF6] text-sm font-bold text-white">
                3
              </span>
              <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
                Token — coming soon
              </h2>
            </div>
            <p className="mt-4 text-[#6B7280]">
              When a raise completes, the startup will graduate. A real token
              will be issued on Solana, the startup will receive its share of
              the raised capital, and the remainder will become tradeable
              liquidity.
            </p>
            <p className="mt-4 text-[#6B7280]">
              This stage depends on a raise completing successfully. There are
              no guaranteed outcomes, and participation in earlier voting does
              not grant any allocation, priority, discount, or financial return.
            </p>
            <p className="mt-4 inline-flex rounded-lg bg-[#F3F4F6] px-3 py-1 text-sm font-medium text-[#6B7280]">
              Not available yet
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              For founders
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Listing a startup costs 8 USDC, charged from your platform balance.
              You choose your own vote threshold and capital target.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[#6B7280]">
              <li>
                A higher vote threshold means a longer, harder validation
                period, but a stronger signal when you reach it.
              </li>
              <li>
                A lower threshold lets you move faster, but with less proof of
                community support.
              </li>
              <li>
                The capital target determines when the raise completes and shapes
                the market&apos;s depth. It cannot be changed once the raise has
                started.
              </li>
            </ul>
            <div className="mt-6">
              <Link
                href="/list"
                className="inline-flex rounded-lg bg-[#3B82F6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
              >
                List your startup
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
