import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, Notice, buttonClass, cx } from '../components/ui'

function Stage({
  n,
  title,
  status,
  last,
  children,
}: {
  n: number
  title: string
  status: ReactNode
  last?: boolean
  children: ReactNode
}) {
  return (
    <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-5 sm:gap-x-7">
      <div className="flex flex-col items-center">
        <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-sm font-semibold">
          {n}
        </span>
        {!last && <span className="mt-2 w-px flex-1 bg-line-strong" aria-hidden="true" />}
      </div>
      <div className={cx('min-w-0', last ? 'pb-0' : 'pb-14')}>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <h2 className="text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h2>
          {status}
        </div>
        <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft">{children}</div>
      </div>
    </li>
  )
}

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-10 sm:px-6 sm:pt-16">
      <header className="mb-14 max-w-2xl">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[42px]">
          How Referandium works
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Every startup moves through three stages: the community validates it, it raises capital,
          and it graduates to a token on Solana.
        </p>
      </header>

      <ol>
        <Stage n={1} title="Validation" status={<Badge tone="yes" dot>Live</Badge>}>
          <p>
            Founders list a startup and set a vote threshold: the net number of votes the community
            must show before the startup can move on.
          </p>
          <p>
            Everyone who signs up receives 100 free voting tokens every day. You spend them voting{' '}
            <strong className="font-semibold text-ink">yes</strong> on startups you believe in, or{' '}
            <strong className="font-semibold text-ink">no</strong> on ones you think should not
            advance. Net votes equal yes minus no, so genuine disagreement genuinely holds a startup
            back.
          </p>
          <p>
            These tokens are not money. They cannot be bought, sold, or withdrawn. They have no
            monetary value, and you cannot lose money by voting. They are simply a way to express
            and signal opinion.
          </p>
          <p>
            You can change your mind freely: switch a yes position to no or vice versa, withdraw
            votes from a startup entirely, or move them to a different startup. The 100 daily tokens
            expire at the end of each day if you do not use them, but votes already deployed stay in
            place and continue to count.
          </p>
          <div className="pt-1">
            <Link href="/" className={buttonClass('primary', 'md')}>
              Browse startups
            </Link>
          </div>
        </Stage>

        <Stage n={2} title="Raising" status={<Badge tone="yes" dot>Live</Badge>}>
          <p>
            When a startup reaches its vote threshold, voting closes permanently and a capital raise
            opens. This is the first point at which real money enters, and only into startups the
            community has already validated.
          </p>
          <p>
            The votes you deployed on a startup that reaches its threshold are consumed as part of
            the validation process. They are not refunded, because they have already served their
            purpose: proving the idea has real community support. This is how the model works, not a
            penalty.
          </p>
          <p>
            Anyone can buy into the raise using USDC from their platform balance. The price rises as
            more is bought and falls when people sell. Buyers hold tokens representing their stake in
            that raise, and can sell back at any time while the raise is open. Selling returns USDC at
            the current price, which may be lower than what was originally paid. There is no
            guaranteed exit at cost.
          </p>
          <p>
            A 1% fee applies to each buy and each sell. The raise completes when it reaches the
            startup&apos;s capital target.
          </p>
          <Notice tone="warn" title="Expect a price drop when the raise completes">
            Roughly a third of the pool is paid out to the startup, and the virtual reserve that
            supported the price during the raise ends. Both cause the price to drop substantially at
            that moment. Anyone buying late in the raise is the most exposed to this drop.
          </Notice>
        </Stage>

        <Stage n={3} title="Token" status={<Badge>Coming soon</Badge>} last>
          <p>
            When a raise completes, the startup graduates. A real token will be issued on Solana, the
            startup will receive its share of the raised capital, and the remainder will become
            tradeable liquidity.
          </p>
          <p>
            This stage depends on a raise completing successfully. There are no guaranteed outcomes,
            and participation in earlier voting does not grant any allocation, priority, discount, or
            financial return.
          </p>
        </Stage>
      </ol>

      <section className="mt-20 border-t border-line pt-10">
        <h2 className="text-xl font-semibold tracking-tight sm:text-[22px]">For founders</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Listing a startup costs 8 USDC, charged from your platform balance. You choose your own
          vote threshold and capital target.
        </p>
        <dl className="mt-6 divide-y divide-line border-y border-line text-[15px]">
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="font-medium">Higher threshold</dt>
            <dd className="leading-relaxed text-ink-soft">
              A longer, harder validation period, but a stronger signal when you reach it.
            </dd>
          </div>
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="font-medium">Lower threshold</dt>
            <dd className="leading-relaxed text-ink-soft">
              Lets you move faster, but with less proof of community support.
            </dd>
          </div>
          <div className="grid gap-1 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="font-medium">Capital target</dt>
            <dd className="leading-relaxed text-ink-soft">
              Determines when the raise completes and shapes the market&apos;s depth. It cannot be
              changed once the raise has started.
            </dd>
          </div>
        </dl>
        <Link href="/list" className={buttonClass('primary', 'md', 'mt-8')}>
          List your startup
        </Link>
      </section>
    </div>
  )
}
