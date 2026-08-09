import Link from 'next/link'

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 text-[#111827] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center sm:mb-14">
          <h1 className="text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">
            About Referandium
          </h1>
          <p className="mt-4 text-base text-[#6B7280]">
            The thinking behind the platform, not the step-by-step mechanics.
          </p>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Validation comes before money
            </h2>
            <p className="mt-4 text-[#6B7280]">
              On most platforms, a startup raises capital first and the market finds out later whether anyone wanted the thing. That is the conventional order: money, then evidence of demand.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Referandium inverts it. A startup cannot raise any money until a crowd has already shown support, and that first stage costs participants nothing. The question is not whether the founder can sell the idea to a few backers, but whether the idea can win over a crowd before a single dollar is at stake.
            </p>
            <p className="mt-4 text-[#6B7280]">
              This is not a tweak to the usual model. It is a different sequence: signal first, capital second. For the mechanics of how that sequence works in practice, see <Link href="/how-it-works" className="font-medium text-[#3B82F6] hover:text-blue-600">How it works</Link>.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Why voting is free
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Charging for the validation stage would select for people with money rather than people with judgment, and it would turn an opinion into a purchase. We want the signal to come from conviction, not from spending power.
            </p>
            <p className="mt-4 text-[#6B7280]">
              That is why everyone receives the same daily allowance of voting tokens. They cannot be bought, sold, transferred, or converted into anything else. They have no monetary value, and a user cannot lose money by using them. They measure one thing: the attention and conviction of the people participating.
            </p>
            <p className="mt-4 text-[#6B7280]">
              A free validation stage also means the risk of participation is not financial. The cost, such as it is, is the time and care it takes to form an opinion.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Why rejection counts
            </h2>
            <p className="mt-4 text-[#6B7280]">
              A startup progresses on net support: the difference between the votes that back it and the votes that reject it. Opposition genuinely subtracts. Without that, a validation stage measures popularity, not judgment. A project that inspires strong disagreement would look the same as one that simply went unnoticed.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Sentiment also needs to be reversible. Anyone can change their mind at any time, including moving support away from one startup and onto another. Sentiment that cannot be withdrawn is not sentiment; it is a one-way ratchet. The ability to revise keeps the signal honest as new information appears.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Why the price moves
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Once a raise opens, the price is not fixed. It rises as people buy and falls as people sell. This is by design. Earlier support is rewarded with a lower price because it carries more risk — at that point far less is known about whether the raise will complete.
            </p>
            <p className="mt-4 text-[#6B7280]">
              That lower entry price is not a bonus or a promotion. It is the fair reflection of a risk trade: earlier participants accept more uncertainty, so they pay less per unit. Later participants have more information but pay more. The curve simply encodes that relationship.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              What the platform charges
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Listing a startup costs 8 USDC. During a raise, the platform takes 1% on each purchase and 1% on each sale. There are no other fees.
            </p>
            <p className="mt-4 text-[#6B7280]">
              We state this plainly because vagueness about fees is a warning sign on any platform that handles money. The list fee exists to discourage spam listings. The purchase and sale fees are the platform's revenue during a raise. No hidden charges, no tiered plans, and no percentage of the raise itself is taken from the startup.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Honest limits
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Backing a startup on Referandium is not an investment product and carries no guarantee of return. Participants can lose some or all of the funds they put in. That is simply the nature of early-stage support.
            </p>
            <p className="mt-4 text-[#6B7280]">
              During a raise, selling returns funds at the current price, which may be lower than what was paid. The market price can go down as well as up while the raise is open.
            </p>
            <p className="mt-4 text-[#6B7280]">
              When a raise completes, the price drops substantially, because part of the pool goes to the startup and the reserve supporting the price ends. Anyone buying late in the raise is most exposed to that drop, because they paid a higher price with less potential recovery.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Finally, community validation reflects the opinions of the people who participated. It is not a substitute for diligence, and it is not a prediction of whether the startup will succeed. It is one signal — an important one, but not the only one.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Current status
            </h2>
            <p className="mt-4 text-[#6B7280]">
              The platform currently runs on Solana&apos;s devnet for testing. Listing a startup, voting, and capital raises all work today. On-chain token issuance for startups that complete a raise is still in development.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
