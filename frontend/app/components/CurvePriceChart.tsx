'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UTCTimestamp } from 'lightweight-charts'
import type { CurveOHLCPoint } from '@/lib/curve-time-series'
import { formatCompactPrice } from '@/lib/format'

export type CurvePriceChartProps = {
  ohlc: CurveOHLCPoint[]
  graduated?: boolean
  opening_pool_price?: string | null
  heightClassName?: string
}

function formatTimeLabel(t: number): string {
  const d = new Date(t * 1000)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function CurvePriceChart({
  ohlc,
  graduated = false,
  opening_pool_price,
  heightClassName = 'h-80',
}: CurvePriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<{
    chart: any
    priceSeries: any
    poolSeries?: any
  } | null>(null)
  const [readout, setReadout] = useState<{
    time: string
    price: string
  } | null>(null)

  const seriesData = useMemo(
    () =>
      ohlc.map((d) => ({
        time: d.time as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    [ohlc]
  )

  const maxPrice = useMemo(() => {
    return ohlc.length ? Math.max(0, ...ohlc.map((d) => d.high)) : 0
  }, [ohlc])

  const lastTradeTime = useMemo(() => {
    if (ohlc.length === 0) return 0
    const lastWithTrades = [...ohlc].reverse().find((d) => (d.trades ?? 0) > 0)
    return lastWithTrades ? lastWithTrades.time : ohlc[ohlc.length - 1].time
  }, [ohlc])

  const poolData = useMemo(() => {
    if (!graduated || !opening_pool_price || ohlc.length < 2) return []
    const last = ohlc[ohlc.length - 1]
    const value = Number(opening_pool_price)
    const interval = ohlc.length > 1 ? ohlc[1].time - ohlc[0].time : 3600
    return [
      { time: last.time, value },
      { time: last.time + interval, value },
    ]
  }, [graduated, opening_pool_price, ohlc])

  useEffect(() => {
    let mounted = true
    let cleanup = () => {}

    async function init() {
      const [
        {
          createChart,
          CandlestickSeries,
          LineSeries,
          ColorType,
          LineStyle,
          CrosshairMode,
          createSeriesMarkers,
        },
      ] = await Promise.all([import('lightweight-charts')])

      if (!mounted || !containerRef.current) return

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: '#ffffff' },
          textColor: '#111827',
        },
        grid: {
          vertLines: { color: '#E5E7EB' },
          horzLines: { color: '#E5E7EB' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          autoScale: true,
        },
        leftPriceScale: { visible: false },
        localization: {
          priceFormatter: (price: number) =>
            formatCompactPrice(price) ?? '',
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 0,
          borderColor: '#E5E7EB',
        },
        handleScroll: false,
        handleScale: false,
      })

      const autoscaleMax = Math.max(
        maxPrice,
        opening_pool_price ? Number(opening_pool_price) : 0
      )
      console.log('[CurvePriceChart] autoscaleMax', autoscaleMax)

      const priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10B981',
        downColor: '#EF4444',
        borderUpColor: '#10B981',
        borderDownColor: '#EF4444',
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
        priceFormat: {
          type: 'custom',
          minMove: 0.000000000001,
          formatter: (price: number) =>
            formatCompactPrice(price) ?? '',
        },
        autoscaleInfoProvider: () => {
          return {
            priceRange: {
              minValue: 0,
              maxValue: autoscaleMax * 1.05,
            },
          }
        },
        lastValueVisible: false,
        priceLineVisible: false,
      })

      priceSeries.setData(seriesData)

      if (seriesData.length > 0) {
        chart.timeScale().setVisibleLogicalRange({
          from: 0,
          to: ohlc.length + (poolData.length === 2 ? 2 : 1),
        })
      }

      let poolSeries
      if (poolData.length === 2) {
        poolSeries = chart.addSeries(LineSeries, {
          color: '#F59E0B',
          lineStyle: LineStyle.Dashed,
          lineWidth: 2,
          priceFormat: {
            type: 'custom',
            minMove: 0.000000000001,
            formatter: (price: number) =>
              formatCompactPrice(price) ?? '',
          },
          lastValueVisible: false,
          priceLineVisible: false,
        })
        poolSeries.setData(
          poolData.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
          }))
        )
        createSeriesMarkers(poolSeries, [
          {
            time: (poolData[1].time as number) as UTCTimestamp,
            position: 'aboveBar',
            color: '#F59E0B',
            shape: 'circle',
            text: 'Pool open',
            size: 1,
          },
        ])
      }

      const crosshairHandler = (param: any) => {
        if (!param.time || param.point === undefined) {
          setReadout(null)
          return
        }
        const candle = param.seriesData?.get(priceSeries) as
          | { close: number }
          | undefined
        if (!candle) {
          setReadout(null)
          return
        }
        setReadout({
          time: formatTimeLabel(param.time as number),
          price: formatCompactPrice(candle.close),
        })
      }
      chart.subscribeCrosshairMove(crosshairHandler)

      // Refit on resize so the time axis stays full-width as the canvas grows.
      let rafId = 0
      const resizeObserver = new ResizeObserver(() => {
        if (!containerRef.current) return
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          if (ohlc.length > 0) {
            chart.timeScale().setVisibleLogicalRange({
              from: 0,
              to: ohlc.length + (poolData.length === 2 ? 2 : 1),
            })
          }
        })
      })
      resizeObserver.observe(containerRef.current)

      if (graduated && ohlc.length > 0) {
        createSeriesMarkers(priceSeries, [
          {
            time: lastTradeTime as UTCTimestamp,
            position: 'aboveBar',
            color: '#10B981',
            shape: 'circle',
            text: 'Graduation',
            size: 1,
          },
        ])
      }

      chartApiRef.current = { chart, priceSeries, poolSeries }

      cleanup = () => {
        chart.unsubscribeCrosshairMove(crosshairHandler)
        resizeObserver.disconnect()
        chart.remove()
        chartApiRef.current = null
      }
    }

    init()

    return () => {
      mounted = false
      cleanup()
    }
  }, [seriesData, ohlc, graduated, opening_pool_price])

  return (
    <div className={`relative w-full ${heightClassName}`}>
      {readout && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-baseline gap-3 text-xs">
          <span className="text-[#6B7280]">{readout.time}</span>
          <span className="font-medium text-[#111827]">{readout.price}</span>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
