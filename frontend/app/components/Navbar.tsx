'use client'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { usePathname } from 'next/navigation'

const ADMIN_WALLETS = [
  'PanbgtcTiZ2HasCT9CC94nUBwUx55uH8YDmZk6587da',
  '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP'
]

export default function Navbar() {
  const { publicKey, connected } = useWallet()
  const pathname = usePathname()
  const isAdmin = connected && publicKey && ADMIN_WALLETS.includes(publicKey.toBase58())

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
            <Link href="/admin" className="text-xs text-slate-400 hover:text-slate-600" style={{ textDecoration: 'none' }}>
              Admin
            </Link>
          )}
          <Link href="/create" style={{
            backgroundColor: '#2563EB',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            + Create Market
          </Link>
          <WalletMultiButton style={{
            backgroundColor: 'transparent',
            border: '1px solid #E2E8F0',
            color: '#0F172A',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            height: '36px'
          }} />
        </div>

      </div>
    </nav>
  )
}
