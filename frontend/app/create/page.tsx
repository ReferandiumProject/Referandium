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
  const [causeTokenEnabled, setCauseTokenEnabled] = useState(false)
  const [causeTokenName, setCauseTokenName] = useState('')
  const [causeTokenSymbol, setCauseTokenSymbol] = useState('')
  const [causeTokenDescription, setCauseTokenDescription] = useState('')
  const [causeTokenImage, setCauseTokenImage] = useState('')

  const addOption = () => { if (options.length < 6) setOptions([...options, '']) }
  const removeOption = (i: number) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)) }
  const updateOption = (i: number, val: string) => { const copy = [...options]; copy[i] = val; setOptions(copy) }

  const handleSubmit = async () => {
    setError('')
    if (!connected || !publicKey) { setError('Please connect your wallet first.'); return }
    if (!title.trim()) { setError('Title is required.'); return }
    if (!endDate) { setError('End date is required.'); return }
    if (marketType === 'multiple' && options.filter(o => o.trim()).length < 2) { setError('At least 2 options are required.'); return }
    if (causeTokenEnabled && !causeTokenName.trim()) { setError('Token name is required when Cause Token is enabled.'); return }
    if (causeTokenEnabled && !causeTokenSymbol.trim()) { setError('Token symbol is required when Cause Token is enabled.'); return }

    setIsSubmitting(true)
    try {
      const insertData: any = {
        title: title.trim(),
        description: description.trim() || null,
        category,
        market_type: marketType,
        end_time: new Date(endDate).toISOString(),
        resolve_criteria: resolveCriteria.trim() || null,
        status: 'active',
        gookie_wallet: publicKey.toBase58(),
        total_signals: 0,
        total_usdc_locked: 0,
        total_yield_earned: 0,
        platform_fee_collected: 0,
        gookie_fee_earned: 0,
        user_share_distributed: 0,
        buyback_burn_amount: 0,
        min_signal_usdc: 5,
      }

      if (causeTokenEnabled) {
        insertData.cause_token_enabled = true
        insertData.cause_token_name = causeTokenName.trim()
        insertData.cause_token_symbol = causeTokenSymbol.trim().toUpperCase()
        insertData.cause_token_image = causeTokenImage.trim() || null
      }

      const { data, error: insertErr } = await supabase
        .from('markets')
        .insert(insertData)
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
    <div className="bg-[#faf8ff] text-[#191b23] antialiased min-h-screen">
      <main className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mb-20 md:mb-12">

        <div className="mb-8">
          <h1 className="font-semibold text-[36px] leading-[1.1] tracking-[-0.04em] text-[#191b23]">Create a Market</h1>
          <p className="text-[15px] leading-[1.5] tracking-[-0.01em] text-[#434655] mt-2">Define the parameters for a new prescription market.</p>
        </div>

        {!connected && (
          <div className="border border-dashed border-[#e1e2ed] rounded-xl p-6 text-center mb-8">
            <p className="text-[#434655] text-[15px] font-medium">Connect your wallet to create a market.</p>
          </div>
        )}

        {connected && (
          <div className="space-y-6">

            {/* Title */}
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
              <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Market Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Will the central bank raise interest rates this quarter?"
                className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] placeholder:text-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
              />
            </div>

            {/* Description */}
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
              <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide context and details about the market..."
                rows={4}
                className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] placeholder:text-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all resize-none"
              />
            </div>

            {/* Category & Type Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full appearance-none bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Market Type Toggle */}
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Market Type</label>
                <div className="flex p-1 bg-[#e1e2ed] rounded-lg">
                  <button
                    type="button"
                    onClick={() => setMarketType('binary')}
                    className={`flex-1 py-2 px-4 rounded-md text-[13px] font-medium transition-all ${
                      marketType === 'binary' ? 'bg-white shadow-sm text-[#191b23]' : 'text-[#434655] hover:text-[#191b23]'
                    }`}
                  >
                    Binary (Yes/No)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketType('multiple')}
                    className={`flex-1 py-2 px-4 rounded-md text-[13px] font-medium transition-all ${
                      marketType === 'multiple' ? 'bg-white shadow-sm text-[#191b23]' : 'text-[#434655] hover:text-[#191b23]'
                    }`}
                  >
                    Multiple Choice
                  </button>
                </div>
              </div>
            </div>

            {/* Options (multiple choice) */}
            {marketType === 'multiple' && (
              <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
                <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Options (min 2, max 6)</label>
                <div className="space-y-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 border border-[#c3c6d7] rounded-lg px-4 py-2 text-[15px] text-[#191b23] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                      />
                      {options.length > 2 && (
                        <button type="button" onClick={() => removeOption(i)} className="text-[#737686] hover:text-[#ba1a1a] text-sm px-2 transition">✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {options.length < 6 && (
                  <button type="button" onClick={addOption} className="text-[#2563eb] text-[13px] font-medium mt-2 hover:underline">
                    + Add option
                  </button>
                )}
              </div>
            )}

            {/* End Date */}
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
              <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all"
              />
            </div>

            {/* Resolution Criteria */}
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
              <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-2">Resolution Criteria</label>
              <textarea
                value={resolveCriteria}
                onChange={(e) => setResolveCriteria(e.target.value)}
                placeholder="Explicitly state how the outcome will be determined and verified..."
                rows={3}
                className="w-full bg-white border border-[#c3c6d7] rounded-lg px-4 py-3 text-[15px] leading-[1.5] tracking-[-0.01em] text-[#191b23] placeholder:text-[#737686] focus:outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 transition-all resize-none"
              />
            </div>

            {/* Cause Token Toggle */}
            <div className="bg-white p-6 rounded-xl border border-[#c3c6d7] shadow-[0px_1px_3px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCauseTokenEnabled(!causeTokenEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${causeTokenEnabled ? 'bg-[#2563eb]' : 'bg-[#c3c6d7]'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${causeTokenEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                  <span className="text-[15px] font-medium text-[#191b23]">Launch a Cause Token (optional)</span>
                </div>
                <span className="text-[11px] font-medium text-[#737686] bg-[#e1e2ed] px-2 py-0.5 rounded">Powered by Meteora</span>
              </div>

              {causeTokenEnabled && (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-1.5">Token Name *</label>
                      <input
                        type="text"
                        value={causeTokenName}
                        onChange={(e) => setCauseTokenName(e.target.value)}
                        placeholder="e.g., Prescribe Token"
                        className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-[15px] text-[#191b23] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-1.5">Token Symbol *</label>
                      <input
                        type="text"
                        value={causeTokenSymbol}
                        onChange={(e) => setCauseTokenSymbol(e.target.value.toUpperCase().slice(0, 6))}
                        placeholder="e.g., PRSCB"
                        maxLength={6}
                        className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-[15px] text-[#191b23] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 uppercase"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-1.5">Token Description (optional)</label>
                    <textarea
                      value={causeTokenDescription}
                      onChange={(e) => setCauseTokenDescription(e.target.value)}
                      placeholder="Describe the purpose of this cause token..."
                      rows={2}
                      className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-[15px] text-[#191b23] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold tracking-[0.05em] text-[#434655] uppercase mb-1.5">Token Image URL (optional)</label>
                    <input
                      type="text"
                      value={causeTokenImage}
                      onChange={(e) => setCauseTokenImage(e.target.value)}
                      placeholder="https://..."
                      className="w-full border border-[#c3c6d7] rounded-lg px-4 py-2.5 text-[15px] text-[#191b23] placeholder:text-[#737686] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
                    />
                  </div>
                  <div className="bg-[#dbe1ff]/20 border border-[#dbe1ff] rounded-lg p-3">
                    <p className="text-[12px] text-[#003ea8]/80 leading-relaxed">
                      A bonding curve token will be launched on Meteora. Early supporters can buy in before graduation to a full liquidity pool.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="bg-[#dbe1ff]/30 border border-[#dbe1ff] rounded-xl p-4 flex items-start gap-3">
              <span className="text-[#2563eb] mt-0.5">ℹ</span>
              <div>
                <h4 className="text-[15px] font-semibold text-[#003ea8]">Creation Fee</h4>
                <p className="text-[13px] text-[#003ea8]/80 mt-1">A 5 USDC creation fee applies to prevent spam and ensure market quality.</p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-[13px] text-[#ba1a1a] font-medium">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-[#2563eb] text-white font-semibold text-[18px] leading-[1.3] tracking-[-0.02em] py-4 rounded-xl shadow-[0px_1px_3px_rgba(15,23,42,0.08)] hover:bg-[#2563eb]/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Market'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
