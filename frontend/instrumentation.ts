export async function register() {
  // No-op. Next.js requires the register export for instrumentation to load.
}

export async function onRequestError(
  err: unknown,
  request: Request,
  context: { path?: string | undefined; requestId?: string | undefined; kind?: string | undefined }
) {
  // Lazily import so instrumentation startup stays light and so this hook can
  // still load even if the Supabase module has an issue.
  const { recordSystemError } = await import('./lib/system-errors')

  let name = 'Error'
  let message = 'Unknown server error'
  let stack: string | null = null

  if (err instanceof Error) {
    name = err.name
    message = err.message
    stack = err.stack ?? null
  } else if (typeof err === 'string') {
    message = err
  } else if (err && typeof err === 'object') {
    message = String((err as { message?: string }).message ?? err)
  }

  // Fire-and-forget with its own catch. A failure to record must not throw
  // from this hook and escalate the original error.
  await recordSystemError({
    source: 'server',
    name,
    message,
    stack,
    path: request.url ?? context?.path ?? null,
    userId: null,
    context: {
      kind: context?.kind,
      requestId: context?.requestId,
    },
  }).catch(() => {})
}
