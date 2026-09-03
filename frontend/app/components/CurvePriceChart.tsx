'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { UTCTimestamp } from 'lightweight-charts'
import { buildCurveTimeSeries } from '@/lib/curve-time-series'
import type { CurveTrade } from '@/lib/curve-time-series'

export type CurvePriceChartProps = {
  opening_price: string
  trades: CurveTrade[]
  graduated?: boolean
  heightClassName?: string
}

export function CurvePriceChart({
  opening_price,
  trades,
  graduated = false,
  heightClassName = 'h-80',
}: CurvePriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<{ chart: any; series: any } | null>(null)

  const { data: seriesData, lastTime } = useMemo(
    () => buildCurveTimeSeries(opening_price, trades),
    [opening_price, trades]
  )


  useEffect(() => {
    let mounted = true
    let cleanup = () => {}

    async function init() {
      const [
        {
          createChart,
          AreaSeries,
          ColorType,
          LineType,
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
          scaleMargins: { top: 0.15, bottom: 0.15 },
        },
        leftPriceScale: { visible: false },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          borderColor: '#E5E7EB',
        },
        handleScroll: false,
        handleScale: false,
      })

      const series = chart.addSeries(AreaSeries, {
        lineType: LineType.WithSteps,
        lineColor: '#3B82F6',
        topColor: 'rgba(59, 130, 246, 0.35)',
        bottomColor: 'rgba(59, 130, 246, 0.02)',
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 12,
          minMove: 0.000000000001,
        },
        lastValueVisible: true,
      })

      series.setData(
        seriesData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
      )
      chart.timeScale().fitContent()

      if (graduated && seriesData.length > 1) {
        createSeriesMarkers(series, [
          {
            time: lastTime as UTCTimestamp,
            position: 'aboveBar',
            color: '#10B981',
            shape: 'circle',
            text: 'Graduation',
            size: 1,
          },
        ])
      }

      chartApiRef.current = { chart, series }

      cleanup = () => {
        chart.remove()
        chartApiRef.current = null
      }
    }

    init()

    return () => {
      mounted = false
      cleanup()
    }
  }, [seriesData, lastTime, graduated])

  return <div ref={containerRef} className={`relative w-full ${heightClassName}`} />
}
