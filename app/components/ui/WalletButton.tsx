'use client'

import { useState, useEffect } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

export default function WalletButton() {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <div className="bg-white text-primary px-6 py-2 rounded-lg font-semibold shadow-md">
        Loading...
      </div>
    )
  }

  return (
    <WalletMultiButton className="!bg-white !text-primary hover:!bg-gray-100 !font-semibold !rounded-lg !shadow-md !transition-colors" />
  )
}
