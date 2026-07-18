'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { usePathname } from 'next/navigation'

const ADMIN_WALLETS = [
  'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da',
  '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP'
]

export default function Navbar() {
  const { login, logout, authenticated } = usePrivy()
  const { dbUser } = useUser()
  const pathname = usePathname()
  const isAdmin = authenticated && dbUser?.wallet_address && ADMIN_WALLETS.includes(dbUser.wallet_address)

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

  const handleCopyAddress = () => {
    if (dbUser?.wallet_address) {
      navigator.clipboard.writeText(dbUser.wallet_address)
      setDropdownOpen(false)
    }
  }

  const handleDisconnect = () => {
    logout()
    setDropdownOpen(false)
    setMobileOpen(false)
  }

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <nav style={{ 
      backgroundColor: '#FFFFFF', 
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: '#2563EB', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '16px' }}>R</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '18px', color: '#0F172A', letterSpacing: '-0.02em' }}>Referandium</span>
        </Link>

        {/* Nav Links (desktop) */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '32px' }}>
          <Link href="/markets" style={{ color: pathname === '/markets' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Markets
          </Link>
          <a href="https://startup.referandium.com" target="_blank" rel="noopener noreferrer" style={{ color: '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Startups
          </a>
          {authenticated && (
            <Link href="/profile" style={{ color: pathname === '/profile' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
              Profile
            </Link>
          )}
          <Link href="/docs" style={{ color: '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Docs
          </Link>
        </div>

        {/* Right side (desktop) */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '12px' }}>
          {isAdmin && (
            <Link href="/admin" style={{ textDecoration: 'none', fontSize: '12px', color: '#94A3B8', fontWeight: '500' }}>
              Admin
            </Link>
          )}
          <Link href="/create" style={{
            backgroundColor: '#2563EB',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            lineHeight: '20px',
          }}>
            + Create Market
          </Link>

          {/* Custom Wallet Button */}
          {!authenticated ? (
            <button
              onClick={() => login()}
              style={{
                backgroundColor: 'white',
                border: '1px solid #E2E8F0',
                color: '#0F172A',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                height: '36px',
                padding: '0 12px',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
            >
              Sign In
            </button>
          ) : (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #E2E8F0',
                  color: '#0F172A',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  height: '36px',
                  padding: '0 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                {displayLabel}
              </button>

              {dropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: '42px',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(15,23,42,0.12)',
                  minWidth: '160px',
                  overflow: 'hidden',
                  zIndex: 100,
                }}>
                  <button
                    onClick={handleCopyAddress}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#0F172A',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    Copy Address
                  </button>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#DC2626',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#FEF2F2' }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white' }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hamburger (mobile) */}
        <button
          id="mobile-menu-button"
          className="flex md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          onClick={() => setMobileOpen((o) => !o)}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
        >
          {mobileOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          aria-label="Mobile menu"
          className="flex flex-col md:hidden"
          style={{
            backgroundColor: '#0A0A0A',
            borderTop: '1px solid #2A2A2A',
            padding: '16px 24px 24px',
            gap: '4px',
          }}
        >
          {authenticated && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 0',
                fontSize: '14px',
                fontWeight: 500,
                color: '#9CA3AF',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
              {displayLabel}
            </div>
          )}

          <Link
            href="/markets"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: pathname === '/markets' ? '#3B82F6' : '#FFFFFF' }}
          >
            Markets
          </Link>
          <a
            href="https://startup.referandium.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#FFFFFF' }}
          >
            Startups
          </a>
          {authenticated && (
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: pathname === '/profile' ? '#3B82F6' : '#FFFFFF' }}
            >
              Profile
            </Link>
          )}
          <Link
            href="/docs"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#FFFFFF' }}
          >
            Docs
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#9CA3AF' }}
            >
              Admin
            </Link>
          )}

          <Link
            href="/create"
            onClick={() => setMobileOpen(false)}
            style={{
              marginTop: '12px',
              backgroundColor: '#3B82F6',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '15px',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            + Create Market
          </Link>

          {!authenticated ? (
            <button
              onClick={() => { login(); setMobileOpen(false) }}
              style={{
                marginTop: '8px',
                backgroundColor: 'transparent',
                border: '1px solid #2A2A2A',
                color: '#FFFFFF',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 16px',
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          ) : (
            <>
              <button
                onClick={handleCopyAddress}
                style={{
                  marginTop: '8px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2A2A2A',
                  color: '#FFFFFF',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 500,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Copy Address
              </button>
              <button
                onClick={handleDisconnect}
                style={{
                  marginTop: '8px',
                  backgroundColor: 'transparent',
                  border: '1px solid #2A2A2A',
                  color: '#EF4444',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 500,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  )
}
