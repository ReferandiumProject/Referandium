import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { POST as uploadUrl } from '@/app/api/startup-logos/upload-url/route'
import { PATCH as patchMyStartup } from '@/app/api/my-startups/[id]/route'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { supabaseAdmin } from '@/lib/supabaseServer'
import {
  createMyStartupsFixtureUser,
  createMyStartupsFixtureStartup,
  cleanupMyStartupsFixtures,
} from '../my-startups/fixtures'

vi.mock('@/lib/auth-helpers', () => ({
  getAuthenticatedUser: vi.fn(),
}))

const userIds: string[] = []
const startupIds: string[] = []
const pathsToDelete: string[] = []

async function ensureBucket() {
  const { error } = await supabaseAdmin.storage.getBucket('startup-logos')
  if (error) {
    await supabaseAdmin.storage.createBucket('startup-logos', { public: true })
  }
}

beforeAll(ensureBucket)

afterAll(async () => {
  if (pathsToDelete.length > 0) {
    await supabaseAdmin.storage.from('startup-logos').remove(pathsToDelete)
  }
  await cleanupMyStartupsFixtures(userIds, startupIds)
})

beforeEach(() => {
  vi.clearAllMocks()
})

function makeUploadUrlRequest(authUser: { id: string; email: string } | undefined, body: any) {
  if (authUser) {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  } else {
    vi.mocked(getAuthenticatedUser).mockRejectedValue(new Error('Unauthorized'))
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authUser) headers.Authorization = 'Bearer mock-token'

  return new Request('http://localhost:3000/api/startup-logos/upload-url', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function makePatchRequest(authUser: { id: string; email: string }, startupId: string, body: any) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(authUser as any)
  return new Request(`http://localhost:3000/api/my-startups/${startupId}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePng() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
}

function makeFakePng() {
  return new TextEncoder().encode('this is not a png, even though the name says .png')
}

async function uploadToSignedUrl(signedUrl: string, contentType: string, body: Uint8Array) {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-upsert': 'false',
    },
    body: body as any,
  })
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    throw new Error(`Signed upload failed: ${res.status} ${await res.text()}`)
  }
}

describe('POST /api/startup-logos/upload-url', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await uploadUrl(makeUploadUrlRequest(undefined, { startup_id: 'ignored', content_type: 'image/png' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when the caller does not own the startup', async () => {
    const owner = await createMyStartupsFixtureUser()
    const other = await createMyStartupsFixtureUser()
    const startup = await createMyStartupsFixtureStartup(owner.id)
    userIds.push(owner.id, other.id)
    startupIds.push(startup.id)

    const res = await uploadUrl(
      makeUploadUrlRequest(other, { startup_id: startup.id, content_type: 'image/png' })
    )
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/forbidden/i)
  })

  it('returns a signed URL whose path is server-chosen and scoped to the startup', async () => {
    const owner = await createMyStartupsFixtureUser()
    const startup = await createMyStartupsFixtureStartup(owner.id)
    userIds.push(owner.id)
    startupIds.push(startup.id)

    const res = await uploadUrl(
      makeUploadUrlRequest(owner, { startup_id: startup.id, content_type: 'image/png' })
    )
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.signedUrl).toBeTruthy()
    expect(json.path).toMatch(new RegExp(`^${startup.id}/[^/]+\\.png$`))
    expect(json.publicUrl).toContain(json.path)

    pathsToDelete.push(json.path)

    await uploadToSignedUrl(json.signedUrl, 'image/png', makePng())

    const { data, error } = await supabaseAdmin.storage.from('startup-logos').download(json.path)
    expect(error).toBeNull()
    expect(data).toBeTruthy()

    const patchRes = await patchMyStartup(makePatchRequest(owner, startup.id, { logo_url: json.publicUrl }), { params: { id: startup.id } })
    expect(patchRes.status).toBe(200)

    const { data: row } = await supabaseAdmin
      .from('startup_startups')
      .select('logo_url')
      .eq('id', startup.id)
      .single()
    expect(row?.logo_url).toBe(json.publicUrl)
  })
})

describe('logo content validation on PATCH /api/my-startups/[id]', () => {
  it('rejects a .png file with non-PNG bytes and deletes the object', async () => {
    const owner = await createMyStartupsFixtureUser()
    const startup = await createMyStartupsFixtureStartup(owner.id)
    userIds.push(owner.id)
    startupIds.push(startup.id)

    const res = await uploadUrl(
      makeUploadUrlRequest(owner, { startup_id: startup.id, content_type: 'image/png' })
    )
    expect(res.status).toBe(200)
    const { signedUrl, path, publicUrl } = await res.json()
    pathsToDelete.push(path)

    await uploadToSignedUrl(signedUrl, 'image/png', makeFakePng())

    const patchRes = await patchMyStartup(
      makePatchRequest(owner, startup.id, { logo_url: publicUrl }),
      { params: { id: startup.id } }
    )
    expect(patchRes.status).toBe(400)
    const json = await patchRes.json()
    expect(json.error).toMatch(/invalid logo file|does not match contents|recognized image format/i)

    const { data: objects } = await supabaseAdmin.storage.from('startup-logos').list(startup.id)
    expect((objects ?? []).map((o) => o.name)).not.toContain(path.split('/').pop())

    const { data: row } = await supabaseAdmin
      .from('startup_startups')
      .select('logo_url')
      .eq('id', startup.id)
      .single()
    expect(row?.logo_url).toBeNull()
  })
})
