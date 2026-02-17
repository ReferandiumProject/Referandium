'use client'

import { useMemo, useEffect } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'

export default function AppWalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), [])

  // Suppress MetaMask/Ethereum errors globally (browser extension auto-detection)
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const msg = (event?.reason?.message || '').toLowerCase();
      if (msg.includes('metamask') || msg.includes('ethereum') || msg.includes('eth_')) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(error) => {
          const msg = error?.message?.toLowerCase() || '';
          // Suppress non-Solana wallet errors (MetaMask, Ethereum, injected provider detection)
          if (msg.includes('metamask') || msg.includes('ethereum') || msg.includes('eth_')) return;
          console.error('Wallet error:', error.message);
        }}
      >
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
