import { supabaseAdmin } from '@/lib/supabaseServer'

export type SupabaseType = typeof supabaseAdmin

const DEFAULT_ACTOR = 'platform'

export async function transition(
  supabase: SupabaseType,
  graduationId: string,
  from: string,
  to: string,
  updates: Record<string, unknown> = {},
  note?: string,
  actor = DEFAULT_ACTOR
): Promise<void> {
  // graduation_transition sets app.graduation_note and app.graduation_actor
  // in the same transaction as the UPDATE. The trigger on graduations writes
  // the graduation_events row. Non-halted transitions clear halted_reason.
  const { error } = await supabase.rpc('graduation_transition', {
    p_graduation_id: graduationId,
    p_to_status: to,
    p_note: note ?? null,
    p_actor: actor,
    p_updates: updates,
    p_from_status: from,
  })
  if (error) {
    if (error.code === '55006') {
      const concurrent = new Error(`Graduation status transition conflict: ${error.message}`)
      ;(concurrent as any).code = '55006'
      throw concurrent
    }
    throw new Error(`Graduation status transition failed: ${error.message}`)
  }
}

export async function halt(
  supabase: SupabaseType,
  graduationId: string,
  from: string,
  reason: string,
  actor = DEFAULT_ACTOR
): Promise<void> {
  await transition(
    supabase,
    graduationId,
    from,
    'halted',
    { halted_reason: reason },
    reason,
    actor
  )
}
