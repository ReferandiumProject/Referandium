'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'

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

  const linkClass = (href: string) =>
    `text-[14px] font-medium no-underline transition-colors duration-150 ${
      pathname === href ? 'text-[#3B82F6]' : 'text-[#6B7280] hover:text-[#111827]'
    }`

  return (
    <nav className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#3B82F6]">
            <span className="text-base font-bold text-white">R</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-[#111827]">
            Referandium
          </span>
        </Link>

        {/* Nav Links (desktop) */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side (desktop) */}
        <div className="hidden items-center gap-3 md:flex">
          <button
            onClick={handleListStartup}
            className="rounded-lg bg-[#3B82F6] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-600"
          >
            List your startup
          </button>

          {authenticated ? (
            <>
              <Link
                href="/profile"
                className={`text-[14px] font-medium transition-colors duration-150 ${
                  pathname === '/profile' ? 'text-[#3B82F6]' : 'text-[#6B7280] hover:text-[#111827]'
                }`}
              >
                Profile
              </Link>
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-[13px] font-medium text-[#111827] transition-colors hover:bg-[#F9FAFB]"
                >
                  <span className="h-2 w-2 rounded-full bg-[#10B981]" />
                  {displayLabel}
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-[42px] min-w-[160px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-md">
                    <button
                      onClick={handleDisconnect}
                      className="block w-full px-4 py-2.5 text-left text-[13px] font-medium text-[#EF4444] transition-colors hover:bg-[#F9FAFB]"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={() => login()}
              className="rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-[13px] font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB]"
            >
              Sign In
            </button>
          )}
        </div>

        {/* Hamburger (mobile) */}
        <button
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white md:hidden"
        >
          {mobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="flex flex-col border-t border-[#E5E7EB] bg-white px-6 py-4 md:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`py-3 text-[15px] font-medium ${
                pathname === link.href ? 'text-[#3B82F6]' : 'text-[#111827]'
              }`}
            >
              {link.label}
            </Link>
          ))}

          <button
            onClick={() => {
              setMobileOpen(false)
              handleListStartup()
            }}
            className="mt-3 rounded-lg bg-[#3B82F6] px-4 py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-blue-600"
          >
            List your startup
          </button>

          {authenticated ? (
            <>
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className={`py-3 text-[15px] font-medium ${
                  pathname === '/profile' ? 'text-[#3B82F6]' : 'text-[#111827]'
                }`}
              >
                Profile
              </Link>
              <button
                onClick={handleDisconnect}
                className="mt-1 rounded-lg border border-[#E5E7EB] px-4 py-3 text-left text-[15px] font-medium text-[#EF4444] transition-colors hover:bg-[#F9FAFB]"
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMobileOpen(false)
                login()
              }}
              className="mt-3 rounded-lg border border-[#E5E7EB] px-4 py-3 text-[15px] font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB]"
            >
              Sign In
            </button>
          )}
        </div>
      )}
    </nav>
  )
}
