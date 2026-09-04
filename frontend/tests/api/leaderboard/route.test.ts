import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as getLeaderboard } from '@/app/api/leaderboard/route'
import { supabaseAdmin } from '@/lib/supabaseServer'

vi.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

function makeBuilder(result: { data: any; error: any }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve(result)),
  }
  return builder
}

describe('GET /api/leaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({ data: [], error: null }) as any
    )
  })

  it('returns phase 1 leaderboard with the verified three scores', async () => {
    const rpc = vi.mocked(supabaseAdmin.rpc)
    rpc.mockResolvedValueOnce({
      data: [
        {
          startup_id: 'a',
          slug: 'a',
          name: 'A',
          score: 6708,
          weighted: 6708,
          participants: 5,
          events: 1,
        },
        {
          startup_id: 'b',
          slug: 'b',
          name: 'B',
          score: 5000,
          weighted: 5000,
          participants: 1,
          events: 1,
        },
        {
          startup_id: 'c',
          slug: 'c',
          name: 'C',
          score: 92,
          weighted: 92,
          participants: 1,
          events: 1,
        },
      ],
      error: null,
    } as any)

    const req = new Request(
      'http://localhost:3000/api/leaderboard?phase=1&limit=20'
    )
    const res = await getLeaderboard(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.leaderboard).toHaveLength(3)
    expect(body.leaderboard[0].score).toBe(6708)
    expect(body.leaderboard[1].score).toBe(5000)
    expect(body.leaderboard[2].score).toBe(92)
    expect(rpc).toHaveBeenCalledWith('startup_momentum', {
      p_phase: 1,
      p_limit: 20,
    })
  })

  it('rejects invalid phase', async () => {
    const req = new Request('http://localhost:3000/api/leaderboard?phase=4')
    const res = await getLeaderboard(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('phase')
  })

  it('returns closest-to-crossing for phase 1', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      makeBuilder({
        data: [
          {
            id: 's1',
            slug: 's1',
            name: 'S1',
            total_yes_votes: 80,
            total_no_votes: 0,
            vote_threshold: 100,
          },
          {
            id: 's2',
            slug: 's2',
            name: 'S2',
            total_yes_votes: 30,
            total_no_votes: 0,
            vote_threshold: 100,
          },
        ],
        error: null,
      }) as any
    )

    vi.mocked(supabaseAdmin.rpc).mockResolvedValueOnce({
      data: [],
      error: null,
    } as any)

    const req = new Request('http://localhost:3000/api/leaderboard?phase=1')
    const res = await getLeaderboard(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.closestToCrossing).toHaveLength(2)
    expect(body.closestToCrossing[0].progress).toBe(0.8)
    expect(body.closestToCrossing[1].progress).toBe(0.3)
  })
})
