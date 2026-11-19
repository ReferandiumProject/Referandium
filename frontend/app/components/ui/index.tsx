// Shared UI primitives. Pages compose these instead of re-declaring
// colors and spacing, so the whole app reads as one system.

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { forwardRef } from 'react'

export { Spinner } from './Spinner'
export { CountUp, LiveDot, Segmented } from './motion'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'yes' | 'no'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[transform,background-color,box-shadow,border-color,color] duration-200 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:-translate-y-px hover:bg-accent-hover hover:shadow-glow',
  accent: 'bg-accent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:-translate-y-px hover:bg-accent-hover hover:shadow-glow',
  secondary: 'border border-line-strong bg-surface text-ink hover:-translate-y-px hover:border-accent/40 hover:text-accent',
  ghost: 'text-ink-soft hover:bg-subtle hover:text-ink',
  danger: 'border border-no/25 bg-surface text-no hover:bg-no-soft',
  yes: 'bg-yes text-white hover:-translate-y-px hover:bg-yes/90 hover:shadow-[0_8px_24px_-8px_rgb(14_159_110/0.6)]',
  no: 'bg-no text-white hover:-translate-y-px hover:bg-no/90 hover:shadow-[0_8px_24px_-8px_rgb(240_68_97/0.6)]',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-lg px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
}

export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  extra?: string,
) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], extra)
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />
})

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-line bg-surface', className)} {...rest} />
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('p-5', className)} {...rest} />
}

/* ------------------------------------------------------------------ */
/* Page scaffolding                                                    */
/* ------------------------------------------------------------------ */

export function Page({
  className,
  width = 'default',
  children,
}: {
  className?: string
  width?: 'default' | 'narrow' | 'prose'
  children: ReactNode
}) {
  const max = width === 'narrow' ? 'max-w-3xl' : width === 'prose' ? 'max-w-2xl' : 'max-w-page'
  return <div className={cx('mx-auto w-full px-4 pb-20 pt-8 sm:px-6 sm:pt-12', max, className)}>{children}</div>
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cx('mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10', className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="mb-2 text-[13px] font-medium text-muted">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[34px]">{title}</h1>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'accent' | 'yes' | 'no' | 'warn'

const badgeTones: Record<Tone, string> = {
  neutral: 'bg-subtle text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  yes: 'bg-yes-soft text-yes',
  no: 'bg-no-soft text-no',
  warn: 'bg-warn-soft text-warn',
}

export function Badge({
  tone = 'neutral',
  dot,
  className,
  children,
}: {
  tone?: Tone
  dot?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
        badgeTones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

const noticeTones: Record<Tone, string> = {
  neutral: 'border-line bg-subtle text-ink-soft',
  accent: 'border-accent/20 bg-accent-soft text-ink-soft',
  yes: 'border-yes/20 bg-yes-soft text-yes',
  no: 'border-no/20 bg-no-soft text-no',
  warn: 'border-warn/20 bg-warn-soft text-warn',
}

export function Notice({
  tone = 'neutral',
  title,
  className,
  children,
}: {
  tone?: Tone
  title?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <div role={tone === 'no' ? 'alert' : undefined} className={cx('animate-scale-in rounded-xl border px-4 py-3 text-sm', noticeTones[tone], className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cx(title ? 'mt-1 opacity-90' : '')}>{children}</div>}
    </div>
  )
}

const barTones: Record<Tone, string> = {
  neutral: 'bg-ink',
  accent: 'bg-gradient-to-r from-accent to-[#9B7BFF]',
  yes: 'bg-yes',
  no: 'bg-no',
  warn: 'bg-warn',
}

export function Progress({
  value,
  tone = 'accent',
  className,
}: {
  value: number
  tone?: Tone
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-subtle', className)}>
      <div
        className={cx('h-full origin-left animate-grow-x rounded-full transition-[width] duration-700', barTones[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Two-sided YES/NO split bar. */
export function SplitBar({ yes, no, className }: { yes: number; no: number; className?: string }) {
  const total = yes + no
  const yesPct = total > 0 ? (yes / total) * 100 : 0
  return (
    <div className={cx('flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-subtle', className)}>
      {total > 0 && (
        <>
          <div
            className="h-full origin-left animate-grow-x rounded-l-full bg-yes transition-[width] duration-700"
            style={{ width: `${yesPct}%` }}
          />
          <div className="h-full flex-1 origin-right animate-grow-x rounded-r-full bg-no" />
        </>
      )}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('min-w-0', className)}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="num mt-1 truncate text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  )
}

export function KeyValue({
  label,
  children,
  className,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-center justify-between gap-4 py-2 text-sm', className)}>
      <span className="text-muted">{label}</span>
      <span className="num min-w-0 truncate text-right font-medium text-ink">{children}</span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-14 text-center', className)}>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-md', className)} />
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export const inputClass =
  'block w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-faint transition-colors focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(inputClass, 'h-10', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(inputClass, 'min-h-[96px] leading-relaxed', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...rest },
  ref,
) {
  return <select ref={ref} className={cx(inputClass, 'h-10 pr-8', className)} {...rest} />
})

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-no">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Logo({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const style = { width: size, height: size }
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className={cx('shrink-0 rounded-xl border border-line object-cover', className)}
      />
    )
  }
  const palette = [
    'bg-accent-soft text-accent',
    'bg-yes-soft text-yes',
    'bg-no-soft text-no',
    'bg-warn-soft text-warn',
    'bg-[#E3F1FF] text-[#2368C4]',
  ]
  const hue = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length]
  return (
    <div
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.34)) }}
      className={cx('flex shrink-0 items-center justify-center rounded-xl font-display font-semibold', hue, className)}
    >
      {initials(name) || '?'}
    </div>
  )
}

/** Wordmark used in the navbar and footer. */
export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx('group inline-flex items-center gap-2', className)}>
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        aria-hidden="true"
        className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"
      >
        <rect width="26" height="26" rx="8" className="fill-accent" />
        <path d="M8.5 19V7h5.2a3.6 3.6 0 0 1 .7 7.13L18 19" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20.5" cy="6" r="2.5" className="fill-sun" />
      </svg>
      <span className="font-display text-[17px] font-semibold tracking-tight text-ink">Referandium</span>
    </span>
  )
}
