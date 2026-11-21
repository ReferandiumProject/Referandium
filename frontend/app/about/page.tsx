import { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'About | Referandium',
  description:
    'What Referandium is, how it works, and what tokens on the platform do and do not represent.',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-10 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <div className="max-w-[62ch] space-y-4 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-12 max-w-2xl">
        <h1 className="text-[36px] font-bold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">
          About Referandium
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Referandium lets a community decide which early-stage startups deserve capital, then lets
          that same community back them on a bonding curve until they graduate as real, on-chain
          tokens.
        </p>
      </header>

      <section
        id="status"
        className="mb-12 scroll-mt-24 rounded-2xl border border-warn/25 bg-warn-soft p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold text-warn">Project status: no longer in development</h2>
        <div className="mt-3 max-w-[62ch] space-y-3 text-[15px] leading-relaxed text-ink-soft">
          <p>
            Referandium is not being developed any further. The site has been left as it was at the
            end of its test stage, so you can still look around and see how the product was meant to
            work.
          </p>
          <p>
            Everything here runs on Solana devnet, a test network. The startups, votes, balances,
            prices and trades you see are test data created during development. They are not real
            companies, and no real money is involved.
          </p>
          <p>Features may stop working at any time, and no new versions are planned.</p>
        </div>
      </section>

      <Section title="How it works">
        <p>Anyone can list a startup for a flat fee; there is no approval gate.</p>
        <ol className="space-y-5">
          <li>
            <p className="font-semibold text-ink">Free daily votes decide what deserves capital.</p>
            <p className="mt-1">
              Everyone gets the same daily allowance of voting tokens. They cost nothing, cannot be
              bought, and cannot be transferred. There is no way to pay for influence. That keeps the
              signal honest and separates voting from a prediction market.
            </p>
          </li>
          <li>
            <p className="font-semibold text-ink">Validated startups raise on a bonding curve in USDC.</p>
            <p className="mt-1">
              Once a startup has enough net support, it opens a raise. The price is set by the curve:
              it rises as people buy and falls as they sell. Nobody sets it, and it is the same for
              everyone at any moment.
            </p>
          </li>
          <li>
            <p className="font-semibold text-ink">
              A successful raise graduates to an on-chain token with permanently locked liquidity.
            </p>
            <p className="mt-1">
              The startup receives capital, the curve closes, and a real token is issued on Solana.
            </p>
          </li>
        </ol>
      </Section>

      <Section title="What happens at graduation">
        <p>
          The founder receives one third of the raise. Two thirds become liquidity for the new token.
          The liquidity-pool tokens are then burned, which means that liquidity can never be
          withdrawn by anyone, including the platform. It is locked forever.
        </p>
      </Section>

      <Section title="What holders get, and what they don't">
        <p>
          <span className="font-semibold text-ink">A token, not the company.</span> Buying on the
          curve buys a token. It does not give you ownership, control, or any claim on the
          startup&apos;s assets or revenue.
        </p>
        <p>
          <span className="font-semibold text-ink">No guaranteed outcome.</span> Nothing here
          promises a return. A token&apos;s price can fall to nothing. Founders receive capital and
          holders receive tokens; neither is a guarantee of anything.
        </p>
        <p>
          <span className="font-semibold text-ink">Voting is free.</span> It costs nothing. Your
          daily allowance is fixed, no money is involved, and there is no way to buy influence.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions? Email{' '}
          <a href="mailto:info@referandium.com" className="font-medium text-accent hover:underline">
            info@referandium.com
          </a>
          .
        </p>
      </Section>
    </div>
  )
}
