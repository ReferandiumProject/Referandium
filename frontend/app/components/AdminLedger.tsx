'use client'

export type LedgerLiability = {
  backed_liability_exact: string
}

export function AdminLedger({ ledger, loading }: { ledger: LedgerLiability | null; loading: boolean }) {
  return (
    <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-[#111827]">Ledger liability</h2>
      <p className="mb-4 text-sm text-[#6B7280]">
        The exact backed-liability figure that halts withdrawals on mainnet. It is kept as a string
        end to end and never converted to a number.
      </p>

      {loading ? (
        <p className="text-sm text-[#6B7280]">Loading ledger liability...</p>
      ) : !ledger ? (
        <p className="text-sm text-[#6B7280]">Ledger liability not available.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
              backed_liability_exact
            </p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-[#111827]">
              {ledger.backed_liability_exact}
            </p>
          </div>
          <p className="text-sm text-[#6B7280]">
            <strong className="text-[#111827]">Not an alarm on devnet.</strong> The test suite shares
            this database, the treasury is hand-funded, the fiat leg has never been converted to
            on-chain USDC, and the figure was written off to zero by declaration on 2026-08-29. This
            is a baseline rather than a live solvency measurement.
          </p>
        </div>
      )}
    </section>
  )
}
