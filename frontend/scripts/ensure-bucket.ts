import { supabaseAdmin } from '@/lib/supabaseServer'

async function main() {
  const { data, error } = await supabaseAdmin.storage.createBucket(
    'token-metadata',
    { public: true }
  )

  if (error) {
    if (
      error.message.includes('already exists') ||
      (error as any).code === '23505'
    ) {
      console.log('Bucket token-metadata already exists')
      return
    }
    console.error('create bucket error:', error)
    process.exit(1)
  }

  console.log('created bucket:', data)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
