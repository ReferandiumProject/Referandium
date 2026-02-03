import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppWalletProvider from './components/AppWalletProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Referandium - Policy Prescription Market',
  description: 'The world\'s first policy prescription market. Vote with your conviction and join the community hedge fund on Solana.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppWalletProvider>
          {children}
        </AppWalletProvider>
      </body>
    </html>
  )
}
