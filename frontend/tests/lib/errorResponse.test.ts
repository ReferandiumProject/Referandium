import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errorResponse } from '@/lib/errorResponse'
import { recordSystemError } from '@/lib/system-errors'

vi.mock('@/lib/system-errors', () => ({
  recordSystemError: vi.fn().mockResolvedValue(1),
}))

function makeRequest(url: string) {
  return new Request(url, { method: 'POST' })
}

describe('errorResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records a 5xx with source: server, the request path, and the error context', () => {
    const request = makeRequest('http://localhost:3000/api/test/error')
    const err = new Error('boom')

    const res = errorResponse({
      status: 500,
      message: 'Something went wrong',
      error: err,
      request,
    })

    expect(res.status).toBe(500)
    expect(recordSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        path: request.url,
        message: 'Something went wrong',
        context: { originalError: err },
      })
    )
  })

  it('does not record non-5xx responses', () => {
    const request = makeRequest('http://localhost:3000/api/test/bad-request')

    const res = errorResponse({
      status: 400,
      message: 'Bad request',
      request,
    })

    expect(res.status).toBe(400)
    expect(recordSystemError).not.toHaveBeenCalled()
  })

  it('can return a plain text 5xx response for webhooks', () => {
    const request = makeRequest('http://localhost:3000/api/webhook')
    const err = { code: 'E_WEBHOOK', message: 'webhook failed' }

    const res = errorResponse({
      status: 500,
      message: 'Webhook failed',
      error: err,
      request,
      kind: 'text',
    })

    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/)
    expect(recordSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        path: request.url,
        message: 'Webhook failed',
      })
    )
  })
})
