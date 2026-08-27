'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { formatUsd, formatVoteCount } from '@/lib/format'
import { getFreezeActionBody } from '@/lib/admin-freeze'

type Startup = {
  id: string
  name: string
  slug: string
  description: string | null
  pitch: string | null
  website: string | null
  twitter: string | null
  logo_url: string | null
  stage: string | null
  phase: number
  vote_threshold: number
  capital_target: number
  total_yes_votes: number
  total_no_votes: number
  created_at: string
  deleted_at: string | null
  owner_id?: string
  frozen?: boolean
  graduated?: boolean
}

type StuckPack = {
  id: string
  email: string
  amount_charged: number
  created_at: string
  stuck_for: string
}

type StuckWithdrawal = {
  id: string
  email: string
  amount_usdc: number
  wallet_address: string
  created_at: string
  pending_for: string
}

type DepositNeedingAttention = {
  id: string
  email: string
  user_id: string
  amount_usdc: number
  status: string
  why: string
  signature: string
  waiting_for: string
  created_at: string
  updated_at: string
}

type Treasury = {
  sol: number
  usdc: number
  backed_liability: number
  cheap_transfers: number
  expensive_transfers: number
  low: boolean
}

type IntegrityCheck = {
  check_name: string
  status: 'ok' | 'warn' | 'fail'
  value: number
  detail: string
}

type IntegrityRun = {
  ran_at: string | null
  stale: boolean
  stale_for: string | null
  overall: 'ok' | 'warn' | 'fail'
  checks: IntegrityCheck[]
}

type AuditAction = {
  id: number
  action: string
  admin_id: string
  admin_email: string | null
  startup_id: string | null
  details: any
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

const inputClass =
  'w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6]'
const labelClass = 'mb-1 block text-sm font-medium text-[#374151]'
const buttonPrimary =
  'rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
const buttonSecondary =
  'rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-semibold text-[#111827] transition-colors hover:bg-[#F9FAFB]'
const buttonDanger =
  'rounded-lg bg-[#EF4444] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600'
const buttonWarning =
  'rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600'

export default function AdminPage() {
  const { getAccessToken, login, authenticated, ready } = usePrivy()

  const [status, setStatus] = useState<'loading' | 'signed-out' | 'not-authorized' | 'admin'>('loading')
  const [startups, setStartups] = useState<Startup[] | null>(null)
  const [actions, setActions] = useState<AuditAction[] | null>(null)
  const [loadingStartups, setLoadingStartups] = useState(false)
  const [loadingActions, setLoadingActions] = useState(false)
  const [stuckPacks, setStuckPacks] = useState<StuckPack[] | null>(null)
  const [stuckWithdrawals, setStuckWithdrawals] = useState<StuckWithdrawal[] | null>(null)
  const [depositsNeedingAttention, setDepositsNeedingAttention] = useState<DepositNeedingAttention[] | null>(null)
  const [loadingStuck, setLoadingStuck] = useState(false)
  const [loadingStuckWithdrawals, setLoadingStuckWithdrawals] = useState(false)
  const [loadingDepositsNeedingAttention, setLoadingDepositsNeedingAttention] = useState(false)
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const [loadingTreasury, setLoadingTreasury] = useState(false)
  const [integrity, setIntegrity] = useState<IntegrityRun | null>(null)
  const [loadingIntegrity, setLoadingIntegrity] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(true)

  const [sweepUserId, setSweepUserId] = useState('')
  const [sweepAmount, setSweepAmount] = useState('')
  const [sweepDestination, setSweepDestination] = useState('')
  const [sweepArmed, setSweepArmed] = useState(false)
  const [sweepLoading, setSweepLoading] = useState(false)
  const [sweepRaw, setSweepRaw] = useState<string | null>(null)

  const [scanUserId, setScanUserId] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanRaw, setScanRaw] = useState<string | null>(null)

  const [modal, setModal] = useState<{
    type: 'edit' | 'delete' | 'restore' | 'force-phase2'
    startup: Startup
  } | {
    type: 'freeze'
    startup: Startup
    // Computed once, at the moment the row's action button is clicked, from
    // that row's current frozen state. Every place that needs to know "is
    // this modal about to freeze or unfreeze" — the title, the warning copy,
    // the button label, and the request body — reads this single value
    // instead of re-deriving it from modal.startup.frozen independently, so
    // the label and the payload can never disagree.
    intendedFrozen: boolean
  } | null>(null)
  const [reason, setReason] = useState('')
  const [editForm, setEditForm] = useState<Partial<Startup>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!authenticated) {
      setStatus('signed-out')
      return
    }
    checkAdmin()
  }, [ready, authenticated])

  const getToken = async () => {
    try {
      return await getAccessToken()
    } catch (e) {
      console.warn('[admin page] getAccessToken failed:', e)
      return null
    }
  }

  const checkAdmin = async () => {
    const token = await getToken()
    if (!token) {
      setStatus('signed-out')
      return
    }
    try {
      const res = await fetch('/api/admin/whoami', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setStatus('not-authorized')
        return
      }
      const json = await res.json().catch(() => ({}))
      if (json.isAdmin) {
        setStatus('admin')
        await Promise.all([
          fetchStartups(token),
          fetchActions(token),
          fetchStuckPacks(token),
          fetchStuckWithdrawals(token),
          fetchDepositsNeedingAttention(token),
          fetchTreasury(token),
          fetchIntegrityChecks(token),
        ])
      } else {
        setStatus('not-authorized')
      }
    } catch {
      setStatus('not-authorized')
    }
  }

  const fetchStartups = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingStartups(true)
    try {
      const res = await fetch('/api/admin/startups', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error || 'Failed to load startups')
        return
      }
      const json = await res.json()
      setStartups(json || [])
    } catch (e) {
      console.error('[admin page] fetchStartups failed:', e)
      setError('Failed to load startups')
    } finally {
      setLoadingStartups(false)
    }
  }

  const fetchStuckPacks = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingStuck(true)
    try {
      const res = await fetch('/api/admin/stuck-investment-packs', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchStuckPacks HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load stuck investment packs')
        return
      }
      const json = await res.json()
      setStuckPacks(json || [])
    } catch (e) {
      console.error('[admin page] fetchStuckPacks failed:', e)
      setError('Failed to load stuck investment packs')
    } finally {
      setLoadingStuck(false)
    }
  }

  const fetchStuckWithdrawals = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingStuckWithdrawals(true)
    try {
      const res = await fetch('/api/admin/stuck-withdrawals', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchStuckWithdrawals HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load stuck withdrawals')
        return
      }
      const json = await res.json()
      setStuckWithdrawals(json || [])
    } catch (e) {
      console.error('[admin page] fetchStuckWithdrawals failed:', e)
      setError('Failed to load stuck withdrawals')
    } finally {
      setLoadingStuckWithdrawals(false)
    }
  }

  const fetchDepositsNeedingAttention = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingDepositsNeedingAttention(true)
    try {
      const res = await fetch('/api/admin/deposits-needing-attention', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchDepositsNeedingAttention HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load deposits needing attention')
        return
      }
      const json = await res.json()
      setDepositsNeedingAttention(json || [])
    } catch (e) {
      console.error('[admin page] fetchDepositsNeedingAttention failed:', e)
      setError('Failed to load deposits needing attention')
    } finally {
      setLoadingDepositsNeedingAttention(false)
    }
  }

  const fetchTreasury = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingTreasury(true)
    try {
      const res = await fetch('/api/admin/treasury', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchTreasury HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load treasury state')
        return
      }
      const json = await res.json()
      setTreasury(json)
    } catch (e) {
      console.error('[admin page] fetchTreasury failed:', e)
      setError('Failed to load treasury state')
    } finally {
      setLoadingTreasury(false)
    }
  }

  const fetchIntegrityChecks = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingIntegrity(true)
    try {
      const res = await fetch('/api/admin/integrity-checks', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchIntegrityChecks HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load integrity checks')
        return
      }
      const json = await res.json()
      setIntegrity(json)
    } catch (e) {
      console.error('[admin page] fetchIntegrityChecks failed:', e)
      setError('Failed to load integrity checks')
    } finally {
      setLoadingIntegrity(false)
    }
  }

  const fetchActions = async (tokenOverride?: string) => {
    const token = tokenOverride || (await getToken())
    if (!token) return
    setLoadingActions(true)
    try {
      const res = await fetch('/api/admin/actions', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error(`[admin page] fetchActions HTTP ${res.status}:`, json)
        setError(json.error || 'Failed to load audit log')
        return
      }
      const json = await res.json()
      setActions(json || [])
    } catch (e) {
      console.error('[admin page] fetchActions failed:', e)
      setError('Failed to load audit log')
    } finally {
      setLoadingActions(false)
    }
  }

  const runSweep = async () => {
    const token = await getToken()
    if (!token) {
      setSweepRaw(JSON.stringify({ error: 'Not authenticated' }, null, 2))
      return
    }

    const userId = sweepUserId.trim()
    if (!userId) {
      setSweepRaw(JSON.stringify({ error: 'User ID is required' }, null, 2))
      return
    }

    setSweepLoading(true)
    setSweepRaw(null)

    try {
      const body: any = { user_id: userId }
      const amount = sweepAmount.trim()
      if (amount) {
        const parsed = Number(amount)
        if (!Number.isNaN(parsed) && parsed > 0) {
          body.amount_usdc = parsed
        }
      }
      const dest = sweepDestination.trim()
      if (dest) {
        body.destination_address = dest
      }

      const res = await fetch('/api/admin/embedded-sweep', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      setSweepRaw(text)
    } catch (e: any) {
      setSweepRaw(JSON.stringify({ error: e?.message || 'Request failed' }, null, 2))
    } finally {
      setSweepLoading(false)
      setSweepArmed(false)
    }
  }

  const runScan = async () => {
    const token = await getToken()
    if (!token) {
      setScanRaw(JSON.stringify({ error: 'Not authenticated' }, null, 2))
      return
    }

    const userId = scanUserId.trim()
    if (!userId) {
      setScanRaw(JSON.stringify({ error: 'User ID is required' }, null, 2))
      return
    }

    setScanLoading(true)
    setScanRaw(null)

    try {
      const res = await fetch('/api/admin/deposit-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      })
      const text = await res.text()
      setScanRaw(text)
    } catch (e: any) {
      setScanRaw(JSON.stringify({ error: e?.message || 'Request failed' }, null, 2))
    } finally {
      setScanLoading(false)
    }
  }

  const refresh = async () => {
    const token = await getToken()
    if (!token) return
    await Promise.all([
      fetchStartups(token),
      fetchActions(token),
      fetchStuckPacks(token),
      fetchStuckWithdrawals(token),
      fetchDepositsNeedingAttention(token),
      fetchTreasury(token),
      fetchIntegrityChecks(token),
    ])
  }

  const openEdit = (s: Startup) => {
    setEditForm({
      name: s.name,
      description: s.description ?? '',
      pitch: s.pitch ?? '',
      website: s.website ?? '',
      twitter: s.twitter ?? '',
      logo_url: s.logo_url ?? '',
      stage: s.stage ?? '',
      vote_threshold: s.vote_threshold,
      capital_target: s.capital_target,
    })
    setReason('')
    setActionError(null)
    setModal({ type: 'edit', startup: s })
  }

  const openDelete = (s: Startup) => {
    setReason('')
    setActionError(null)
    setModal({ type: 'delete', startup: s })
  }

  const openRestore = (s: Startup) => {
    setActionError(null)
    setModal({ type: 'restore', startup: s })
  }

  const openForcePhase2 = (s: Startup) => {
    setReason('')
    setActionError(null)
    setModal({ type: 'force-phase2', startup: s })
  }

  const openFreeze = (s: Startup) => {
    setReason('')
    setActionError(null)
    const { frozen: intendedFrozen } = getFreezeActionBody(s.frozen)
    setModal({ type: 'freeze', startup: s, intendedFrozen })
  }

  const closeModal = () => {
    setModal(null)
    setReason('')
    setActionError(null)
  }

  const buildEditBody = (s: Startup) => {
    const body: Record<string, any> = {}
    const fields: (keyof Startup)[] = [
      'name',
      'description',
      'pitch',
      'website',
      'twitter',
      'logo_url',
      'stage',
    ]
    for (const f of fields) {
      const original = (s[f] ?? '') as string
      const next = (editForm[f] ?? '') as string
      if (next !== original) {
        body[f] = next || null
      }
    }
    if (s.phase === 1) {
      const nextThreshold = Number(editForm.vote_threshold ?? s.vote_threshold)
      if (nextThreshold !== s.vote_threshold) body.vote_threshold = nextThreshold
      const nextCapital = Number(editForm.capital_target ?? s.capital_target)
      if (nextCapital !== s.capital_target) body.capital_target = nextCapital
    }
    return body
  }

  const handleEdit = async () => {
    if (!modal) return
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    if (!token) {
      setActionError('Not authenticated')
      setActionLoading(false)
      return
    }
    const body = buildEditBody(modal.startup)
    try {
      const res = await fetch(`/api/admin/startups/${modal.startup.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`[admin page] edit failed — HTTP ${res.status}:`, json)
        setActionError(json.error || `Update failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
      setSuccessMessage('Startup updated successfully.')
    } catch (e: any) {
      console.error('[admin page] edit exception:', e)
      setActionError(e.message || 'Update failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!modal) return
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    if (!token) {
      setActionError('Not authenticated')
      setActionLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/startups/${modal.startup.id}/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`[admin page] delete failed — HTTP ${res.status}:`, json)
        setActionError(json.error || `Delete failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
      setSuccessMessage('Startup deleted successfully.')
    } catch (e: any) {
      console.error('[admin page] delete exception:', e)
      setActionError(e.message || 'Delete failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestore = async () => {
    if (!modal) return
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    if (!token) {
      setActionError('Not authenticated')
      setActionLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/startups/${modal.startup.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`[admin page] restore failed — HTTP ${res.status}:`, json)
        setActionError(json.error || `Restore failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
      setSuccessMessage('Startup restored successfully.')
    } catch (e: any) {
      console.error('[admin page] restore exception:', e)
      setActionError(e.message || 'Restore failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleForcePhase2 = async () => {
    if (!modal) return
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    if (!token) {
      setActionError('Not authenticated')
      setActionLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/startups/${modal.startup.id}/force-phase2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`[admin page] force-phase2 failed — HTTP ${res.status}:`, json)
        setActionError(json.error || `Force phase 2 failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
      setSuccessMessage('Startup forced to phase 2 successfully.')
    } catch (e: any) {
      console.error('[admin page] force-phase2 exception:', e)
      setActionError(e.message || 'Force phase 2 failed')
    } finally {
      setActionLoading(false)
    }
  }

  const handleFreeze = async () => {
    if (!modal || modal.type !== 'freeze') return
    const { intendedFrozen, startup } = modal
    setActionLoading(true)
    setActionError(null)
    const token = await getToken()
    if (!token) {
      setActionError('Not authenticated')
      setActionLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/admin/startups/${startup.id}/freeze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ frozen: intendedFrozen, reason }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        console.error(`[admin page] freeze failed — HTTP ${res.status}:`, json)
        setActionError(json.error || `${intendedFrozen ? 'Halt' : 'Resume'} failed (${res.status})`)
        setActionLoading(false)
        return
      }
      // Update local state immediately rather than relying solely on the
      // follow-up refresh(): if that fetch is slow or silently fails (e.g. a
      // transient token refresh issue), the row would keep showing the old
      // frozen state and label, and a second click would send the same
      // value again — which is exactly how this bug happened in practice.
      setStartups((prev) =>
        (prev ?? []).map((s) => (s.id === startup.id ? { ...s, frozen: intendedFrozen } : s))
      )
      closeModal()
      await refresh()
      setSuccessMessage(intendedFrozen ? 'New purchases halted successfully.' : 'New purchases resumed successfully.')
    } catch (e: any) {
      console.error('[admin page] freeze exception:', e)
      setActionError(e.message || `${intendedFrozen ? 'Halt' : 'Resume'} failed`)
    } finally {
      setActionLoading(false)
    }
  }

  if (!ready || status === 'loading') {
    return (
      <main className="min-h-screen bg-[#F9FAFB] px-4 py-12 text-[#111827]">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-sm text-[#6B7280]">Loading...</p>
        </div>
      </main>
    )
  }

  if (status === 'signed-out') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4 text-[#111827]">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-[#111827]">Admin</h1>
          <p className="mb-6 text-sm text-[#6B7280]">Sign in to access the admin panel.</p>
          <button type="button" onClick={() => login()} className={buttonPrimary}>
            Sign In
          </button>
        </div>
      </main>
    )
  }

  if (status === 'not-authorized') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F9FAFB] px-4 text-[#111827]">
        <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-2xl font-semibold text-[#111827]">Not authorised</h1>
          <p className="text-sm text-[#6B7280]">You do not have permission to view this page.</p>
        </div>
      </main>
    )
  }

  const filteredStartups = (startups || []).filter((s) => showDeleted || !s.deleted_at)

  return (
    <main className="min-h-screen bg-[#F9FAFB] px-4 py-8 text-[#111827]">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-2xl font-bold text-[#111827] sm:text-3xl">Admin</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-3 text-sm text-[#EF4444]">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-[#10B981]/30 bg-[#10B981]/10 p-3 text-sm text-[#10B981]">
            <span>{successMessage}</span>
            <button type="button" onClick={() => setSuccessMessage(null)} className="font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        )}

        <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[#111827]">Startups</h2>
            <label className="flex items-center gap-2 text-sm text-[#6B7280]">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="h-4 w-4 rounded border-[#E5E7EB] text-[#3B82F6] focus:ring-[#3B82F6]"
              />
              Show deleted startups
            </label>
          </div>

          {loadingStartups ? (
            <p className="text-sm text-[#6B7280]">Loading startups...</p>
          ) : filteredStartups.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No startups to show.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F9FAFB] text-[#6B7280]">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Startup</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Phase</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Threshold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Capital</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">YES</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">NO</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Net</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {filteredStartups.map((s) => {
                    const net = (s.total_yes_votes ?? 0) - (s.total_no_votes ?? 0)
                    const isDeleted = !!s.deleted_at
                    return (
                      <tr
                        key={s.id}
                        className={`${isDeleted ? 'bg-[#FEF2F2]' : 'hover:bg-[#F9FAFB]'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#111827]">{s.name}</div>
                          <div className="text-xs text-[#6B7280]">{s.slug}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {isDeleted && (
                              <span className="inline-flex rounded bg-[#EF4444]/10 px-2 py-0.5 text-xs font-semibold text-[#EF4444]">
                                Deleted
                              </span>
                            )}
                            {s.phase === 2 && s.frozen && (
                              <span className="inline-flex rounded bg-[#F59E0B]/10 px-2 py-0.5 text-xs font-semibold text-[#B45309]">
                                Frozen
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[#111827]">{s.phase}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatVoteCount(s.vote_threshold)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatUsd(s.capital_target)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatVoteCount(s.total_yes_votes)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatVoteCount(s.total_no_votes)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatVoteCount(net)}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{formatDate(s.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => openEdit(s)} className="text-xs font-semibold text-[#3B82F6] hover:text-blue-700">
                              Edit
                            </button>
                            {s.deleted_at ? (
                              <button type="button" onClick={() => openRestore(s)} className="text-xs font-semibold text-[#10B981] hover:text-green-700">
                                Restore
                              </button>
                            ) : (
                              <button type="button" onClick={() => openDelete(s)} className="text-xs font-semibold text-[#EF4444] hover:text-red-700">
                                Delete
                              </button>
                            )}
                            {s.phase === 1 && !s.deleted_at && (
                              <button type="button" onClick={() => openForcePhase2(s)} className="text-xs font-semibold text-[#F59E0B] hover:text-amber-700">
                                Force Phase 2
                              </button>
                            )}
                            {s.phase === 2 && !s.deleted_at && (
                              <button
                                type="button"
                                onClick={() => openFreeze(s)}
                                className={`text-xs font-semibold ${
                                  s.frozen ? 'text-[#10B981] hover:text-green-700' : 'text-[#B45309] hover:text-amber-700'
                                }`}
                              >
                                {s.frozen ? 'Resume purchases' : 'Halt purchases'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          className={`mb-8 rounded-xl border p-5 shadow-sm ${
            (stuckPacks || []).length > 0
              ? 'border-[#F59E0B]/30 bg-[#FEF3C7]'
              : 'border-[#E5E7EB] bg-white'
          }`}
        >
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Stuck investment packs</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Paid investment packs with no net amount. This should always be zero.
          </p>

          {loadingStuck ? (
            <p className="text-sm text-[#6B7280]">Loading stuck packs...</p>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-3xl font-bold text-[#111827]">{(stuckPacks || []).length}</span>
                <span className="ml-2 text-sm text-[#6B7280]">stuck</span>
              </div>

              {(stuckPacks || []).length === 0 ? (
                <p className="text-sm text-[#6B7280]">No stuck investment packs. The view ran successfully.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FAFB] text-[#6B7280]">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Email</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Stuck for</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {(stuckPacks || []).map((p) => (
                        <tr key={p.id} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3 text-[#111827]">{p.email}</td>
                          <td className="px-4 py-3 text-right text-[#111827]">{formatUsd(p.amount_charged)}</td>
                          <td className="px-4 py-3 text-[#6B7280]">{formatDate(p.created_at)}</td>
                          <td className="px-4 py-3 text-[#B45309] font-medium">{p.stuck_for}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section
          className={`mb-8 rounded-xl border p-5 shadow-sm ${
            (stuckWithdrawals || []).length > 0
              ? 'border-[#EF4444]/50 bg-[#FEF2F2]'
              : 'border-[#E5E7EB] bg-white'
          }`}
        >
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Stuck withdrawals</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Pending withdrawals older than 15 minutes. This should always be zero.
          </p>

          {loadingStuckWithdrawals ? (
            <p className="text-sm text-[#6B7280]">Loading stuck withdrawals...</p>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-3xl font-bold text-[#111827]">
                  {(stuckWithdrawals || []).length}
                </span>
                <span className="ml-2 text-sm text-[#6B7280]">stuck</span>
              </div>

              {(stuckWithdrawals || []).length === 0 ? (
                <p className="text-sm text-[#6B7280]">No stuck withdrawals. The view ran successfully.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FAFB] text-[#6B7280]">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Email</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Wallet</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Pending for</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {(stuckWithdrawals || []).map((w) => (
                        <tr key={w.id} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3 text-[#111827]">{w.email}</td>
                          <td className="px-4 py-3 text-right text-[#111827]">{w.amount_usdc}</td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-[#6B7280]" title={w.wallet_address}>
                            {w.wallet_address}
                          </td>
                          <td className="px-4 py-3 text-[#6B7280]">{formatDate(w.created_at)}</td>
                          <td className="px-4 py-3 text-[#B45309] font-medium">{w.pending_for}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section
          className={`mb-8 rounded-xl border p-5 shadow-sm ${
            (depositsNeedingAttention || []).length > 0
              ? 'border-[#EF4444]/50 bg-[#FEF2F2]'
              : 'border-[#E5E7EB] bg-white'
          }`}
        >
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Deposits needing attention</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Deposits that arrived in a user's wallet but have not become balance. This should always be zero.
          </p>

          {loadingDepositsNeedingAttention ? (
            <p className="text-sm text-[#6B7280]">Loading deposits needing attention...</p>
          ) : (
            <>
              <div className="mb-4">
                <span className="text-3xl font-bold text-[#111827]">
                  {(depositsNeedingAttention || []).length}
                </span>
                <span className="ml-2 text-sm text-[#6B7280]">needing attention</span>
              </div>

              {(depositsNeedingAttention || []).length === 0 ? (
                <p className="text-sm text-[#6B7280]">No deposits needing attention. The view ran successfully.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FAFB] text-[#6B7280]">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Email</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Waiting for</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Why</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Signature</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {(depositsNeedingAttention || []).map((d) => (
                        <tr key={d.id} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3 text-[#111827]">{d.email}</td>
                          <td className="px-4 py-3 text-right text-[#111827]">{formatUsd(d.amount_usdc)}</td>
                          <td className="px-4 py-3 text-[#6B7280]">{d.status}</td>
                          <td className="px-4 py-3 text-[#B45309] font-medium">{d.waiting_for}</td>
                          <td className="max-w-[300px] whitespace-normal px-4 py-3 text-[#6B7280]">{d.why}</td>
                          <td className="max-w-[200px] truncate px-4 py-3 text-[#6B7280]" title={d.signature}>
                            {d.signature}
                          </td>
                          <td className="px-4 py-3 text-[#6B7280]">{formatDate(d.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section className="mb-8 rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Treasury</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            On-chain state of the platform wallet. SOL is a live operational signal; USDC is
            informational only.
          </p>

          {loadingTreasury ? (
            <p className="text-sm text-[#6B7280]">Loading treasury...</p>
          ) : !treasury ? (
            <p className="text-sm text-[#6B7280]">Treasury state not available.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">SOL</p>
                  <p className="text-xl font-semibold text-[#111827]">{treasury.sol.toFixed(4)} SOL</p>
                  <p className="text-sm text-[#6B7280]">
                    About {treasury.cheap_transfers.toLocaleString()} simple transfers
                  </p>
                  <p className="text-sm text-[#6B7280]">
                    About {treasury.expensive_transfers.toLocaleString()} first-time withdrawals
                  </p>
                  {treasury.low && (
                    <p className="mt-2 text-sm font-semibold text-[#EF4444]">
                      Low: fewer than 50 first-time withdrawals remaining
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">
                    USDC (informational)
                  </p>
                  <p className="text-xl font-semibold text-[#111827]">
                    {formatUsd(treasury.usdc)} in treasury
                  </p>
                  <p className="text-sm text-[#6B7280]">
                    Backed liability: {formatUsd(treasury.backed_liability)}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    backed_liability can be negative on devnet; this is expected while phantom
                    balances have been paid out. It is not a solvency alarm here.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section
          className={`mb-8 rounded-xl border p-5 shadow-sm ${
            integrity?.overall === 'fail'
              ? 'border-[#EF4444]/50 bg-[#FEF2F2]'
              : integrity?.overall === 'warn'
              ? 'border-[#F59E0B]/30 bg-[#FEF3C7]'
              : 'border-[#E5E7EB] bg-white'
          }`}
        >
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Integrity checks</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Hourly invariant checks. A stale run is itself a problem — old green results are not passing results.
          </p>

          {loadingIntegrity ? (
            <p className="text-sm text-[#6B7280]">Loading integrity checks...</p>
          ) : !integrity ? (
            <p className="text-sm text-[#6B7280]">Integrity state not available.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-3xl font-bold text-[#111827]">
                    {integrity.checks.filter((c) => c.status === 'fail').length}
                    <span className="ml-2 text-sm font-normal text-[#6B7280]">failing</span>
                  </p>
                  <p className="text-3xl font-bold text-[#111827]">
                    {integrity.checks.filter((c) => c.status === 'warn').length}
                    <span className="ml-2 text-sm font-normal text-[#6B7280]">warnings</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-[#6B7280]">Last checked</p>
                  <p className="text-lg font-semibold text-[#111827]">
                    {integrity.ran_at ? formatDate(integrity.ran_at) : 'Never'}
                  </p>
                  {integrity.stale ? (
                    <p className="text-sm font-semibold text-[#B45309]">
                      Stale — last checked {integrity.stale_for} ago
                    </p>
                  ) : (
                    <p className="text-sm text-[#6B7280]">up to date</p>
                  )}
                </div>
              </div>

              {integrity.checks.length === 0 ? (
                <p className="text-sm text-[#6B7280]">No checks recorded yet.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#F9FAFB] text-[#6B7280]">
                      <tr>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Check</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide">Value</th>
                        <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide">Detail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E7EB]">
                      {integrity.checks.map((c) => (
                        <tr key={c.check_name} className="hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3 font-medium text-[#111827]">{c.check_name}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                                c.status === 'fail'
                                  ? 'bg-[#EF4444]/10 text-[#EF4444]'
                                  : c.status === 'warn'
                                  ? 'bg-[#F59E0B]/10 text-[#B45309]'
                                  : 'bg-[#E5E7EB] text-[#374151]'
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-[#111827]">{c.value}</td>
                          <td className="px-4 py-3 text-[#6B7280]">{c.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Audit log</h2>
          <p className="mb-4 text-sm text-[#6B7280]">Every admin action is recorded.</p>
          {loadingActions ? (
            <p className="text-sm text-[#6B7280]">Loading audit log...</p>
          ) : (actions || []).length === 0 ? (
            <p className="text-sm text-[#6B7280]">No actions yet.</p>
          ) : (
            <div className="space-y-3">
              {(actions || []).map((a) => (
                <div
                  key={a.id}
                  className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-sm"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium text-[#111827]">
                      {a.admin_email || 'Unknown'} · <span className="text-[#3B82F6]">{a.action}</span>
                    </p>
                    <p className="text-xs text-[#6B7280]">{formatDate(a.created_at)}</p>
                  </div>
                  {a.startup_id && <p className="text-xs text-[#6B7280]">Startup: {a.startup_id}</p>}
                  <pre className="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-[#6B7280]">
                    {JSON.stringify(a.details, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-8 rounded-xl border border-[#EF4444]/50 bg-[#FEF2F2] p-5 shadow-sm">
          <div className="mb-4 rounded-lg border border-[#EF4444]/30 bg-[#FEF2F2] p-3 text-sm text-[#7F1D1D]">
            <strong>Diagnostic — moves real funds.</strong> This control signs a Solana transaction that transfers actual USDC out of a user&apos;s Privy embedded wallet. It is the only write action on this page and does not credit any balance or create a deposit row.
          </div>
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Embedded wallet sweep diagnostic</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Test delegated signing and the transfer-destination policy manually. Leave the destination empty to sweep to the treasury.
          </p>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>User ID</label>
              <input
                className={inputClass}
                value={sweepUserId}
                onChange={(e) => setSweepUserId(e.target.value)}
                placeholder="Paste the user's UUID"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Amount USDC (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClass}
                  value={sweepAmount}
                  onChange={(e) => setSweepAmount(e.target.value)}
                  placeholder="Omit to sweep the full balance"
                />
              </div>
              <div>
                <label className={labelClass}>Destination Solana address (optional)</label>
                <input
                  className={inputClass}
                  value={sweepDestination}
                  onChange={(e) => setSweepDestination(e.target.value)}
                  placeholder="Empty means the treasury"
                />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm text-[#374151]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-[#E5E7EB] text-[#EF4444] focus:ring-[#EF4444]"
                checked={sweepArmed}
                onChange={(e) => setSweepArmed(e.target.checked)}
              />
              <span>This will move real USDC out of a user&apos;s wallet. I understand and want to proceed.</span>
            </label>
            <button
              onClick={runSweep}
              disabled={!sweepArmed || !sweepUserId.trim() || sweepLoading}
              className={buttonDanger}
            >
              {sweepLoading ? 'Running...' : 'Run sweep'}
            </button>

            {sweepRaw !== null && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-semibold text-[#111827]">Raw response</p>
                <pre className="max-h-96 overflow-auto rounded-lg border border-[#E5E7EB] bg-white p-3 text-xs text-[#111827]">
                  {sweepRaw}
                </pre>
              </div>
            )}
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-[#F59E0B]/50 bg-[#FEF3C7] p-5 shadow-sm">
          <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#FEF3C7] p-3 text-sm text-[#78350F]">
            <strong>Diagnostic — runs the real deposit scanner.</strong> This calls the production scan
            for one user: it records deposits, sweeps USDC to the treasury, and credits balances. Use
            this only when you need to see which rule each transfer hit.
          </div>
          <h2 className="mb-1 text-lg font-semibold text-[#111827]">Deposit scan diagnostic</h2>
          <p className="mb-4 text-sm text-[#6B7280]">
            Returns the scan result counts plus a per-candidate breakdown: source, destination, amount,
            block time, and the exact rejection reason (already recorded, before cutoff, treasury source,
            below minimum, or accepted).
          </p>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>User ID</label>
              <input
                className={inputClass}
                value={scanUserId}
                onChange={(e) => setScanUserId(e.target.value)}
                placeholder="Paste the user's UUID"
              />
            </div>
            <button
              onClick={runScan}
              disabled={!scanUserId.trim() || scanLoading}
              className={buttonWarning}
            >
              {scanLoading ? 'Running...' : 'Run deposit scan'}
            </button>

            {scanRaw !== null && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-semibold text-[#111827]">Raw response</p>
                <pre className="max-h-96 overflow-auto rounded-lg border border-[#E5E7EB] bg-white p-3 text-xs text-[#111827]">
                  {scanRaw}
                </pre>
              </div>
            )}
          </div>
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl">
            {modal.type === 'edit' && (
              <>
                <h3 className="mb-4 text-lg font-semibold text-[#111827]">Edit {modal.startup.name}</h3>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      className={inputClass}
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Description</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Pitch</label>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={editForm.pitch || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, pitch: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Website</label>
                      <input
                        className={inputClass}
                        value={editForm.website || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Twitter</label>
                      <input
                        className={inputClass}
                        value={editForm.twitter || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, twitter: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Logo URL</label>
                    <input
                      className={inputClass}
                      value={editForm.logo_url || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, logo_url: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Stage</label>
                    <input
                      className={inputClass}
                      value={editForm.stage || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, stage: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Vote threshold</label>
                      <input
                        type="number"
                        className={`${inputClass} ${modal.startup.phase !== 1 ? 'cursor-not-allowed bg-[#F3F4F6]' : ''}`}
                        value={editForm.vote_threshold ?? modal.startup.vote_threshold}
                        disabled={modal.startup.phase !== 1}
                        onChange={(e) => setEditForm((f) => ({ ...f, vote_threshold: Number(e.target.value) }))}
                      />
                      {modal.startup.phase !== 1 && (
                        <p className="mt-1 text-xs text-[#6B7280]">
                          Locked: a raise has already started; changing terms would alter commitments.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>Capital target</label>
                      <input
                        type="number"
                        className={`${inputClass} ${modal.startup.phase !== 1 ? 'cursor-not-allowed bg-[#F3F4F6]' : ''}`}
                        value={editForm.capital_target ?? modal.startup.capital_target}
                        disabled={modal.startup.phase !== 1}
                        onChange={(e) => setEditForm((f) => ({ ...f, capital_target: Number(e.target.value) }))}
                      />
                      {modal.startup.phase !== 1 && (
                        <p className="mt-1 text-xs text-[#6B7280]">
                          Locked: a raise has already started; changing terms would alter commitments.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {actionError && (
                  <p className="mt-4 text-sm text-[#EF4444]">{actionError}</p>
                )}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleEdit} disabled={actionLoading} className={buttonPrimary}>
                    {actionLoading ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'delete' && (
              <>
                <h3 className="mb-2 text-lg font-semibold text-[#111827]">Delete {modal.startup.name}?</h3>
                <p className="mb-4 text-sm text-[#6B7280]">
                  This will hide the startup from the platform and return every deployed vote to its voter&apos;s pool. This is reversible. Only available for phase 1 startups.
                </p>
                <label className={labelClass}>Reason (optional)</label>
                <input
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for deletion"
                />
                {actionError && <p className="mt-4 text-sm text-[#EF4444]">{actionError}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleDelete} disabled={actionLoading} className={buttonDanger}>
                    {actionLoading ? 'Deleting...' : 'Delete startup'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'restore' && (
              <>
                <h3 className="mb-2 text-lg font-semibold text-[#111827]">Restore {modal.startup.name}?</h3>
                <p className="mb-4 text-sm text-[#6B7280]">
                  This will make the startup visible again. Votes that were previously returned to users are not reclaimed.
                </p>
                {actionError && <p className="mt-4 text-sm text-[#EF4444]">{actionError}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleRestore} disabled={actionLoading} className={buttonPrimary}>
                    {actionLoading ? 'Restoring...' : 'Restore startup'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'force-phase2' && (
              <>
                <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
                  <strong>Warning:</strong> This is the most consequential action on this page. It permanently closes voting, burns every vote deployed on this startup, and opens the startup for real-money fundraising without it having reached its threshold.
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[#111827]">Force {modal.startup.name} to phase 2?</h3>
                <p className="mb-4 text-sm text-[#6B7280]">
                  Only use this with clear reason. The change cannot be undone.
                </p>
                <label className={labelClass}>Reason (optional)</label>
                <input
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for forcing phase 2"
                />
                {actionError && <p className="mt-4 text-sm text-[#EF4444]">{actionError}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button type="button" onClick={handleForcePhase2} disabled={actionLoading} className={buttonWarning}>
                    {actionLoading ? 'Processing...' : 'Force to phase 2'}
                  </button>
                </div>
              </>
            )}

            {modal.type === 'freeze' && (
              <>
                <h3 className="mb-2 text-lg font-semibold text-[#111827]">
                  {modal.intendedFrozen ? 'Halt new purchases' : 'Resume new purchases'} on {modal.startup.name}?
                </h3>
                {modal.intendedFrozen ? (
                  <div className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#FEF3C7] p-3 text-sm text-[#92400E]">
                    This halts <strong>new purchases only</strong>. Selling stays open, so anyone already holding
                    tokens can still exit. This is deliberate: the correct response to a suspected problem is to
                    close the entrance, not to trap the people already inside.
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-[#6B7280]">
                    This resumes new purchases on the raise. Selling was never blocked while halted, so nothing
                    changes for existing holders.
                  </p>
                )}
                <label className={labelClass}>Reason (optional)</label>
                <input
                  className={inputClass}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={modal.intendedFrozen ? 'Reason for halting purchases' : 'Reason for resuming purchases'}
                />
                {actionError && <p className="mt-4 text-sm text-[#EF4444]">{actionError}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleFreeze}
                    disabled={actionLoading}
                    className={modal.intendedFrozen ? buttonWarning : buttonPrimary}
                  >
                    {actionLoading
                      ? 'Processing...'
                      : modal.intendedFrozen
                      ? 'Halt new purchases'
                      : 'Resume new purchases'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
