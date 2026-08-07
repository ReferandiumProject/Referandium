'use client'

import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

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

const formatNumber = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return Number.isFinite(v) ? v.toLocaleString() : '—'
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
  const [error, setError] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(true)

  const [modal, setModal] = useState<{
    type: 'edit' | 'delete' | 'restore' | 'force-phase2'
    startup: Startup
  } | null>(null)
  const [reason, setReason] = useState('')
  const [editForm, setEditForm] = useState<Partial<Startup>>({})
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
    } catch {
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
        await Promise.all([fetchStartups(token), fetchActions(token)])
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
    } catch {
      setError('Failed to load startups')
    } finally {
      setLoadingStartups(false)
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
        setError(json.error || 'Failed to load audit log')
        return
      }
      const json = await res.json()
      setActions(json || [])
    } catch {
      setError('Failed to load audit log')
    } finally {
      setLoadingActions(false)
    }
  }

  const refresh = async () => {
    const token = await getToken()
    if (!token) return
    await Promise.all([fetchStartups(token), fetchActions(token)])
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
        setActionError(json.error || `Update failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
    } catch (e: any) {
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
        setActionError(json.error || `Delete failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
    } catch (e: any) {
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
        setActionError(json.error || `Restore failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
    } catch (e: any) {
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
        setActionError(json.error || `Force phase 2 failed (${res.status})`)
        setActionLoading(false)
        return
      }
      closeModal()
      await refresh()
    } catch (e: any) {
      setActionError(e.message || 'Force phase 2 failed')
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
          <button onClick={() => login()} className={buttonPrimary}>
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
                          {isDeleted && (
                            <span className="mt-1 inline-flex rounded bg-[#EF4444]/10 px-2 py-0.5 text-xs font-semibold text-[#EF4444]">
                              Deleted
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#111827]">{s.phase}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatNumber(s.vote_threshold)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatNumber(s.capital_target)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatNumber(s.total_yes_votes)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatNumber(s.total_no_votes)}</td>
                        <td className="px-4 py-3 text-right text-[#111827]">{formatNumber(net)}</td>
                        <td className="px-4 py-3 text-[#6B7280]">{formatDate(s.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => openEdit(s)} className="text-xs font-semibold text-[#3B82F6] hover:text-blue-700">
                              Edit
                            </button>
                            {s.deleted_at ? (
                              <button onClick={() => openRestore(s)} className="text-xs font-semibold text-[#10B981] hover:text-green-700">
                                Restore
                              </button>
                            ) : (
                              <button onClick={() => openDelete(s)} className="text-xs font-semibold text-[#EF4444] hover:text-red-700">
                                Delete
                              </button>
                            )}
                            {s.phase === 1 && !s.deleted_at && (
                              <button onClick={() => openForcePhase2(s)} className="text-xs font-semibold text-[#F59E0B] hover:text-amber-700">
                                Force Phase 2
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
                  <button onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button onClick={handleEdit} disabled={actionLoading} className={buttonPrimary}>
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
                  <button onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button onClick={handleDelete} disabled={actionLoading} className={buttonDanger}>
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
                  <button onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button onClick={handleRestore} disabled={actionLoading} className={buttonPrimary}>
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
                  <button onClick={closeModal} className={buttonSecondary}>
                    Cancel
                  </button>
                  <button onClick={handleForcePhase2} disabled={actionLoading} className={buttonWarning}>
                    {actionLoading ? 'Processing...' : 'Force to phase 2'}
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
