import { supabaseAdmin } from './supabaseServer'
import { recordSystemError } from './system-errors'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL
const RESEND_CONFIGURED = Boolean(RESEND_API_KEY && RESEND_FROM_EMAIL)
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://referandium.com'

type NotificationType =
  | 'tokens_claimable'
  | 'startup_graduated'
  | 'threshold_crossed'
  | 'raise_frozen'

type ReferenceType = 'graduation_holder' | 'graduation' | 'startup' | 'startup_curve'

async function fetchUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email, username')
    .eq('id', userId)
    .single()

  if (error || !data?.email) {
    console.error('[notifications] could not fetch user email:', { userId, error })
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationUserEmailLookupError',
      message: error?.message ?? 'could not fetch user email',
      path: 'lib/notifications.ts/fetchUserEmail',
      userId,
      context: { userId, error: error ? { message: error.message, code: error.code } : null },
    })
    return null
  }

  return data.email as string
}

async function recordPending(
  userId: string,
  type: NotificationType,
  referenceId: string,
  referenceType: ReferenceType
): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('email_notifications')
    .insert({
      user_id: userId,
      notification_type: type,
      reference_id: referenceId,
      reference_type: referenceType,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      console.log('[notifications] already recorded, skipping:', { userId, type, referenceId })
      return null
    }
    console.error('[notifications] FAILED to record email (deployment/database fault, not a send failure):', { userId, type, referenceId, error })
    throw error
  }

  return data as { id: string }
}

async function markSent(id: string, error?: string) {
  const { error: updateError } = await supabaseAdmin
    .from('email_notifications')
    .update({
      status: error ? 'failed' : 'sent',
      sent_at: new Date().toISOString(),
      error: error ?? null,
    })
    .eq('id', id)

  if (updateError) {
    console.error('[notifications] FAILED to update email status (deployment/database fault, not a send failure):', { id, updateError })
    throw updateError
  }
}

async function sendResendEmail(
  to: string,
  subject: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return { success: false, error: 'Resend not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to,
        subject,
        text,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `Resend ${res.status}: ${body}` }
    }

    await res.json()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

async function send(
  userId: string,
  email: string,
  type: NotificationType,
  referenceId: string,
  referenceType: ReferenceType,
  subject: string,
  text: string
): Promise<void> {
  if (!RESEND_CONFIGURED) {
    // Resend is not configured: this is a deployment state, not a runtime error.
    // Do not record it as a failure and do not write to email_notifications.
    return
  }

  const record = await recordPending(userId, type, referenceId, referenceType)
  if (!record) return

  const result = await sendResendEmail(email, subject, text)
  if (result.error) {
    void recordSystemError({
      source: 'swallowed',
      name: 'ResendSendFailure',
      message: result.error,
      path: 'lib/notifications.ts/send',
      userId,
      context: { type, referenceId, referenceType, email: email.substring(0, 5) + '...' },
    })
  }
  await markSent(record.id, result.error)
}

async function loadStartup(startupId: string): Promise<{ name: string; slug: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('startup_startups')
    .select('name, slug')
    .eq('id', startupId)
    .single()

  if (error || !data) {
    console.error('[notifications] could not load startup:', { startupId, error })
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationStartupLookupError',
      message: error?.message ?? 'could not load startup',
      path: 'lib/notifications.ts/loadStartup',
      context: { startupId, error: error ? { message: error.message, code: error.code } : null },
    })
    return null
  }

  return data as { name: string; slug: string }
}

export async function notifyTokensClaimable(
  graduationHolderId: string,
  graduationId: string
): Promise<void> {
  try {
    const { data: holding, error: holdingError } = await supabaseAdmin
      .from('graduation_holders')
      .select('id, user_id, tokens_onchain::text')
      .eq('id', graduationHolderId)
      .single()

    if (holdingError || !holding) {
      console.error('[notifications] could not load graduation holder:', { graduationHolderId, error: holdingError })
      void recordSystemError({
        source: 'swallowed',
        name: 'NotificationGraduationHolderLookupError',
        message: holdingError?.message ?? 'could not load graduation holder',
        path: 'lib/notifications.ts/notifyTokensClaimable',
        context: { graduationHolderId, graduationId, error: holdingError ? { message: holdingError.message, code: holdingError.code } : null },
      })
      return
    }

    const { data: graduation, error: graduationError } = await supabaseAdmin
      .from('graduations')
      .select('startup_id, token_name, token_symbol')
      .eq('id', graduationId)
      .single()

    if (graduationError || !graduation) {
      console.error('[notifications] could not load graduation:', { graduationId, error: graduationError })
      void recordSystemError({
        source: 'swallowed',
        name: 'NotificationGraduationLookupError',
        message: graduationError?.message ?? 'could not load graduation',
        path: 'lib/notifications.ts/notifyTokensClaimable',
        context: { graduationId, error: graduationError ? { message: graduationError.message, code: graduationError.code } : null },
      })
      return
    }

    const userId = (holding as any).user_id as string
    const tokens = (holding as any).tokens_onchain as string

    const [email, startup] = await Promise.all([
      fetchUserEmail(userId),
      loadStartup((graduation as any).startup_id as string),
    ])

    if (!email || !startup) return

    const tokenSymbol = (graduation as any).token_symbol as string
    const displayTokens = (Number(tokens) / 10 ** 6).toLocaleString(undefined, {
      maximumFractionDigits: 6,
    })

    const subject = `${startup.name} tokens are ready to claim`
    const text = [
      `The startup ${startup.name} has graduated, and your tokens are now in escrow under your name.`,
      '',
      `Amount: ${displayTokens} ${tokenSymbol}`,
      '',
      `You can claim them through the site at ${SITE_URL}/profile when you are ready.`,
      '',
      'This is an informational message. No wallet connection or transaction approval is required.',
    ].join('\n')

    await send(userId, email, 'tokens_claimable', graduationHolderId, 'graduation_holder', subject, text)
  } catch (err: any) {
    console.error('[notifications] notifyTokensClaimable failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationTokensClaimableFailed',
      message: err?.message ?? 'notifyTokensClaimable failed',
      path: 'lib/notifications.ts/notifyTokensClaimable',
      context: { graduationHolderId, graduationId, stack: err?.stack },
    })
  }
}

export async function notifyStartupGraduated(
  graduationId: string,
  payoutUsdc: number
): Promise<void> {
  try {
    const { data: graduation, error } = await supabaseAdmin
      .from('graduations')
      .select('startup_id, founder_usdc::text')
      .eq('id', graduationId)
      .single()

    if (error || !graduation) {
      console.error('[notifications] could not load graduation:', { graduationId, error })
      void recordSystemError({
        source: 'swallowed',
        name: 'NotificationGraduationLookupError',
        message: error?.message ?? 'could not load graduation',
        path: 'lib/notifications.ts/notifyStartupGraduated',
        context: { graduationId, error: error ? { message: error.message, code: error.code } : null },
      })
      return
    }

    const startupId = (graduation as any).startup_id as string
    const founderUsdcRaw = (graduation as any).founder_usdc as string

    const [startup, founder] = await Promise.all([
      loadStartup(startupId),
      supabaseAdmin
        .from('startup_startups')
        .select('user_id')
        .eq('id', startupId)
        .single(),
    ])

    if (!startup || !founder.data) return

    const userId = (founder.data as any).user_id as string
    const email = await fetchUserEmail(userId)
    if (!email) return

    const payout = payoutUsdc ?? Number(founderUsdcRaw) / 10 ** 6
    const payoutDisplay = payout.toLocaleString(undefined, { maximumFractionDigits: 6 })

    const subject = `${startup.name} has graduated`
    const text = [
      `Your startup ${startup.name} has graduated and the payout has been sent.`,
      '',
      `Founder payout: ${payoutDisplay} USDC`,
      '',
      `You can view the details on the site at ${SITE_URL}/my-startups.`,
      '',
      'This is an informational message. No wallet connection or transaction approval is required.',
    ].join('\n')

    await send(userId, email, 'startup_graduated', graduationId, 'graduation', subject, text)
  } catch (err: any) {
    console.error('[notifications] notifyStartupGraduated failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationStartupGraduatedFailed',
      message: err?.message ?? 'notifyStartupGraduated failed',
      path: 'lib/notifications.ts/notifyStartupGraduated',
      context: { graduationId, payoutUsdc, stack: err?.stack },
    })
  }
}

export async function notifyThresholdCrossed(startupId: string): Promise<void> {
  try {
    const [startup, founder] = await Promise.all([
      loadStartup(startupId),
      supabaseAdmin.from('startup_startups').select('user_id').eq('id', startupId).single(),
    ])

    if (founder.error || !startup || !founder.data) {
      if (founder.error) {
        console.error('[notifications] could not load founder for threshold:', { startupId, error: founder.error })
        void recordSystemError({
          source: 'swallowed',
          name: 'NotificationThresholdFounderLookupError',
          message: founder.error.message,
          path: 'lib/notifications.ts/notifyThresholdCrossed',
          context: { startupId, error: { message: founder.error.message, code: founder.error.code } },
        })
      }
      return
    }

    const userId = (founder.data as any).user_id as string
    const email = await fetchUserEmail(userId)
    if (!email) return

    const subject = `${startup.name} crossed the vote threshold and is now raising`
    const text = [
      `Your startup ${startup.name} crossed the vote threshold and has moved into the raising phase.`,
      '',
      `You can view it on the site at ${SITE_URL}/startup/${startup.slug}.`,
      '',
      'This is an informational message. No wallet connection or transaction approval is required.',
    ].join('\n')

    await send(userId, email, 'threshold_crossed', startupId, 'startup', subject, text)
  } catch (err: any) {
    console.error('[notifications] notifyThresholdCrossed failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationThresholdCrossedFailed',
      message: err?.message ?? 'notifyThresholdCrossed failed',
      path: 'lib/notifications.ts/notifyThresholdCrossed',
      context: { startupId, stack: err?.stack },
    })
  }
}

export async function notifyRaiseFrozen(startupId: string): Promise<void> {
  try {
    const [startup, holders] = await Promise.all([
      loadStartup(startupId),
      supabaseAdmin
        .from('startup_holdings')
        .select('user_id')
        .eq('startup_id', startupId)
        .gt('tokens', 0),
    ])

    if (holders.error) {
      console.error('[notifications] could not load holders:', { startupId, error: holders.error })
      void recordSystemError({
        source: 'swallowed',
        name: 'NotificationHoldersLookupError',
        message: holders.error.message,
        path: 'lib/notifications.ts/notifyRaiseFrozen',
        context: { startupId, error: { message: holders.error.message, code: holders.error.code } },
      })
      return
    }

    if (!startup) return

    const subject = `The ${startup.name} raise has been frozen`
    const text = [
      `The raise for ${startup.name} has been frozen. New buys are paused, but selling remains open.`,
      '',
      `You can view your holding on the site at ${SITE_URL}/portfolio.`,
      '',
      'This is an informational message. No wallet connection or transaction approval is required.',
    ].join('\n')

    const userIds = new Set<string>((holders.data ?? []).map((h: any) => h.user_id as string))

    for (const userId of userIds) {
      const email = await fetchUserEmail(userId)
      if (!email) continue
      await send(userId, email, 'raise_frozen', startupId, 'startup_curve', subject, text)
    }
  } catch (err: any) {
    console.error('[notifications] notifyRaiseFrozen failed:', err)
    void recordSystemError({
      source: 'swallowed',
      name: 'NotificationRaiseFrozenFailed',
      message: err?.message ?? 'notifyRaiseFrozen failed',
      path: 'lib/notifications.ts/notifyRaiseFrozen',
      context: { startupId, stack: err?.stack },
    })
  }
}
