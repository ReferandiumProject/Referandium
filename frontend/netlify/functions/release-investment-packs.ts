import { supabaseAdmin } from '../../lib/supabaseServer'

export default async (): Promise<Response> => {
  const { data, error } = await supabaseAdmin.rpc('release_due_investment_packs', {
    p_user_id: null,
  })

  if (error) {
    console.error('[netlify/scheduled] release_due_investment_packs failed:', error)
    return new Response('Release failed', { status: 500 })
  }

  const result = Array.isArray(data) ? data[0] : data
  const count = Number(result?.r_released_count ?? 0)
  const usdc = Number(result?.r_released_usdc ?? 0)

  console.log(`[netlify/scheduled] released ${count} packs, ${usdc} USDC`)
  return new Response(`Released ${count} packs, ${usdc} USDC`, { status: 200 })
}

export const config = {
  schedule: '0 * * * *',
}
