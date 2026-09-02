import fs from 'fs'
import { preflightGraduationLaunch } from '@/lib/graduation/preflight'

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
  const result = await preflightGraduationLaunch(GRADUATION_ID)
  if (!result.passed) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
