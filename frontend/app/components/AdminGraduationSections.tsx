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
  updated_at: string
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

const STUCK_THRESHOLD_MS = 60 * 60 * 1000

const formatAge = (updatedAt: string) => {
  const ms = Date.now() - new Date(updatedAt).getTime()
  if (ms < 0) return '0m'
  const days = Math.floor(ms / (24 * 3600000))
  const hours = Math.floor((ms % (24 * 3600000)) / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (days > 0) return `${days} day${days === 1 ? '' : 's'}`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const isStuck = (g: { status: string; updated_at: string }) =>
  g.status !== 'complete' && Date.now() - new Date(g.updated_at).getTime() > STUCK_THRESHOLD_MS

export function AdminGraduationSections({
  graduations,
  loading,
}: {
  graduations: GraduationAdmin[]
  loading: boolean
}) {
  const stuck = graduations.filter(isStuck)

  return (
    <>
      <section className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Graduations</h2>
        <p className="mb-4 text-sm text-muted">
          Every graduated startup and its current state. Graduations that are not complete and have
          not been updated in over an hour are stuck and need review.
        </p>

        {stuck.length > 0 && (
          <div className="mb-4 rounded-lg border border-warn/25 bg-warn-soft p-3 text-sm text-warn">
            <p className="font-semibold">
              {stuck.length} stuck graduation{stuck.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {stuck.map((g) => (
                <li key={g.id}>
                  <span className="font-medium text-ink">{g.startup_name}</span>{' '}
                  <span className="font-semibold">
                    {g.status}, {formatAge(g.updated_at)}
                  </span>
                  {g.halted_reason ? ` — ${g.halted_reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted">Loading graduations...</p>
        ) : graduations.length === 0 ? (
          <p className="text-sm text-muted">No graduations found.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-y border-line bg-canvas text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-medium">Startup</th>
                  <th className="px-4 py-2.5 text-xs font-medium">Token</th>
                  <th className="px-4 py-2.5 text-xs font-medium">Status</th>
                  <th className="px-4 py-2.5 text-xs font-medium">Halted reason</th>
                  <th className="px-4 py-2.5 text-xs font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {graduations.map((g) => (
                  <tr
                    key={g.id}
                    className={`${
                      isStuck(g)
                        ? 'bg-warn-soft'
                        : 'hover:bg-canvas'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{g.startup_name}</div>
                      <div className="text-xs text-muted">{g.startup_slug}</div>
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {g.token_name ?? '—'}
                      {g.token_symbol ? (
                        <span className="ml-1 text-xs text-muted">({g.token_symbol})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink">{g.status}</td>
                    <td className="max-w-[300px] whitespace-normal px-4 py-3 text-warn">
                      {g.halted_reason ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(g.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">Escrow reconciliation</h2>
        <p className="mb-4 text-sm text-muted">
          Expected escrow, what is still owed to holders, and the counts that feed the comparison.{' '}
          <span className="font-medium text-warn">
            When comparable is false, the figure cannot be interpreted — a holder is mid-claim and
            the escrow may have moved with no record yet.
          </span>
        </p>

        {loading ? (
          <p className="text-sm text-muted">Loading escrow reconciliation...</p>
        ) : graduations.length === 0 ? (
          <p className="text-sm text-muted">No graduations found.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-y border-line bg-canvas text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-xs font-medium">Startup</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium">
                    Escrow expected
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium">
                    Still owed
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium">
                    Claimable
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium">Failed</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium">
                    Awaiting wallet
                  </th>
                  <th className="px-4 py-2.5 text-xs font-medium">Comparable?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {graduations.map((g) => (
                  <tr
                    key={g.id}
                    className={`${
                      g.comparable === false ? 'bg-warn-soft' : 'hover:bg-canvas'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{g.startup_name}</div>
                      <div className="text-xs text-muted">{g.startup_slug}</div>
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {g.comparable === false ? (
                        <span className="text-warn">Cannot interpret</span>
                      ) : g.escrow_expected ? (
                        formatTokenAmount(g.escrow_expected, 6)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {g.comparable === false ? (
                        <span className="text-warn">Cannot interpret</span>
                      ) : g.still_owed ? (
                        formatTokenAmount(g.still_owed, 6)
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {g.holder_counts.claimable.toLocaleString()}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {g.holder_counts.failed.toLocaleString()}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">
                      {g.holder_counts.awaiting_wallet.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {g.comparable === null ? (
                        '—'
                      ) : g.comparable ? (
                        <span className="inline-flex rounded-md bg-yes-soft px-1.5 py-0.5 text-xs font-medium text-yes">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex rounded-md bg-warn-soft px-1.5 py-0.5 text-xs font-medium text-warn">
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
