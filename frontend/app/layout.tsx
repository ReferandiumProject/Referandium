import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import AppWalletProvider from './components/AppWalletProvider'
import { UserProvider } from './context/UserContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="en">
      <body className={inter.className} style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}>
        <AppWalletProvider>
          <UserProvider>
            <Navbar />
            <main>{children}</main>
            <Footer />
          </UserProvider>
        </AppWalletProvider>
      </body>
    </html>
  )
}
