import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About | Referandium',
  description:
    'What Referandium is, how it works, and what tokens on the platform do and do not represent.',
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 text-slate-900 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-700 sm:mb-12">
          This is a test version running on a test network. Balances are not real money.
        </div>

        <div className="mb-12 text-center sm:mb-16">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            About Referandium
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Referandium lets a community decide which early-stage startups deserve capital, then lets that same community back them on a bonding curve until they graduate as real, on-chain tokens.
          </p>
        </div>

        <div className="space-y-8 sm:space-y-10">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              How it works
            </h2>
            <p className="mt-4 text-slate-600">
              Anyone can list a startup for a flat fee; there is no approval gate.
            </p>
            <div className="mt-6 space-y-6 text-slate-600">
              <div>
                <h3 className="font-semibold text-slate-900">
                  1. Free daily votes decide what deserves capital.
                </h3>
                <p className="mt-2">
                  Everyone gets the same daily allowance of voting tokens. They cost nothing, cannot be bought, and cannot be transferred. There is no way to pay for influence. That keeps the signal honest and separates voting from a prediction market.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  2. Validated startups raise on a bonding curve in USDC.
                </h3>
                <p className="mt-2">
                  Once a startup has enough net support, it opens a raise. The price is set by the curve: it rises as people buy and falls as they sell. Nobody sets it, and it is the same for everyone at any moment.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  3. A successful raise graduates to an on-chain token with permanently locked liquidity.
                </h3>
                <p className="mt-2">
                  The startup receives capital, the curve closes, and a real token is issued on Solana.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              What happens at graduation
            </h2>
            <p className="mt-4 text-slate-600">
              The founder receives one third of the raise. Two thirds become liquidity for the new token. The liquidity-pool tokens are then burned, which means that liquidity can never be withdrawn — by anyone, including the platform. It is locked forever.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">
              What holders get, and what they do not
            </h2>
            <div className="mt-6 space-y-4 text-slate-600">
              <p>
                <span className="font-semibold text-slate-900">A token, not the company.</span>{' '}
                Buying on the curve buys a token. It does not give you ownership, control, or any claim on the startup&apos;s assets or revenue.
              </p>
              <p>
                <span className="font-semibold text-slate-900">No guaranteed outcome.</span>{' '}
                Nothing here promises a return. A token&apos;s price can fall to nothing. Founders receive capital and holders receive tokens; neither is a guarantee of anything.
              </p>
              <p>
                <span className="font-semibold text-slate-900">Voting is free.</span> It costs
                nothing. Your daily allowance is fixed, no money is involved, and there is no way
                to buy influence.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Contact</h2>
            <p className="mt-4 text-slate-600">
              Questions? Email us at{' '}
              <a
                href="mailto:info@referandium.com"
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                info@referandium.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
