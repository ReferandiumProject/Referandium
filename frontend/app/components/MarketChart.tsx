'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
      
      // Fetch all votes for this market/option ordered by time
      let query = supabase
        .from('votes')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: true });
      
      if (selectedOptionId) {
        query = query.eq('option_id', selectedOptionId);
      } else {
        query = query.is('option_id', null);
      }
      
      const { data: votes, error } = await query;
      
      if (error) throw error;
      
      if (votes && votes.length > 0) {
        // Calculate cumulative percentages over time
        let cumulativeYes = 0;
        let cumulativeNo = 0;
        
        const timeSeriesData = votes.map((vote: any) => {
          // Add vote to cumulative totals
          if (vote.vote_direction === 'yes') {
            cumulativeYes += Number(vote.amount_sol || 0);
          } else {
            cumulativeNo += Number(vote.amount_sol || 0);
          }
          
          const total = cumulativeYes + cumulativeNo;
          const yesPercent = total > 0 ? Math.round((cumulativeYes / total) * 100) : 50;
          const noPercent = total > 0 ? Math.round((cumulativeNo / total) * 100) : 50;
          
          // Format date
          const voteDate = new Date(vote.created_at);
          const now = new Date();
          const diffHours = Math.abs(now.getTime() - voteDate.getTime()) / 36e5;
          
          let dateLabel;
          if (diffHours < 24) {
            // Less than 24h: show time
            dateLabel = voteDate.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit' 
            });
          } else {
            // More than 24h: show date
            dateLabel = voteDate.toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric' 
            });
          }
          
          return {
            date: dateLabel,
            yes: yesPercent,
            no: noPercent,
            timestamp: vote.created_at,
            volume: total.toFixed(2)
          };
        });
        
        // Sample data if too many points (keep every Nth point)
        const maxPoints = 30;
        let sampledData = timeSeriesData;
        if (timeSeriesData.length > maxPoints) {
          const step = Math.ceil(timeSeriesData.length / maxPoints);
          sampledData = timeSeriesData.filter((_: any, index: number) => index % step === 0);
          // Always include the last point
          if (!sampledData.includes(timeSeriesData[timeSeriesData.length - 1])) {
            sampledData.push(timeSeriesData[timeSeriesData.length - 1]);
          }
        }
        
        setChartData(sampledData);
      } else {
        // Empty state: no votes yet
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

  // Empty state: no votes yet
  if (chartData.length === 0) {
    return (
      <div className="h-[350px] w-full bg-gray-50 dark:bg-[#13141B] border border-gray-200 dark:border-gray-800 rounded-2xl flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">No signals yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Chart will appear after first vote</p>
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
            stroke="#9CA3AF"
            className="text-xs"
            tick={{ fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {isSimpleMarket ? (
            <>
              <Line 
                type="monotone" 
                dataKey="yes" 
                stroke="#00A859" 
                strokeWidth={3}
                dot={{ fill: '#00A859', r: 4 }}
                name="Yes"
              />
              <Line 
                type="monotone" 
                dataKey="no" 
                stroke="#E02424" 
                strokeWidth={3}
                dot={{ fill: '#E02424', r: 4 }}
                name="No"
              />
            </>
          ) : (
            <>
              <Line 
                type="monotone" 
                dataKey="yes" 
                stroke="#2563EB" 
                strokeWidth={3}
                dot={{ fill: '#2563EB', r: 4 }}
                name="Option 1"
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
