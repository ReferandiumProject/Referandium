// @ts-nocheck
import fs from 'fs'
import { payFounder } from '@/lib/graduation/pay-founder'

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) {
    try {
      ;(process as any).loadEnvFile?.(file)
    } catch {
      // ignore on older Node versions
    }
  }
}

const GRADUATION_ID = process.env.GRADUATION_ID ?? '7abff8a6-f3e2-4d64-a286-3cd37c6bf185'
const FOUNDER_WALLET = process.env.FOUNDER_WALLET ?? '9AQ49JeaJXCZMEh2ih6B6LBSzkFdK9BAhZjr7aWfimii'

function formatAmount(amount: bigint, decimals: number): string {
  const s = amount.toString().padStart(decimals + 1, '0')
  const int = s.slice(0, -decimals) || '0'
  const frac = s.slice(-decimals)
  return `${int}.${frac}`
}

async function main() {
  const result = await payFounder(GRADUATION_ID, { founderWallet: FOUNDER_WALLET })

  console.log('\n=== Pay founder result ===')
  console.log(JSON.stringify(result, (_: string, v: any) => (typeof v === 'bigint' ? v.toString() : v), 2))

  console.log('\n=== Balances ===')
  console.log('Amount paid:', formatAmount(result.amount, 6))
  console.log('Founder before:', formatAmount(result.founderBalanceBefore, 6))
  console.log('Founder after:', formatAmount(result.founderBalanceAfter, 6))
  console.log('Treasury before:', formatAmount(result.treasuryBalanceBefore, 6))
  console.log('Treasury after:', formatAmount(result.treasuryBalanceAfter, 6))
  console.log('Treasury drop:', formatAmount(result.treasuryBalanceBefore - result.treasuryBalanceAfter, 6))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[pay-founder] failed:', err)
    process.exit(1)
  })
