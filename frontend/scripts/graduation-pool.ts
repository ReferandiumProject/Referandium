import fs from 'fs'
import { createGraduationPool } from '@/lib/graduation/pool'

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) {
    try {
      ;(process as any).loadEnvFile?.(file)
    } catch {
      // ignore on older Node versions
    }
  }
}

const GRADUATION_ID =
  process.env.GRADUATION_ID ?? '7abff8a6-f3e2-4d64-a286-3cd37c6bf185'

async function main() {
  const result = await createGraduationPool(GRADUATION_ID)
  if (!result.success) {
    console.error('Pool creation failed:', result.reason)
    process.exit(1)
  }
  console.log('Pool created:', result.poolAddress)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
