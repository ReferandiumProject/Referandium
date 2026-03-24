'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface MarketChartProps {
  marketId: string;
  isSimpleMarket: boolean;
  selectedOptionId?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1C24] p-3">
        <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-xs">
            <div 
              className="w-2 h-2 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
            <span className="font-bold text-gray-900 dark:text-white">{entry.value}%</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function MarketChart({ marketId, isSimpleMarket, selectedOptionId }: MarketChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChartData();
  }, [marketId, selectedOptionId]);

  const fetchChartData = async () => {
    try {
      setLoading(true);
      
      // Fetch all signals for this market ordered by time
      let query = supabase
        .from('signals')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: true });
      
      if (selectedOptionId) {
        query = query.eq('option_id', selectedOptionId);
      }
      
      const { data: signals, error } = await query;
      
      if (error) throw error;
      
      if (signals && signals.length > 0) {
        // Sort by date
        const sorted = [...signals].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        let yesCount = 0;
        let noCount = 0;
        const timeSeriesData: any[] = [];
        
        // Add starting point at 50/50 before first signal
        const firstDate = new Date(sorted[0].created_at);
        firstDate.setDate(firstDate.getDate() - 1);
        const startDateKey = firstDate.toLocaleDateString('en-US', { 
          month: 'short', day: 'numeric' 
        });
        
        timeSeriesData.push({
          date: startDateKey,
          YES: 50,
        });
        
        sorted.forEach((signal: any) => {
          if (signal.signal_direction === 'yes') yesCount++;
          else noCount++;
          
          const total = yesCount + noCount;
          const dateKey = new Date(signal.created_at).toLocaleDateString('en-US', { 
            month: 'short', day: 'numeric' 
          });
          
          // Update or add point for this date
          const existing = timeSeriesData.findIndex(d => d.date === dateKey);
          const point = {
            date: dateKey,
            YES: Math.round((yesCount / total) * 100),
            NO: Math.round((noCount / total) * 100),
          };
          
          if (existing >= 0) {
            timeSeriesData[existing] = point;
          } else {
            timeSeriesData.push(point);
          }
        });
        
        setChartData(timeSeriesData);
      } else {
        // Empty state: no signals yet
        setChartData([]);
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
      setChartData([]);
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return (
      <div className="h-[350px] w-full bg-gray-50 dark:bg-[#13141B] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center">
        <p className="text-gray-400">Loading chart...</p>
      </div>
    );
  }

  // Empty state: no signals yet
  if (chartData.length === 0) {
    return (
      <div className="h-[350px] w-full bg-gray-50 dark:bg-[#13141B] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">No signals yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Chart will appear after first signal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[350px] w-full bg-gray-50 dark:bg-[#13141B] border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#E5E7EB" 
            className="dark:stroke-gray-800" 
            opacity={0.3}
          />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            className="text-xs"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <YAxis 
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            stroke="#9CA3AF"
            className="text-xs"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine 
            y={50} 
            stroke="#9CA3AF" 
            strokeDasharray="3 3" 
            opacity={0.5}
          />
          
          <Line 
            type="monotone" 
            dataKey="YES" 
            stroke="#3B82F6" 
            strokeWidth={2}
            dot={{ fill: '#3B82F6', r: 3 }}
            name="YES"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
