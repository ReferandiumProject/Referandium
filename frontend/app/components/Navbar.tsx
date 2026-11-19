'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { Brand, buttonClass, cx } from './ui'

const navLinks = [
  { href: '/', label: 'Startups' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/buy', label: 'Buy' },
]

export default function Navbar() {
  const { login, logout, authenticated } = usePrivy()
  const { dbUser } = useUser()
  const pathname = usePathname()
  const router = useRouter()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const displayLabel = dbUser?.email
    ? dbUser.email
    : dbUser?.wallet_address
      ? `${dbUser.wallet_address.slice(0, 4)}...${dbUser.wallet_address.slice(-4)}`
      : ''

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const handleDisconnect = () => {
    logout()
    setDropdownOpen(false)
    setMobileOpen(false)
  }

  const handleListStartup = async () => {
    if (!authenticated) {
      await login()
    }
    router.push('/list')
  }

  const isActive = (href: string) => pathname === href

  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-page items-center gap-8 px-4 sm:px-6">
        <Link href="/" aria-label="Referandium home" className="shrink-0">
          <Brand />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={cx(
                'rounded-md px-2.5 py-1.5 text-sm transition-colors',
                isActive(link.href) ? 'font-medium text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <button onClick={handleListStartup} className={buttonClass('primary', 'sm')}>
            List your startup
          </button>

          {authenticated ? (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                className="flex h-8 max-w-[220px] items-center gap-2 rounded-lg border border-line-strong bg-surface pl-2 pr-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-yes" aria-hidden="true" />
                <span className="truncate">{displayLabel || 'Account'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0 text-faint">
                  <path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>

              {dropdownOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-10 w-52 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
                >
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setDropdownOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-subtle"
                  >
                    Profile
                  </Link>
                  <button
                    role="menuitem"
                    onClick={handleDisconnect}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-no hover:bg-no-soft"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => login()} className={buttonClass('secondary', 'sm')}>
              Sign in
            </button>
          )}
        </div>

        <button
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-subtle md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            {mobileOpen ? (
              <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-line bg-surface px-4 pb-5 pt-2 md:hidden">
          <div className="flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={cx(
                  'border-b border-line py-3 text-[15px]',
                  isActive(link.href) ? 'font-medium text-ink' : 'text-ink-soft',
                )}
              >
                {link.label}
              </Link>
            ))}
            {authenticated && (
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                aria-current={isActive('/profile') ? 'page' : undefined}
                className={cx(
                  'border-b border-line py-3 text-[15px]',
                  isActive('/profile') ? 'font-medium text-ink' : 'text-ink-soft',
                )}
              >
                Profile
              </Link>
            )}
          </div>

          <div className="mt-4 grid gap-2">
            <button
              onClick={() => {
                setMobileOpen(false)
                handleListStartup()
              }}
              className={buttonClass('primary', 'lg', 'w-full')}
            >
              List your startup
            </button>
            {authenticated ? (
              <button onClick={handleDisconnect} className={buttonClass('danger', 'lg', 'w-full')}>
                Sign out
              </button>
            ) : (
              <button
                onClick={() => {
                  setMobileOpen(false)
                  login()
                }}
                className={buttonClass('secondary', 'lg', 'w-full')}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
