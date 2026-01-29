'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { MonthlyParam, MonthlyParamsStats } from '@/lib/types';

interface MonthlyParamsTrendProps {
  params: MonthlyParam[];
  stats: MonthlyParamsStats | null;
}

export default function MonthlyParamsTrend({ params, stats }: MonthlyParamsTrendProps) {
  // PnL 차트 데이터
  const pnlData = useMemo(() => {
    let cumulative = 0;
    return params.map((p) => {
      cumulative += p.testPnlPct;
      return {
        month: p.testMonth.slice(5), // '01', '02', etc
        fullMonth: p.testMonth,
        pnl: p.testPnlPct,
        cumulative,
        trainSharpe: p.trainSharpe,
        testSharpe: p.testSharpe,
      };
    });
  }, [params]);

  // 파라미터 추이 데이터
  const paramData = useMemo(() => {
    return params.map((p) => ({
      month: p.testMonth.slice(5),
      fullMonth: p.testMonth,
      pl: p.pivotLeft,
      pr: p.pivotRight,
      tp: p.tpPct,
      sl: p.slPct,
    }));
  }, [params]);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;
  const formatSharpe = (value: number) => value.toFixed(2);

  const getDegradationColor = (ratio: number) => {
    if (ratio >= 0.7) return 'text-green-400';
    if (ratio >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDegradationGrade = (ratio: number) => {
    if (ratio >= 0.7) return 'A';
    if (ratio >= 0.5) return 'B';
    if (ratio >= 0.3) return 'C';
    return 'D';
  };

  if (params.length === 0) {
    return (
      <div className="bg-zinc-900 p-8 rounded-lg text-center text-zinc-500">
        저장된 데이터가 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 요약 통계 */}
      {stats && (
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">요약 통계</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-zinc-500">Total Test PnL</div>
              <div className={`text-xl font-bold ${stats.totalTestPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.totalTestPnlPct >= 0 ? '+' : ''}{stats.totalTestPnlPct.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Win Months</div>
              <div className="text-xl font-bold text-white">
                {stats.winMonths}/{stats.totalMonths}
                <span className="text-sm text-zinc-400 ml-1">
                  ({((stats.winMonths / stats.totalMonths) * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Degradation Ratio</div>
              <div className={`text-xl font-bold ${getDegradationColor(stats.degradationRatio)}`}>
                {stats.degradationRatio.toFixed(2)}
                <span className="text-sm ml-1">
                  ({getDegradationGrade(stats.degradationRatio)})
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Avg Train Sharpe</div>
              <div className="text-xl font-bold text-blue-400">{stats.avgTrainSharpe.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Avg Test Sharpe</div>
              <div className="text-xl font-bold text-green-400">{stats.avgTestSharpe.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 차트 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 누적 PnL 커브 */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-4">누적 Test PnL</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="month"
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
                formatter={(value: number) => [formatPercent(value), '누적 PnL']}
                labelFormatter={(label) => `2025-${label}`}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 월별 PnL 막대 */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-4">월별 Test PnL</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="month"
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
                formatter={(value: number) => [formatPercent(value), 'PnL']}
                labelFormatter={(label) => `2025-${label}`}
              />
              <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
              <Bar
                dataKey="pnl"
                radius={[4, 4, 0, 0]}
                fill="#3b82f6"
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

        {/* Train vs Test Sharpe */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-4">Train vs Test Sharpe</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pnlData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="month"
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
                formatter={(value: number, name: string) => [
                  formatSharpe(value),
                  name === 'trainSharpe' ? 'Train' : 'Test',
                ]}
                labelFormatter={(label) => `2025-${label}`}
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

        {/* 파라미터 추이 */}
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-4">파라미터 추이</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={paramData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#71717a', fontSize: 10 }}
                axisLine={{ stroke: '#3f3f46' }}
              />
              <YAxis
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
                labelFormatter={(label) => `2025-${label}`}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px' }}
                formatter={(value) => {
                  const names: Record<string, string> = {
                    pl: 'PivotLeft',
                    pr: 'PivotRight',
                    tp: 'TP%',
                    sl: 'SL%',
                  };
                  return names[value] || value;
                }}
              />
              <Line type="monotone" dataKey="pl" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="pr" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="tp" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="sl" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-zinc-900 p-4 rounded-lg overflow-x-auto">
        <h3 className="text-lg font-semibold text-white mb-4">월별 상세</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-zinc-400 border-b border-zinc-800">
              <th className="text-left py-2 px-2">Month</th>
              <th className="text-left py-2 px-2">Train Period</th>
              <th className="text-center py-2 px-2">PL/PR/TP/SL</th>
              <th className="text-right py-2 px-2">Train Sharpe</th>
              <th className="text-right py-2 px-2">Test Sharpe</th>
              <th className="text-right py-2 px-2">Test PnL</th>
              <th className="text-right py-2 px-2">Trades</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2 px-2 text-white font-medium">{p.testMonth}</td>
                <td className="py-2 px-2 text-zinc-400 text-xs">
                  {p.trainStart} ~ {p.trainEnd}
                </td>
                <td className="py-2 px-2 text-center text-zinc-300 font-mono text-xs">
                  {p.pivotLeft}/{p.pivotRight}/{p.tpPct}/{p.slPct}
                </td>
                <td className="py-2 px-2 text-right text-blue-400">{p.trainSharpe.toFixed(2)}</td>
                <td className="py-2 px-2 text-right text-green-400">{p.testSharpe.toFixed(2)}</td>
                <td className={`py-2 px-2 text-right font-medium ${p.testPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {p.testPnlPct >= 0 ? '+' : ''}{p.testPnlPct.toFixed(2)}%
                </td>
                <td className="py-2 px-2 text-right text-zinc-400">{p.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 파라미터 빈도 */}
      {stats && (
        <div className="bg-zinc-900 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">파라미터 빈도</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-zinc-500 mb-2">Pivot Left</div>
              <div className="space-y-1">
                {Object.entries(stats.paramFrequency.pl)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">PL={val}</span>
                      <span className="text-amber-400">{count}회</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-2">Pivot Right</div>
              <div className="space-y-1">
                {Object.entries(stats.paramFrequency.pr)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">PR={val}</span>
                      <span className="text-purple-400">{count}회</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-2">Take Profit %</div>
              <div className="space-y-1">
                {Object.entries(stats.paramFrequency.tp)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">TP={val}%</span>
                      <span className="text-green-400">{count}회</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-2">Stop Loss %</div>
              <div className="space-y-1">
                {Object.entries(stats.paramFrequency.sl)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">SL={val}%</span>
                      <span className="text-red-400">{count}회</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
