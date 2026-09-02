import { supabaseAdmin } from '@/lib/supabaseServer'
import { type SupabaseType } from '@/lib/graduation/state'
import { mintGraduationToken } from '@/lib/graduation/mint'
import { createGraduationPool } from '@/lib/graduation/pool'
import { burnLpTokens } from '@/lib/graduation/burn'
import { payFounder } from '@/lib/graduation/pay-founder'
import { revokeMintAuthority, completeGraduation } from '@/lib/graduation/revoke'
import { recordSystemError } from '@/lib/system-errors'
import type { AuthenticatedUser } from '@/lib/auth-helpers'

export interface ResumeDeps {
  supabase?: SupabaseType
}

export interface ResumeWorkDeps {
  supabase?: SupabaseType
  maxSteps?: number
}

export interface ResumeResult {
  graduation_id: string
  previous_status: string
  status: string
  resumed_by: string
  resumed_at: string
  already?: boolean
  error?: string
}

function actorIdentity(admin: AuthenticatedUser): string {
  return admin.privy_id ?? admin.email ?? admin.id
}

function buildResult(
  graduationId: string,
  previousStatus: string,
  status: string,
  actor: string,
  resumedAt: string,
  already = false
): ResumeResult {
  return {
    graduation_id: graduationId,
    previous_status: previousStatus,
    status,
    resumed_by: actor,
    resumed_at: resumedAt,
    already,
  }
}

async function claimHaltedGraduation(
  supabase: SupabaseType,
  graduationId: string,
  actor: string
): Promise<string | null> {
  const previousStatus = await getPreviousStatus(supabase, graduationId)
  if (!previousStatus) return null

  const { data: claimed, error: claimError } = await supabase
    .from('graduations')
    .update({ status: previousStatus, halted_reason: null })
    .eq('id', graduationId)
    .eq('status', 'halted')
    .select('id')
    .single()

  if (claimError || !claimed) {
    return null
  }

  const { error: eventError } = await supabase.from('graduation_events').insert({
    graduation_id: graduationId,
    from_status: 'halted',
    to_status: previousStatus,
    actor,
    note: `Resumed by ${actor}`,
  } as any)

  if (eventError) {
    throw new Error(eventError.message)
  }

  return previousStatus
}

async function getPreviousStatus(
  supabase: SupabaseType,
  graduationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('graduation_events')
    .select('from_status')
    .eq('graduation_id', graduationId)
    .eq('to_status', 'halted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as any)?.from_status as string | undefined ?? null
}

export async function resumeGraduation(
  graduationId: string,
  admin: AuthenticatedUser,
  deps: ResumeDeps = {}
): Promise<ResumeResult> {
  const supabase = deps.supabase ?? supabaseAdmin
  const actor = actorIdentity(admin)
  const now = new Date().toISOString()

  const { data: grad, error: gradErr } = await supabase
    .from('graduations')
    .select('status')
    .eq('id', graduationId)
    .single()

  if (gradErr || !grad) {
    throw new Error('Graduation not found')
  }

  const currentStatus = (grad as any).status as string
  let previousStatus: string | null = null
  let status = currentStatus

  if (currentStatus === 'halted') {
    previousStatus = await claimHaltedGraduation(supabase, graduationId, actor)
    if (!previousStatus) {
      const { data: nowGrad, error: nowErr } = await supabase
        .from('graduations')
        .select('status')
        .eq('id', graduationId)
        .single()

      if (nowErr || !nowGrad) {
        throw new Error('Graduation not found')
      }

      const nowStatus = (nowGrad as any).status as string
      if (nowStatus === 'halted') {
        throw new Error('Graduation has no previous status recorded')
      }
      // Another process resumed this graduation; continue one step from its current state.
      status = nowStatus
    } else {
      status = previousStatus
    }
  }

  try {
    await runResumeWork(graduationId, { supabase, maxSteps: 1 })
  } catch (err: any) {
    if (
      err?.code === '55006' ||
      err?.message?.includes('SQLSTATE 55006') ||
      err?.message?.includes('another process got there first')
    ) {
      console.warn(
        '[resume] another process got there first for graduation:',
        graduationId,
        err?.message
      )
      void recordSystemError({
        source: 'swallowed',
        name: 'GraduationResumeConcurrencyConflict',
        message: err?.message ?? 'another process got there first',
        path: 'lib/graduation/resume.ts/resumeGraduation',
        context: { graduationId, actor, code: err?.code },
      })
    } else {
      throw err
    }
  }

  const { data: after, error: afterErr } = await supabase
    .from('graduations')
    .select('status, halted_reason')
    .eq('id', graduationId)
    .single()

  if (afterErr || !after) {
    throw new Error(
      `Could not reload graduation ${graduationId}: ${afterErr?.message ?? 'not found'}`
    )
  }

  const afterStatus = (after as any).status as string
  const haltedReason = (after as any).halted_reason as string | null

  if (afterStatus === 'halted') {
    throw new Error(haltedReason ?? 'Resumed graduation halted during processing')
  }

  return buildResult(graduationId, previousStatus ?? status, afterStatus, actor, now)
}

export async function runResumeWork(
  graduationId: string,
  deps: ResumeWorkDeps = {}
): Promise<void> {
  const supabase = deps.supabase ?? supabaseAdmin
  const maxSteps = deps.maxSteps ?? 10

  for (let i = 0; i < maxSteps; i++) {
    const { data, error } = await supabase
      .from('graduations')
      .select(
        'status, authority_revoke_signature, pool_address, lp_mint_address, lp_token_account'
      )
      .eq('id', graduationId)
      .single()

    if (error || !data) {
      console.error('[resume] could not load graduation:', graduationId, error)
      void recordSystemError({
        source: 'swallowed',
        name: 'ResumeLoadGraduationError',
        message: error?.message ?? 'could not load graduation',
        path: 'lib/graduation/resume.ts/runResumeWork',
        context: { graduationId, error: error ? { message: error.message, code: error.code } : null },
      })
      return
    }

    const grad = data as any
    const status = grad.status as string

    if (status === 'complete' || status === 'halted') {
      return
    }

    try {
      if (status === 'minting') {
        const mint = await mintGraduationToken(graduationId, { supabase })
        if (!mint.success) return
        continue
      }

      if (status === 'minted' || status === 'pooling') {
        const pool = await createGraduationPool(graduationId, { supabase })
        if (!pool.success) return
        continue
      }

      if (status === 'pooled' || status === 'burning') {
        const burn = await burnLpTokens(graduationId, { supabase })
        if (!burn.success) return
        continue
      }

      if (status === 'burned' || status === 'paying_founder') {
        const pay = await payFounder(graduationId, { supabase })
        if (!pay.success) return
        continue
      }

      if (status === 'founder_paid' || status === 'revoking') {
        const revoke = await revokeMintAuthority(graduationId, { supabase })
        if (!revoke.txId) return

        const signature =
          revoke.txId ??
          (grad.authority_revoke_signature as string | undefined) ??
          ''
        if (!signature) return

        const complete = await completeGraduation(graduationId, signature, {
          supabase,
        })
        if (!complete.authorityRevokeSignature) return
        continue
      }

      console.warn('[resume] unhandled graduation status, stopping:', status)
      return
    } catch (err: any) {
      if (
        err?.code === '55006' ||
        err?.message?.includes('SQLSTATE 55006') ||
        err?.message?.includes('another process got there first')
      ) {
        console.warn(
          '[resume] another process got there first for graduation:',
          graduationId,
          err?.message
        )
        void recordSystemError({
          source: 'swallowed',
          name: 'GraduationStepConcurrencyConflict',
          message: err?.message ?? 'another process got there first',
          path: 'lib/graduation/resume.ts/runResumeWork',
          context: { graduationId, status, code: err?.code },
        })
      } else {
        console.error(
          '[resume] step failed for graduation:',
          graduationId,
          err?.message ?? err
        )
        void recordSystemError({
          source: 'swallowed',
          name: 'GraduationStepFailed',
          message: err?.message ?? 'resume step failed',
          path: 'lib/graduation/resume.ts/runResumeWork',
          context: { graduationId, status, stack: err?.stack, code: err?.code },
        })
      }
      return
    }
  }

  console.warn('[resume] reached max steps for graduation:', graduationId)
}
