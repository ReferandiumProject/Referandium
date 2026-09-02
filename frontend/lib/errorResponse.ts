import { NextResponse } from 'next/server'
import { recordSystemError } from './system-errors'

interface ErrorResponseParams {
  status: number
  message: string
  error?: unknown
  request: Request
  kind?: 'json' | 'text'
  data?: Record<string, unknown>
}

function errorToName(error: unknown): string {
  if (error instanceof Error) return error.name
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  return 'Error'
}

function errorToMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  if (typeof error === 'string') return error
  return null
}

function errorToStack(error: unknown): string | null {
  return error instanceof Error ? error.stack ?? null : null
}

export function errorResponse({ status, message, error, request, kind = 'json', data }: ErrorResponseParams): Response {
  const path = request.url

  if (status >= 500) {
    // Always log the failure so it is visible in server logs and test output.
    // eslint-disable-next-line no-console
    console.error(`[errorResponse] ${status} on ${path}`, error)

    // Record the error for monitoring. Tests that deliberately exercise 5xx
    // paths should mock recordSystemError and assert it is called.
    const originalMessage = errorToMessage(error)
    recordSystemError({
      source: 'server',
      name: errorToName(error),
      message: message || originalMessage || 'Internal server error',
      stack: errorToStack(error),
      path,
      userId: null,
      context: { originalError: error ?? null },
    }).catch(() => {})
  }

  if (kind === 'text') {
    return new NextResponse(message, { status })
  }

  const payload: Record<string, unknown> = { error: message }
  if (data) {
    for (const key of Object.keys(data)) {
      payload[key] = data[key]
    }
  }

  return NextResponse.json(payload, { status })
}
