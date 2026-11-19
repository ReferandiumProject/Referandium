import type { Metadata } from 'next'
import { Instrument_Sans, IBM_Plex_Mono } from 'next/font/google'
import '@solana/wallet-adapter-react-ui/styles.css'
import './globals.css'
import AppWalletProvider from './components/AppWalletProvider'
import { UserProvider } from './context/UserContext'
import Navbar from './components/Navbar'
import TestBanner from './components/TestBanner'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Referandium | Startup Sentiment',
  description: 'Back early-stage startups with community votes.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <ErrorBoundary>
          <AppWalletProvider>
            <UserProvider>
              <TestBanner />
              <Navbar />
              <main className="flex-1">{children}</main>
              <Footer />
            </UserProvider>
          </AppWalletProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
