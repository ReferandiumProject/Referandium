// Pure helper for computing the freeze/unfreeze action the admin panel intends
// to take, given a startup's current frozen state. Extracted out of
// app/admin/page.tsx so the caller-side logic (which value gets sent to
// POST /api/admin/startups/[id]/freeze) can be unit tested independently of
// the API route and RPC layers, which already have their own coverage.
export function getFreezeActionBody(currentlyFrozen: boolean | undefined): { frozen: boolean } {
  return { frozen: !currentlyFrozen }
}
