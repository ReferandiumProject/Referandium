export type CurveTrade = {
  id: number
  created_at: string
  side: 'buy' | 'sell'
  usdc_gross: string
  tokens: string
  price_after: string
  pool_usdc_after: string
}

export function buildCurveTimeSeries(
  opening_price: string,
  trades: CurveTrade[]
): { data: { time: number; value: number }[]; lastTime: number } {
  // Order by id so fixture bulk inserts and real trade sequences keep their
  // intended sequence even when created_at values collide.
  const ordered = [...trades].sort((a, b) => a.id - b.id)
  const data: { time: number; value: number }[] = []
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
      lastTime = time
    }
  } else {
    const now = Math.floor(Date.now() / 1000)
    data.push({ time: now, value: Number(opening_price) })
    lastTime = now
  }

  return { data, lastTime }
}
