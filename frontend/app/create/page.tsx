'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { supabase } from '../../lib/supabaseClient'

const categories = ['Politics', 'Sports', 'Crypto', 'Pop Culture', 'Business', 'Other']

export default function CreateMarketPage() {
  const router = useRouter()
  const { publicKey, connected } = useWallet()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Politics')
  const [marketType, setMarketType] = useState<'binary' | 'multiple'>('binary')
  const [options, setOptions] = useState(['', ''])
  const [endDate, setEndDate] = useState('')
  const [resolveCriteria, setResolveCriteria] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const addOption = () => { if (options.length < 6) setOptions([...options, '']) }
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)) }
  const updateOption = (i: number, val: string) => { const copy = [...options]; copy[i] = val; setOptions(copy) }

  const handleSubmit = async () => {
    setError('')
    if (!connected || !publicKey) { setError('Please connect your wallet first.'); return }
    if (!title.trim()) { setError('Title is required.'); return }
    if (!endDate) { setError('End date is required.'); return }
    if (marketType === 'multiple' && options.filter(o => o.trim()).length < 2) { setError('At least 2 options are required.'); return }

    setIsSubmitting(true)
    try {
      const { data, error: insertErr } = await supabase
        .from('markets')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          category,
          market_type: marketType,
          end_time: new Date(endDate).toISOString(),
          resolve_criteria: resolveCriteria.trim() || null,
          status: 'active',
          gookie_wallet: publicKey.toBase58(),
          total_signals: 0,
          total_sol_locked: 0,
          total_yield_earned: 0,
          platform_fee_collected: 0,
          gookie_fee_earned: 0,
          user_share_distributed: 0,
          buyback_burn_amount: 0,
          min_signal_sol: 0.05,
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      if (marketType === 'multiple' && data) {
        const validOptions = options.filter(o => o.trim())
        const optionInserts = validOptions.map(o => ({
          market_id: data.id,
          title: o.trim(),
          yes_signals: 0,
          no_signals: 0,
          total_sol_on_option: 0,
        }))
        const { error: optErr } = await supabase.from('market_options').insert(optionInserts)
        if (optErr) console.error('Error inserting options:', optErr)
      }

      router.push(`/market/${data.id}`)
    } catch (err: any) {
      console.error('Create market error:', err)
      setError(err.message || 'Failed to create market.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Create a Market</h1>
        <p className="text-slate-500 text-sm mb-8">Define a question and let the crowd signal their demand.</p>

        {!connected && (
          <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center mb-8">
            <p className="text-slate-500 text-sm font-medium">Connect your wallet to create a market.</p>
          </div>
        )}

        {connected && (
          <div className="space-y-6">

            {/* Title */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Will X happen by Y date?"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide additional context..."
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Market Type */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Market Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMarketType('binary')}
                  className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    marketType === 'binary' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  Binary (YES / NO)
                </button>
                <button
                  type="button"
                  onClick={() => setMarketType('multiple')}
                  className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    marketType === 'multiple' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  Multiple Choice
                </button>
              </div>
            </div>

            {/* Options (multiple choice) */}
            {marketType === 'multiple' && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Options (min 2, max 6)</label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {options.length > 2 && (
                        <button type="button" onClick={() => removeOption(i)} className="text-slate-400 hover:text-red-500 text-sm px-2 transition">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 6 && (
                  <button type="button" onClick={addOption} className="text-blue-600 text-sm font-medium mt-2 hover:underline">
                    + Add option
                  </button>
                )}
              </div>
            )}

            {/* End Date */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">End Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Resolve Criteria */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Resolution Criteria</label>
              <textarea
                value={resolveCriteria}
                onChange={(e) => setResolveCriteria(e.target.value)}
                placeholder="How will this market be resolved?"
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
              <p className="text-sm text-blue-700">0.01 SOL creation fee applies. Your wallet will be set as the market creator.</p>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Market'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
