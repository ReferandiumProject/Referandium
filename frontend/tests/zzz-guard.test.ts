import fs from 'fs'
import path from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Decimal } from '@/lib/decimal'
import { teardown, BALANCE_SNAPSHOT_PATH } from './global-teardown'

const PLATFORM_USER_ID = process.env.PLATFORM_SYSTEM_USER_ID!

async function getFixtureUserIds(): Promise<string[]> {
  // Transient fixtures must set a 'test:' privy_id. The email fallback is a
  // safety net for tests that have not been migrated to the deliberate marker.
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .or('privy_id.ilike.test:%,email.ilike.%@example.com')

  if (error) throw error
  return (data ?? []).map((u) => u.id)
}

let platformBalanceBefore: Decimal
let startupStartupsBefore: number
let graduationsBefore: number
let systemErrorsBefore: number

describe('fixture leakage guard', () => {
  beforeAll(async () => {
    const snapshot = JSON.parse(await fs.promises.readFile(BALANCE_SNAPSHOT_PATH, 'utf8'))
    platformBalanceBefore = Decimal.parse(String(snapshot.available_usdc ?? '0'))
    startupStartupsBefore = snapshot.startup_startups ?? 0
    graduationsBefore = snapshot.graduations ?? 0
    systemErrorsBefore = snapshot.system_errors ?? 0

    const leftoverIds = await getFixtureUserIds()
    if (leftoverIds.length > 0) {
      throw new Error(
        `the previous run did not clean up: fixture users remain: ${JSON.stringify(leftoverIds)}`
      )
    }
  })

  it('no fixture users or their rows remain', async () => {
    const userIds = await getFixtureUserIds()
    expect(userIds, `fixture users remain: ${JSON.stringify(userIds)}`).toHaveLength(0)

    if (userIds.length > 0) {
      const checks = [
        { table: 'balances', column: 'user_id' },
        { table: 'ledger_adjustments', column: 'user_id' },
        { table: 'withdrawals', column: 'user_id' },
        { table: 'stripe_payments', column: 'user_id' },
        { table: 'listing_credit_events', column: 'user_id' },
        { table: 'deposits', column: 'user_id' },
        { table: 'startup_startups', column: 'user_id' },
      ]

      for (const { table, column } of checks) {
        const { count, error } = await supabaseAdmin
          .from(table)
          .select('*', { count: 'exact', head: true })
          .in(column, userIds)

        if (error) throw error
        expect(count, `${table} has fixture rows`).toBe(0)
      }
    }
  })

  it('permanent fixtures are protected by the teardown guard', async () => {
    const permanentId = crypto.randomUUID()
    await supabaseAdmin.from('users').insert({
      id: permanentId,
      privy_id: `permanent:guard-${permanentId}`,
      email: 'guard-permanent@example.com',
      wallet_address: '0xGuardPermanent',
      username: 'guard-permanent',
    } as any)

    await expect(teardown()).rejects.toThrow(/permanent fixture/i)

    const { data } = await supabaseAdmin.from('users').select('id').eq('id', permanentId).maybeSingle()
    expect(data).not.toBeNull()

    // Clean up the deliberately-created permanent fixture.
    await supabaseAdmin.from('users').delete().eq('id', permanentId)
  })

  it('removes a transient fixture via teardown', async () => {
    const transientId = crypto.randomUUID()
    await supabaseAdmin.from('users').insert({
      id: transientId,
      privy_id: `test:guard-${transientId}`,
      email: 'guard-transient@example.com',
      wallet_address: '0xGuardTransient',
      username: 'guard-transient',
    } as any)

    await teardown()

    const { data } = await supabaseAdmin.from('users').select('id').eq('id', transientId).maybeSingle()
    expect(data).toBeNull()
  })

  it('money-touching test files are in moneyTestGlobs', () => {
    const config = fs.readFileSync('vitest.config.mjs', 'utf8')
    const match = config.match(/moneyTestGlobs\s*=\s*\[([\s\S]*?)\]/)
    if (!match) throw new Error('moneyTestGlobs not found in vitest.config.mjs')
    const patterns = match[1]
      .split('\n')
      .map((line: string) => line.replace(/[',]/g, '').trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('//'))

    function globMatches(relativePath: string, pattern: string): boolean {
      const parts = relativePath.split('/')
      const patternParts = pattern.split('/')
      let pi = 0
      let fi = 0
      while (pi < patternParts.length && fi < parts.length) {
        const pp = patternParts[pi]
        if (pp === '**') {
          if (pi === patternParts.length - 1) return true
          const next = patternParts[pi + 1]
          while (fi < parts.length) {
            if (globMatches(parts.slice(fi).join('/'), patternParts.slice(pi + 1).join('/'))) {
              return true
            }
            fi++
          }
          return false
        }
        const segment = parts[fi]
        if (pp === '*') {
          fi++
          pi++
          continue
        }
        if (pp.includes('*')) {
          const regex = new RegExp('^' + pp.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
          if (!regex.test(segment)) return false
          fi++
          pi++
          continue
        }
        if (pp !== segment) return false
        fi++
        pi++
      }
      return fi === parts.length && pi === patternParts.length
    }

    const moneyIndicators = [
      "from('balances')",
      "from('ledger_adjustments')",
      "from('withdrawals')",
      "from('deposits')",
      "from('graduations')",
      "from('system_errors')",
      "rpc('reserve_withdrawal'",
      "rpc('finalize_withdrawal'",
      "rpc('refund_withdrawal'",
      "rpc('grant_listing_credits'",
      "rpc('create_startup_listing'",
      "rpc('release_due_investment_packs'",
      "rpc('record_system_error'",
    ]

    function walk(dir: string, found: string[] = []): string[] {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(full, found)
        } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
          found.push(full)
        }
      }
      return found
    }

    const offenders: string[] = []
    for (const file of walk('tests')) {
      const relative = file.replace(/^tests\//, 'tests/')
      if (relative === 'tests/zzz-guard.test.ts') continue
      if (patterns.some((p: string) => globMatches(relative, p))) continue

      const content = fs.readFileSync(file, 'utf8')
      if (moneyIndicators.some((indicator) => content.includes(indicator))) {
        offenders.push(relative)
      }
    }

    expect(offenders).toEqual([])
  })

  it('platform balance is unchanged after the run', async () => {
    const { data, error } = await supabaseAdmin
      .from('balances')
      .select('available_usdc')
      .eq('user_id', PLATFORM_USER_ID)
      .single()

    if (error) throw error

    const after = Decimal.parse(String(data!.available_usdc ?? '0'))
    if (after.toString() !== platformBalanceBefore.toString()) {
      const delta = after.sub(platformBalanceBefore)
      throw new Error(
        `platform balance changed: before=${platformBalanceBefore.toString()} after=${after.toString()} delta=${delta.toString()}`
      )
    }
  })

  it('startup_startups count is unchanged after the run', async () => {
    const { count, error } = await supabaseAdmin
      .from('startup_startups')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
    if (error) throw error
    if ((count ?? 0) !== startupStartupsBefore) {
      throw new Error(`startup_startups count changed: before=${startupStartupsBefore} after=${count ?? 0}`)
    }
  })

  it('graduations count is unchanged after the run', async () => {
    const { count, error } = await supabaseAdmin
      .from('graduations')
      .select('*', { count: 'exact', head: true })
    if (error) throw error
    if ((count ?? 0) !== graduationsBefore) {
      throw new Error(`graduations count changed: before=${graduationsBefore} after=${count ?? 0}`)
    }
  })

  it('system_errors count is unchanged after the run', async () => {
    const { count, error } = await supabaseAdmin
      .from('system_errors')
      .select('*', { count: 'exact', head: true })
      .is('resolved_at', null)
    if (error) throw error
    if ((count ?? 0) !== systemErrorsBefore) {
      throw new Error(`system_errors count changed: before=${systemErrorsBefore} after=${count ?? 0}`)
    }
  })
})
