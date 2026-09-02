import { supabaseAdmin } from '@/lib/supabaseServer'

async function main() {
  const { data, error } = await supabaseAdmin.rpc('verify_graduation_state')
  if (error) {
    throw new Error(`verify_graduation_state RPC failed: ${error.message}`)
  }
  console.log('[verify] result:', JSON.stringify(data, null, 2))
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[verify] failed:', err)
    process.exit(1)
  })
