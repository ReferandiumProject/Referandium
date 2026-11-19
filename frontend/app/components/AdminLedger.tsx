'use client'

export type LedgerLiability = {
  backed_liability_exact: string
}

export function AdminLedger({ ledger, loading }: { ledger: LedgerLiability | null; loading: boolean }) {
  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-lg font-semibold text-ink">Ledger liability</h2>
      <p className="mb-4 text-sm text-muted">
        The exact backed-liability figure that halts withdrawals on mainnet. It is kept as a string
        end to end and never converted to a number.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading ledger liability...</p>
      ) : !ledger ? (
        <p className="text-sm text-muted">Ledger liability not available.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-canvas p-3">
            <p className="text-xs font-medium text-muted">
              backed_liability_exact
            </p>
            <p className="mt-1 break-all font-mono text-lg font-semibold text-ink">
              {ledger.backed_liability_exact}
            </p>
          </div>
          <p className="text-sm text-muted">
            <strong className="text-ink">Not an alarm on devnet.</strong> The test suite shares
            this database, the treasury is hand-funded, the fiat leg has never been converted to
            on-chain USDC, and the figure was written off to zero by declaration on 2026-08-29. This
            is a baseline rather than a live solvency measurement.
          </p>
        </div>
      )}
    </section>
  )
}
