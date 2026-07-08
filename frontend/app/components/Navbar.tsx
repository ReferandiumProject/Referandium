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
  }

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

        {/* Nav Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <Link href="/markets" style={{ color: pathname === '/markets' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Markets
          </Link>
          <Link href="/startups" style={{ color: pathname === '/startups' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Startups
          </Link>
          <Link href="/gookies" style={{ color: pathname === '/gookies' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Creators
          </Link>
          {authenticated && (
            <Link href="/profile" style={{ color: pathname === '/profile' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
              Profile
            </Link>
          )}
          <Link href="/docs" style={{ color: '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Docs
          </Link>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

      </div>
    </nav>
  )
}
