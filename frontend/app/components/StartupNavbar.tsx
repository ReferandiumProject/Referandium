'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/', label: 'Markets' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/list', label: 'List a Startup' },
  { href: '/profile', label: 'Portfolio' },
]

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (pathname === `/startups${href === '/' ? '' : href}`) return true
  return false
}

export default function StartupNavbar() {
  const { login, logout, authenticated } = usePrivy()
  const { dbUser } = useUser()
  const pathname = usePathname() ?? ''

  const [dropdownOpen, setDropdownOpen] = useState(false)
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

  const handleDisconnect = () => {
    logout()
    setDropdownOpen(false)
  }

  return (
    <nav style={{
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #E5E5E5',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '0 24px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: '#0A0A0A',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '16px' }}>S</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '18px', color: '#0A0A0A', letterSpacing: '-0.02em' }}>
            Startup Sentiment
          </span>
        </Link>

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[14px] font-medium no-underline transition-colors duration-150 ${isActive(pathname, link.href) ? 'text-startup' : 'text-[#6B6B6B]'}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {!authenticated ? (
            <button
              onClick={() => login()}
              className="bg-startup text-white border-none rounded-lg text-[13px] font-medium h-9 px-4 cursor-pointer transition-colors duration-150 hover:bg-startup-dark"
            >
              Sign In
            </button>
          ) : (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="bg-white border border-startup text-[#0A0A0A] rounded-lg text-[13px] font-medium h-9 px-3 cursor-pointer flex items-center gap-1.5 transition-colors duration-150 hover:bg-[#FAFAFA]"
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                {displayLabel}
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '42px',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #E5E5E5',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(10,10,10,0.12)',
                  minWidth: '160px',
                  overflow: 'hidden',
                  zIndex: 100,
                }}>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#0A0A0A',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FAFAFA' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
