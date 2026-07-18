'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { usePrivy } from '@privy-io/react-auth'

const categories = ['Other', 'Politics', 'Sports', 'Crypto', 'Business', 'Pop Culture']

export default function CreateMarketPage() {
  const { authenticated, login, getAccessToken } = usePrivy()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Other')
  const [endDate, setEndDate] = useState('')
  const [resolutionCriteria, setResolutionCriteria] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ id: string; title: string } | null>(null)

  const minDate = new Date().toISOString().slice(0, 16)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!authenticated) {
      setError('Please sign in to create a market.')
      return
    }

    if (!title.trim()) {
      setError('Title is required.')
      return
    }

    const parsedEnd = new Date(endDate)
    if (!endDate || Number.isNaN(parsedEnd.getTime())) {
      setError('Please select a valid end date.')
      return
    }

    if (parsedEnd.getTime() <= Date.now()) {
      setError('End date must be in the future.')
      return
    }

    let token: string | null
    try {
      token = await getAccessToken()
    } catch {
      setError('Unable to retrieve authentication token. Please sign in again.')
      return
    }

    if (!token) {
      setError('Unable to retrieve authentication token. Please sign in again.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          category: category.trim() || 'Other',
          end_date: parsedEnd.toISOString(),
          resolution_criteria: resolutionCriteria.trim() || undefined,
        }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg =
          typeof json.error === 'string' ? json.error : `Request failed (status ${res.status})`
        setError(msg)
        return
      }

      setSuccess({ id: json.market.id, title: json.market.title })
      setTitle('')
      setDescription('')
      setCategory('Other')
      setEndDate('')
      setResolutionCriteria('')
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] px-4 pb-24 pt-8">
      <main className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Create a Market
          </h1>
          <p className="mt-2 text-sm text-[#9CA3AF]">
            Define a prediction market and submit it for review.
          </p>
        </div>

        {!authenticated && (
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#161616] p-6 text-center">
            <p className="text-sm text-[#9CA3AF]">Sign in to create a new market.</p>
            <button
              type="button"
              onClick={() => login()}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#3B82F6] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB]"
            >
              Sign In
            </button>
          </div>
        )}

        {authenticated && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="title" className="block text-sm font-medium text-[#9CA3AF]">
                Market Title <span className="text-[#EF4444]">*</span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Will ETH exceed $10,000 by the end of 2025?"
                className="w-full rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 py-3 text-sm text-white placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="block text-sm font-medium text-[#9CA3AF]">
                Description <span className="text-[#6B7280]">(optional)</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide background and context..."
                rows={4}
                className="w-full resize-none rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 py-3 text-sm text-white placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="category" className="block text-sm font-medium text-[#9CA3AF]">
                  Category
                </label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 py-3 text-sm text-white focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="endDate" className="block text-sm font-medium text-[#9CA3AF]">
                  End Date <span className="text-[#EF4444]">*</span>
                </label>
                <input
                  id="endDate"
                  type="datetime-local"
                  value={endDate}
                  min={minDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 py-3 text-sm text-white [color-scheme:dark] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="resolution" className="block text-sm font-medium text-[#9CA3AF]">
                Resolution Criteria <span className="text-[#6B7280]">(optional)</span>
              </label>
              <textarea
                id="resolution"
                value={resolutionCriteria}
                onChange={(e) => setResolutionCriteria(e.target.value)}
                placeholder="How will the outcome be determined and verified?"
                rows={3}
                className="w-full resize-none rounded-lg border border-[#2A2A2A] bg-[#161616] px-4 py-3 text-sm text-white placeholder:text-[#6B7280] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/30"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-[#10B981]/20 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
                Market created:{" "}
                <Link href={`/market/${success.id}`} className="font-semibold underline">
                  {success.title}
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#3B82F6] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Market'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
