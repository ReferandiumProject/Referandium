import { supabaseAdmin } from '@/lib/supabaseServer'

async function main() {
  const { data, error } = await supabaseAdmin
    .from('graduations')
    .select(
      'id, status, startup_id, token_name, token_symbol, total_supply, tokens_to_holders, tokens_to_lp, dust_to_lp'
    )
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('graduations query error:', error)
    process.exit(1)
  }

  console.log('graduations:', JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
