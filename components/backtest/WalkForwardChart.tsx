'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { WalkForwardWindow } from '@/lib/types';

interface WalkForwardChartProps {
  windows: WalkForwardWindow[];
}

export default function WalkForwardChart({ windows }: WalkForwardChartProps) {
  // 에쿼티 커브 데이터 (누적 PnL %)
  const equityData = useMemo(() => {
    let cumulative = 0;
    return windows.map((w, i) => {
      cumulative += w.testPnlPct;
      return {
        window: i + 1,
        period: w.testStart.slice(5, 10),
        pnl: w.testPnlPct,
        cumulative,
      };
    });
  }, [windows]);

  // Train vs Test Sharpe 비교 데이터
  const sharpeData = useMemo(() => {
    return windows.map((w, i) => ({
      window: i + 1,
      period: w.testStart.slice(5, 10),
      trainSharpe: w.trainSharpe,
      testSharpe: w.testSharpe,
    }));
  }, [windows]);

  const formatPercent = (value: number | undefined) => value != null ? `${value.toFixed(1)}%` : '0%';
  const formatSharpe = (value: number | undefined) => value != null ? value.toFixed(2) : '0.00';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 에쿼티 커브 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h3 className="text-sm font-semibold text-white mb-4">누적 Test PnL</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={equityData}>
            <defs>
              <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              tickFormatter={formatPercent}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
              }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value) => [formatPercent(value as number | undefined), '누적 PnL']}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#colorPnl)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 윈도우별 PnL 막대 그래프 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <h3 className="text-sm font-semibold text-white mb-4">윈도우별 Test PnL</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={equityData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              tickFormatter={formatPercent}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
              }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value) => [formatPercent(value as number | undefined), 'PnL']}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
            <Bar
              dataKey="pnl"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              // 양수/음수에 따라 색상 변경
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(props: any) => {
                const { x, y, width, height, pnl } = props;
                const fill = pnl >= 0 ? '#22c55e' : '#ef4444';
                const actualY = pnl >= 0 ? y : y + height;
                const actualHeight = Math.abs(height);
                return (
                  <rect
                    x={x}
                    y={actualY - (pnl >= 0 ? actualHeight : 0)}
                    width={width}
                    height={actualHeight}
                    fill={fill}
                    rx={4}
                    ry={4}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Train vs Test Sharpe 비교 */}
      <div className="bg-zinc-900 p-4 rounded-lg lg:col-span-2">
        <h3 className="text-sm font-semibold text-white mb-4">
          Train vs Test Sharpe (과적합 분석)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={sharpeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              tickFormatter={formatSharpe}
              tick={{ fill: '#71717a', fontSize: 10 }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
              }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(value, name) => [
                formatSharpe(value as number | undefined),
                name === 'trainSharpe' ? 'Train' : 'Test',
              ]}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
            <Bar dataKey="trainSharpe" fill="#60a5fa" radius={[4, 4, 0, 0]} name="Train" />
            <Bar dataKey="testSharpe" fill="#22c55e" radius={[4, 4, 0, 0]} name="Test" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-2 text-xs text-zinc-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-400" />
            <span>Train Sharpe</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-500" />
            <span>Test Sharpe</span>
          </div>
        </div>
      </div>
    </div>
  );
}
