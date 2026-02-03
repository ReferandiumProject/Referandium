'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import Link from 'next/link'
import { TrendingUp, CheckCircle, XCircle, Shield } from 'lucide-react'
import WalletButton from '../components/ui/WalletButton'
import { supabase } from '@/lib/supabaseClient'

const ADMIN_WALLET_ADDRESS = '5vJggeRkrFSZBJw6rZvWNzuRbKTe4g44pQEwaBcyZVBP'

export default function AdminPage() {
  const { publicKey, connected } = useWallet()
  const [isMounted, setIsMounted] = useState(false)
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    pump_fun_link: '',
    image_url: ''
  })
  const [notification, setNotification] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return null
  }

  const isAdmin = connected && publicKey?.toBase58() === ADMIN_WALLET_ADDRESS

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.question.trim()) {
      setNotification({
        type: 'error',
        message: 'Question is required!'
      })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    if (!formData.pump_fun_link.trim()) {
      setNotification({
        type: 'error',
        message: 'Pump.fun link is required!'
      })
      setTimeout(() => setNotification(null), 3000)
      return
    }

    setIsSubmitting(true)

    try {
      const { error } = await supabase
        .from('markets')
        .insert({
          question: formData.question.trim(),
          description: formData.description.trim() || null,
          pump_fun_link: formData.pump_fun_link.trim(),
          image_url: formData.image_url.trim() || null,
          yes_count: 0,
          no_count: 0,
          total_pool: 0
        })

      if (error) throw error

      setNotification({
        type: 'success',
        message: 'Market Created! 🎉'
      })
      setTimeout(() => setNotification(null), 3000)

      setFormData({
        question: '',
        description: '',
        pump_fun_link: '',
        image_url: ''
      })

    } catch (error) {
      console.error('Error creating market:', error)
      setNotification({
        type: 'error',
        message: 'Failed to create market. Please try again.'
      })
      setTimeout(() => setNotification(null), 3000)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-primary text-white shadow-lg">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <TrendingUp size={32} className="font-bold" />
              <h1 className="text-3xl font-bold">Referandium Admin</h1>
            </Link>
            <WalletButton />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        {!connected ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-12 text-center">
            <Shield size={64} className="mx-auto text-gray-400 mb-6" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Admin Panel</h2>
            <p className="text-gray-600 mb-6">Please connect your wallet to access the admin panel.</p>
            <WalletButton />
          </div>
        ) : !isAdmin ? (
          <div className="max-w-md mx-auto bg-red-50 border-2 border-red-200 rounded-2xl shadow-lg p-12 text-center">
            <XCircle size={64} className="mx-auto text-red-500 mb-6" />
            <h2 className="text-2xl font-bold text-red-900 mb-4">Access Denied</h2>
            <p className="text-red-700 font-semibold">Admins Only</p>
            <p className="text-red-600 text-sm mt-4">Your wallet address is not authorized to access this panel.</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="flex items-center gap-3 mb-6">
                <Shield size={32} className="text-primary" />
                <h2 className="text-3xl font-bold text-gray-900">Create New Market</h2>
              </div>

              {notification && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
                  notification.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  {notification.type === 'success' ? (
                    <CheckCircle className="text-green-500" size={24} />
                  ) : (
                    <XCircle className="text-red-500" size={24} />
                  )}
                  <span className={`font-semibold ${
                    notification.type === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {notification.message}
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="question" className="block text-sm font-bold text-gray-700 mb-2">
                    Question <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="question"
                    name="question"
                    value={formData.question}
                    onChange={handleInputChange}
                    placeholder="e.g., Will Bitcoin reach $150K in 2025?"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-900 font-medium"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-bold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Optional description for the market..."
                    rows={4}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-900"
                  />
                </div>

                <div>
                  <label htmlFor="pump_fun_link" className="block text-sm font-bold text-gray-700 mb-2">
                    Pump.fun Link <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    id="pump_fun_link"
                    name="pump_fun_link"
                    value={formData.pump_fun_link}
                    onChange={handleInputChange}
                    placeholder="https://pump.fun/token/..."
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-900 font-medium"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="image_url" className="block text-sm font-bold text-gray-700 mb-2">
                    Image URL
                  </label>
                  <input
                    type="url"
                    id="image_url"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleInputChange}
                    placeholder="https://example.com/image.png (optional)"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary text-gray-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-colors text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating Market...' : 'Create Market'}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-gray-200">
                <Link 
                  href="/dashboard"
                  className="text-primary hover:text-blue-700 font-semibold flex items-center justify-center gap-2"
                >
                  <TrendingUp size={20} />
                  View Dashboard
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
