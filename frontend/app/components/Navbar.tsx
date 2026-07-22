'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'
import { useUser } from '../context/UserContext'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const { login, logout, authenticated, getAccessToken } = usePrivy()
  const { dbUser } = useUser()
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!authenticated) {
      setIsAdmin(false)
      return
    }

    let cancelled = false
    async function checkAdmin() {
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch('/api/admin/whoami', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setIsAdmin(!!json.isAdmin)
      } catch {
        // ignore
      }
    }

    checkAdmin()
    return () => { cancelled = true }
  }, [authenticated])

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
      borderBottom: '1px solid #E5E7EB',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
          <div style={{ width: '32px', height: '32px', backgroundColor: '#3B82F6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontWeight: '700', fontSize: '16px' }}>R</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '18px', color: '#111827', letterSpacing: '-0.02em' }}>Referandium</span>
        </Link>

        {/* Nav Links (desktop) */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '32px' }}>
          <Link href="/markets" style={{ color: pathname === '/markets' ? '#3B82F6' : '#6B7280', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Markets
          </Link>
          <a href="https://startup.referandium.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Startups
          </a>
          {authenticated && (
            <Link href="/profile" style={{ color: pathname === '/profile' ? '#3B82F6' : '#6B7280', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
              Profile
            </Link>
          )}
          <Link href="/docs" style={{ color: '#6B7280', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Docs
          </Link>
        </div>

        {/* Right side (desktop) */}
        <div className="hidden md:flex" style={{ alignItems: 'center', gap: '12px' }}>
          {isAdmin && (
            <Link href="/admin" style={{ textDecoration: 'none', fontSize: '12px', color: '#6B7280', fontWeight: '500' }}>
              Admin
            </Link>
          )}
          <Link href="/create" style={{
            backgroundColor: '#3B82F6',
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
                border: '1px solid #E5E7EB',
                color: '#111827',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                height: '36px',
                padding: '0 12px',
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F9FAFB' }}
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
                  border: '1px solid #E5E7EB',
                  color: '#111827',
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
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F9FAFB' }}
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
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(17,24,39,0.12)',
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
                      color: '#111827',
                      backgroundColor: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      borderBottom: '1px solid #E5E7EB',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F9FAFB' }}
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
                      color: '#EF4444',
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
            border: '1px solid #E5E7EB',
            backgroundColor: 'white',
            cursor: 'pointer',
          }}
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
        <div
          id="mobile-menu"
          aria-label="Mobile menu"
          className="flex flex-col md:hidden"
          style={{
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E5E7EB',
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
                color: '#6B7280',
              }}
            >
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
              {displayLabel}
            </div>
          )}

          <Link
            href="/markets"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: pathname === '/markets' ? '#3B82F6' : '#111827' }}
          >
            Markets
          </Link>
          <a
            href="https://startup.referandium.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#111827' }}
          >
            Startups
          </a>
          {authenticated && (
            <Link
              href="/profile"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: pathname === '/profile' ? '#3B82F6' : '#111827' }}
            >
              Profile
            </Link>
          )}
          <Link
            href="/docs"
            onClick={() => setMobileOpen(false)}
            style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#111827' }}
          >
            Docs
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              style={{ padding: '12px 0', fontSize: '15px', fontWeight: 500, textDecoration: 'none', color: '#6B7280' }}
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
                border: '1px solid #E5E7EB',
                color: '#111827',
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
                  border: '1px solid #E5E7EB',
                  color: '#111827',
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
                  border: '1px solid #E5E7EB',
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
