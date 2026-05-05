'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { usePathname } from 'next/navigation'

const ADMIN_WALLETS = [
  'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da',
  '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP'
]

export default function Navbar() {
  const { publicKey, connected, disconnect } = useWallet()
  const { setVisible } = useWalletModal()
  const pathname = usePathname()
  const isAdmin = connected && publicKey && ADMIN_WALLETS.includes(publicKey.toBase58())

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const shortAddress = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
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
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58())
      setDropdownOpen(false)
    }
  }

  const handleDisconnect = () => {
    disconnect()
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
          <Link href="/gookies" style={{ color: pathname === '/gookies' ? '#2563EB' : '#64748B', textDecoration: 'none', fontSize: '14px', fontWeight: '500' }}>
            Creators
          </Link>
          {connected && (
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
          {!connected ? (
            <button
              onClick={() => setVisible(true)}
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
              Connect Wallet
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
                {shortAddress}
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
                    Disconnect
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
