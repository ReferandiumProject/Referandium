'use client'

import { useState, useEffect } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { buttonClass } from '.'

export default function WalletButton() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <span className={buttonClass('secondary', 'md', 'pointer-events-none text-muted')}>
        Loading wallet
      </span>
    )
  }

  return <WalletMultiButton />
}
