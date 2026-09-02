import { describe, it, expect, vi, afterEach } from 'vitest'
import { recordSystemError } from '@/lib/system-errors'
import { supabaseAdmin } from '@/lib/supabaseServer'

describe('system_errors recording', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls record_system_error RPC with mapped parameters', async () => {
    const rpcSpy = vi.spyOn(supabaseAdmin, 'rpc').mockResolvedValue({ data: 42, error: null } as any)

    const id = await recordSystemError({
      source: 'server',
      name: 'TestError',
      message: 'test message 123',
      stack: 'test stack',
      path: '/test',
      userId: null,
      context: { foo: 'bar' },
    })

    expect(rpcSpy).toHaveBeenCalledWith('record_system_error', {
      p_source: 'server',
      p_name: 'TestError',
      p_message: 'test message 123',
      p_stack: 'test stack',
      p_path: '/test',
      p_user_id: null,
      p_context: { foo: 'bar' },
    })
    expect(id).toBe(42)
  })

  it('returns null and does not throw when the RPC fails', async () => {
    const rpcSpy = vi
      .spyOn(supabaseAdmin, 'rpc')
      .mockResolvedValue({ data: null, error: { message: 'rpc failed', code: '500' } } as any)

    const id = await recordSystemError({
      source: 'swallowed',
      name: 'BadError',
      message: 'bad',
    })

    expect(id).toBeNull()
  })
})
