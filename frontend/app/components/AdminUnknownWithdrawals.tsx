'use client'

import { formatUsd } from '@/lib/format'

export type UnknownWithdrawal = {
  id: string
  user_id: string
  amount_usdc: string
  signature: string | null
  created_at: string
}

const formatDate = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function formatAge(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const ms = now - then
  if (ms < 0) return 'in the future'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ago`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  return 'just now'
}

export function AdminUnknownWithdrawals({
  withdrawals,
  loading,
}: {
  withdrawals: UnknownWithdrawal[]
  loading: boolean
}) {
  return (
    <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-[#111827]">Unknown withdrawals</h2>
      <p className="mb-4 text-sm text-[#6B7280]">
        Withdrawals that reached the chain but could not be matched to a known internal request. This
        list is why the unknown status exists.
      </p>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading unknown withdrawals...</p>
      ) : withdrawals.length === 0 ? (
        <p className="text-sm text-[#6B7280]">No unknown withdrawals. The ledger is clean.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#F9FAFB] text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">ID</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Signature</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {withdrawals.map((w) => (
                <tr key={w.id} className="hover:bg-[#F9FAFB]">
                  <td className="max-w-[120px] truncate px-4 py-3 text-[#111827]" title={w.id}>
                    {w.id}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-[#111827]" title={w.user_id}>
                    {w.user_id}
                  </td>
                  <td className="px-4 py-3 text-right text-[#111827]">{formatUsd(w.amount_usdc)}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-[#6B7280]" title={w.signature ?? ''}>
                    {w.signature ? (
                      <a
                        href={`https://solscan.io/tx/${w.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#3B82F6] hover:underline"
                      >
                        {w.signature}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#6B7280]">{formatDate(w.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-[#B45309]">{formatAge(w.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
