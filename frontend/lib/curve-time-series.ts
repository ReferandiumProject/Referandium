export type CurveTrade = {
  id: number
  created_at: string
  side: 'buy' | 'sell'
  usdc_gross: string
  tokens: string
  price_after: string
  pool_usdc_after: string
}

export type CurveVolumePoint = {
  time: number
  value: number
  color: string
}

export type CurveOHLCPoint = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume_usdc?: number
  trades?: number
}

export function buildCurveOHLC(rows: any[]): CurveOHLCPoint[] {
  return rows.map((r) => ({
    time: Math.floor(new Date(r.bucket_start).getTime() / 1000),
    open: Number(r.o),
    high: Number(r.h),
    low: Number(r.l),
    close: Number(r.c),
    volume_usdc: r.volume_usdc != null ? Number(r.volume_usdc) : undefined,
    trades: r.trades != null ? Number(r.trades) : undefined,
  }))
}

export function buildCurveTimeSeries(
  opening_price: string,
  trades: CurveTrade[]
): {
  data: { time: number; value: number }[]
  volume: CurveVolumePoint[]
  lastTime: number
} {
  // Order by id so fixture bulk inserts and real trade sequences keep their
  // intended sequence even when created_at values collide.
  const ordered = [...trades].sort((a, b) => a.id - b.id)
  const data: { time: number; value: number }[] = []
  const volume: CurveVolumePoint[] = []
  let lastTime = 0

  if (ordered.length > 0) {
    const firstTradeTime = Math.floor(
      new Date(ordered[0].created_at).getTime() / 1000
    )
    // The opening price holds until the first trade.
    data.push({ time: firstTradeTime - 1, value: Number(opening_price) })
    lastTime = firstTradeTime - 1

    for (const t of ordered) {
      let time = Math.floor(new Date(t.created_at).getTime() / 1000)
      if (time <= lastTime) {
        time = lastTime + 1
      }
      data.push({ time, value: Number(t.price_after) })
      volume.push({
        time,
        value: Number(t.usdc_gross),
        color: t.side === 'sell' ? '#EF4444' : '#10B981',
      })
      lastTime = time
    }
  } else {
    const now = Math.floor(Date.now() / 1000)
    data.push({ time: now, value: Number(opening_price) })
    lastTime = now
  }

  return { data, volume, lastTime }
}
