'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Animates a number from its previous value (0 on first render) to `value`.
 * Display only: the final frame always renders `format(value)` exactly.
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  // Start at 0 so the first frame never flashes the final value before counting.
  const [shown, setShown] = useState(0)
  const fromRef = useRef(0)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(value)) {
      setShown(value)
      return
    }
    const from = fromRef.current
    fromRef.current = value
    if (from === value || prefersReducedMotion()) {
      setShown(value)
      return
    }
    if (from !== 0) setBump((b) => b + 1)
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(t >= 1 ? value : from + (value - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  const display = shown === value ? format(value) : format(Math.round(shown))
  return (
    <span key={bump} className={cx('num inline-block', bump > 0 && 'animate-pop', className)}>
      {display}
    </span>
  )
}

/** Pulsing "live" indicator. */
export function LiveDot({ className, tone = 'yes' }: { className?: string; tone?: 'yes' | 'accent' }) {
  const color = tone === 'yes' ? 'bg-yes' : 'bg-accent'
  return (
    <span className={cx('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden="true">
      <span className={cx('absolute inset-0 rounded-full animate-live-ring', color)} />
      <span className={cx('relative h-2 w-2 rounded-full', color)} />
    </span>
  )
}

/** Segmented control with an indicator that slides to the active option. */
export function Segmented<K extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: K
  onChange: (key: K) => void
  options: { key: K; label: ReactNode; count?: number }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>('[aria-selected="true"]')
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(wrap)
    return () => ro?.disconnect()
  }, [value, options.length])

  return (
    <div
      ref={wrapRef}
      role="tablist"
      className={cx('relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-subtle p-1', className)}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute bottom-1 top-1 rounded-lg bg-surface shadow-[0_1px_3px_rgb(27_24_56/0.1)] transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cx(
              'relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-lg font-medium transition-colors duration-200',
              size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3.5 text-sm',
              active ? 'text-ink' : 'text-muted hover:text-ink',
              !pill && active && 'bg-surface',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cx(
                  'num rounded-md px-1.5 text-xs transition-colors',
                  active ? 'bg-accent-soft text-accent' : 'text-faint',
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
