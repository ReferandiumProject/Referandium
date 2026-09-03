'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { formatPrice } from '@/lib/format'

export type CurveTrade = {
  id: number
  side: 'buy' | 'sell'
  usdc_gross: string
  tokens: string
  price_after: string
  pool_usdc_after: string
}

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
  const data = useMemo(() => {
    const points = [
      {
        index: 0,
        label: 'Open',
        price: Number(opening_price),
        priceStr: opening_price,
        side: null as string | null,
      },
    ]
    trades.forEach((t, i) => {
      const isLast = i === trades.length - 1
      points.push({
        index: i + 1,
        label: graduated && isLast ? 'Graduation' : t.side,
        price: Number(t.price_after),
        priceStr: t.price_after,
        side: t.side,
      })
    })
    return points
  }, [opening_price, trades, graduated])

  const maxIndex = data.length - 1

  function Dot(props: any) {
    const { cx, cy, index, stroke } = props
    if (graduated && index === maxIndex) {
      return (
        <g key={index}>
          <circle
            cx={cx}
            cy={cy}
            r={4}
            fill={stroke}
            stroke="#fff"
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            className="fill-[#111827] text-[10px] font-medium"
          >
            Graduation
          </text>
        </g>
      )
    }
    return <circle cx={cx} cy={cy} r={2} fill={stroke} />
  }

  return (
    <div className={`w-full ${heightClassName}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 24, right: 16, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
          <XAxis
            dataKey="index"
            tickFormatter={(v) => (v === 0 ? 'Open' : String(v))}
            tick={{ fill: '#6B7280', fontSize: 12 }}
            axisLine={{ stroke: '#E5E7EB' }}
            tickLine={false}
            label={{
              value: 'Trade',
              position: 'insideBottom',
              offset: -2,
              fill: '#6B7280',
              fontSize: 12,
            }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v) => formatPrice(v)}
            tick={{ fill: '#6B7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={90}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="stepAfter"
            dataKey="price"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={<Dot />}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-sm text-xs">
      <p className="font-medium text-[#111827]">
        {p.label === 'Open' ? 'Opening price' : `Trade ${label} · ${p.side}`}
      </p>
      <p className="mt-1 text-[#3B82F6]">{formatPrice(p.priceStr)}</p>
    </div>
  )
}
