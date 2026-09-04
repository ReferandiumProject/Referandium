'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UTCTimestamp } from 'lightweight-charts'
import { buildCurveTimeSeries } from '@/lib/curve-time-series'
import type { CurveTrade } from '@/lib/curve-time-series'
import { formatCompactPrice } from '@/lib/format'

export type CurvePriceChartProps = {
  opening_price: string
  trades: CurveTrade[]
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
  opening_price,
  trades,
  graduated = false,
  opening_pool_price,
  heightClassName = 'h-80',
}: CurvePriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartApiRef = useRef<{
    chart: any
    priceSeries: any
    volumeSeries: any
    poolSeries?: any
  } | null>(null)
  const [readout, setReadout] = useState<{
    time: string
    price: string
  } | null>(null)

  const { data: seriesData, volume, lastTime } = useMemo(
    () => buildCurveTimeSeries(opening_price, trades),
    [opening_price, trades]
  )

  const maxPrice = useMemo(() => {
    const values = seriesData.map((d) => d.value)
    return values.length ? Math.max(...values) : 0
  }, [seriesData])

  const maxVolume = useMemo(() => {
    const values = volume.map((v) => v.value)
    return values.length ? Math.max(...values) : 0
  }, [volume])

  const poolData = useMemo(() => {
    if (!graduated || !opening_pool_price || seriesData.length < 2) return []
    const last = seriesData[seriesData.length - 1]
    return [
      { time: last.time, value: last.value },
      { time: last.time + 1, value: Number(opening_pool_price) },
    ]
  }, [graduated, opening_pool_price, seriesData])

  useEffect(() => {
    let mounted = true
    let cleanup = () => {}

    async function init() {
      const [
        {
          createChart,
          AreaSeries,
          HistogramSeries,
          LineSeries,
          ColorType,
          LineType,
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
            formatCompactPrice(price.toString()) ?? '',
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

      const priceSeries = chart.addSeries(AreaSeries, {
        lineType: LineType.WithSteps,
        lineColor: '#3B82F6',
        topColor: 'rgba(59, 130, 246, 0.35)',
        bottomColor: 'rgba(59, 130, 246, 0.02)',
        lineWidth: 2,
        priceFormat: {
          type: 'custom',
          minMove: 0.000000000001,
          formatter: (price: number) =>
            formatCompactPrice(price.toString()) ?? '',
        },
        lastValueVisible: false,
        priceLineVisible: false,
      })

      priceSeries.setData(
        seriesData.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }))
      )

      if (seriesData.length > 0) {
        const max = maxPrice
        priceSeries.priceScale().setVisibleRange({ from: 0, to: max * 1.05 })
        chart.timeScale().setVisibleLogicalRange({
          from: 0,
          to: seriesData.length + 1,
        })
      }

      const volumePane = chart.addPane()
      volumePane.setHeight(80)
      const volumeSeries = volumePane.addSeries(HistogramSeries, {
        color: '#6B7280',
        priceFormat: {
          type: 'price',
          precision: 6,
          minMove: 0.000001,
        },
        priceLineVisible: false,
        lastValueVisible: false,
      })

      volumeSeries.setData(
        volume.map((v) => ({
          time: v.time as UTCTimestamp,
          value: v.value,
          color: v.color,
        }))
      )

      if (maxVolume > 0) {
        volumeSeries
          .priceScale()
          .setVisibleRange({ from: 0, to: maxVolume * 1.2 })
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
              formatCompactPrice(price.toString()) ?? '',
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
      }

      const crosshairHandler = (param: any) => {
        if (!param.time || param.point === undefined) {
          setReadout(null)
          return
        }
        const item = param.seriesData?.get(priceSeries) as
          | { value: number }
          | undefined
        if (!item) {
          setReadout(null)
          return
        }
        setReadout({
          time: formatTimeLabel(param.time as number),
          price: formatCompactPrice(item.value.toString()),
        })
      }
      chart.subscribeCrosshairMove(crosshairHandler)

      // Refit on resize so the time axis stays full-width as the canvas grows.
      let rafId = 0
      const resizeObserver = new ResizeObserver(() => {
        if (!containerRef.current) return
        if (rafId) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          if (seriesData.length > 0) {
            chart.timeScale().setVisibleLogicalRange({
              from: 0,
              to: seriesData.length + 1,
            })
          }
        })
      })
      resizeObserver.observe(containerRef.current)

      if (graduated && seriesData.length > 1) {
        createSeriesMarkers(priceSeries, [
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

      chartApiRef.current = { chart, priceSeries, volumeSeries, poolSeries }

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
  }, [seriesData, volume, lastTime, graduated, opening_pool_price])

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
