'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const STATUS_ID = 'status'
const STATUS_HREF = `/about#${STATUS_ID}`
const FOCUS_EVENT = 'project-status:focus'

/**
 * Link to the project-status notice on the about page. When the visitor is
 * already on /about, a plain hash link does nothing visible (the URL may not
 * change and the box is near the top), so we scroll and highlight it directly.
 */
export function StatusLink({ className, children }: { className?: string; children: ReactNode }) {
  const pathname = usePathname()
  return (
    <Link
      href={STATUS_HREF}
      className={className}
      onClick={(e) => {
        if (pathname === '/about') {
          e.preventDefault()
          window.history.replaceState(null, '', STATUS_HREF)
          window.dispatchEvent(new Event(FOCUS_EVENT))
        }
      }}
    >
      {children}
    </Link>
  )
}

/** The status box. Scrolls into view and flashes when targeted. */
export function StatusSection({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [flash, setFlash] = useState(0)

  useEffect(() => {
    const focus = () => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      ref.current?.focus({ preventScroll: true })
      setFlash((n) => n + 1)
    }
    if (window.location.hash === `#${STATUS_ID}`) {
      // Wait a frame so the page-enter animation has laid the box out.
      requestAnimationFrame(focus)
    }
    window.addEventListener(FOCUS_EVENT, focus)
    window.addEventListener('hashchange', focus)
    return () => {
      window.removeEventListener(FOCUS_EVENT, focus)
      window.removeEventListener('hashchange', focus)
    }
  }, [])

  return (
    <section
      ref={ref}
      id={STATUS_ID}
      tabIndex={-1}
      aria-labelledby="status-title"
      className={className}
    >
      {flash > 0 && (
        <span
          key={flash}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] animate-status-flash"
        />
      )}
      {children}
    </section>
  )
}
