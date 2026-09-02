import { supabaseAdmin } from './supabaseServer'

export type SystemErrorSource = 'server' | 'client' | 'function' | 'job' | 'swallowed'

export interface RecordSystemErrorParams {
  source: SystemErrorSource
  name: string
  message: string
  stack?: string | null
  path?: string | null
  userId?: string | null
  context?: Record<string, unknown> | null
}

/**
 * Record an error in the system_errors table via the record_system_error RPC.
 * This function is fire-and-forget: it catches and logs its own failures so
 * that a failure to record never throws or escalates the original error.
 *
 * source ∈ server | client | function | job | swallowed
 * → bigint (the row id)
 */
export async function recordSystemError(
  params: RecordSystemErrorParams
): Promise<bigint | number | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc('record_system_error', {
      p_source: params.source,
      p_name: params.name,
      p_message: params.message,
      p_stack: params.stack ?? null,
      p_path: params.path ?? null,
      p_user_id: params.userId ?? null,
      p_context: params.context ?? null,
    })

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[recordSystemError] RPC error:', error)
      return null
    }

    return data as bigint | number | null
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[recordSystemError] exception:', err)
    return null
  }
}
