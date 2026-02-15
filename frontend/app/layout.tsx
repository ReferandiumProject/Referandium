import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppWalletProvider from './components/AppWalletProvider'
import { LanguageProvider } from './context/LanguageContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://aesthetic-gecko-d62bc6.netlify.app'),
  title: 'Referandium | Policy Prescription Market',
  description: "Don't just predict the future, prescribe it. Join the decentralized policy prescription market on Solana.",
  openGraph: {
    type: 'website',
    siteName: 'Referandium',
    title: 'Referandium | Policy Prescription Market',
    description: "Don't just predict the future, prescribe it. Join the decentralized policy prescription market on Solana.",
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Referandium | Policy Prescription Market',
    description: "Don't just predict the future, prescribe it. Join the decentralized policy prescription market on Solana.",
    images: ['/og-default.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LanguageProvider>
          <AppWalletProvider>
            {children}
          </AppWalletProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
