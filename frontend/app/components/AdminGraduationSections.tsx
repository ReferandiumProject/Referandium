'use client'

import { formatTokenAmount } from '@/lib/format'

export type GraduationAdmin = {
  id: string
  status: string
  halted_reason: string | null
  startup_id: string
  startup_name: string
  startup_slug: string
  token_name: string | null
  token_symbol: string | null
  mint_address: string | null
  escrow_address: string | null
  created_at: string
  escrow_expected: string | null
  still_owed: string | null
  comparable: boolean | null
  holder_counts: {
    claimable: number
    failed: number
    awaiting_wallet: number
  }
}

const formatDate = (d: string | null) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

export function AdminGraduationSections({
  graduations,
  loading,
}: {
  graduations: GraduationAdmin[]
  loading: boolean
}) {
  const halted = graduations.filter((g) => g.status === 'halted')

  return (
    <>
      <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-[#111827]">Graduations</h2>
        <p className="mb-4 text-sm text-[#6B7280]">
          Every graduated startup and its current state. Halted graduations are stuck money and show
          their reason.
        </p>

        {halted.length > 0 && (
          <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
            <p className="font-semibold">{halted.length} halted graduation{halted.length === 1 ? '' : 's'}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {halted.map((g) => (
                <li key={g.id}>
                  <span className="font-medium text-[#111827]">{g.startup_name}</span>{' '}
                  {g.halted_reason ? `— ${g.halted_reason}` : '— no reason recorded'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-[#6B7280]">Loading graduations...</p>
        ) : graduations.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No graduations found.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F9FAFB] text-[#6B7280]">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Startup</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Token</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Halted reason</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {graduations.map((g) => (
                  <tr
                    key={g.id}
                    className={`${
                      g.status === 'halted'
                        ? 'bg-[#FEF3C7]'
                        : 'hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111827]">{g.startup_name}</div>
                      <div className="text-xs text-[#6B7280]">{g.startup_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-[#111827]">
                      {g.token_name ?? '—'}
                      {g.token_symbol ? (
                        <span className="ml-1 text-xs text-[#6B7280]">({g.token_symbol})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[#111827]">{g.status}</td>
                    <td className="max-w-[300px] whitespace-normal px-4 py-3 text-[#B45309]">
                      {g.halted_reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]">{formatDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-[#111827]">Escrow reconciliation</h2>
        <p className="mb-4 text-sm text-[#6B7280]">
          Expected escrow, what is still owed to holders, and the counts that feed the comparison.{' '}
          <span className="font-medium text-[#B45309]">
            When comparable is false, the figure cannot be interpreted — a holder is mid-claim and
            the escrow may have moved with no record yet.
          </span>
        </p>

        {loading ? (
          <p className="text-sm text-[#6B7280]">Loading escrow reconciliation...</p>
        ) : graduations.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No graduations found.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F9FAFB] text-[#6B7280]">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Startup</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
                    Escrow expected
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
                    Still owed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
                    Claimable
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Failed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">
                    Awaiting wallet
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Comparable?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {graduations.map((g) => (
                  <tr
                    key={g.id}
                    className={`${
                      g.comparable === false ? 'bg-[#FEF3C7]' : 'hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#111827]">{g.startup_name}</div>
                      <div className="text-xs text-[#6B7280]">{g.startup_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827]">
                      {g.comparable === false ? (
                        <span className="text-[#B45309]">Cannot interpret</span>
                      ) : g.escrow_expected ? (
                        formatTokenAmount(g.escrow_expected, 6)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827]">
                      {g.comparable === false ? (
                        <span className="text-[#B45309]">Cannot interpret</span>
                      ) : g.still_owed ? (
                        formatTokenAmount(g.still_owed, 6)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827]">
                      {g.holder_counts.claimable.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827]">
                      {g.holder_counts.failed.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-[#111827]">
                      {g.holder_counts.awaiting_wallet.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-[#111827]">
                      {g.comparable === null ? (
                        '—'
                      ) : g.comparable ? (
                        <span className="inline-flex rounded bg-[#10B981]/10 px-2 py-0.5 text-xs font-semibold text-[#10B981]">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-[#F59E0B]/10 px-2 py-0.5 text-xs font-semibold text-[#B45309]">
                          No — mid-claim
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
