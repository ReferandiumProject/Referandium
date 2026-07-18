import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import AppWalletProvider from './components/AppWalletProvider'
import { UserProvider } from './context/UserContext'
import Navbar from './components/Navbar'
import StartupNavbar from './components/StartupNavbar'
import Footer from './components/Footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Referandium | Prediction Markets on Solana',
  description: 'Trade on real-world outcomes with USDC on Solana. Yes/No prediction markets.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const product = headers().get('x-product')
  const isStartup = product === 'startup'

  return (
    <html lang="en">
      <body className={inter.className} style={{ backgroundColor: '#FFFFFF', color: '#0F172A' }}>
        <AppWalletProvider>
          <UserProvider>
            {isStartup ? <StartupNavbar /> : <Navbar />}
            <main>{children}</main>
            {!isStartup && <Footer />}
          </UserProvider>
        </AppWalletProvider>
      </body>
    </html>
  )
}
