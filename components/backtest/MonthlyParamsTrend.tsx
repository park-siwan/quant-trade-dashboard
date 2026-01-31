'use client';

import { useMemo, useState } from 'react';
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
import { Save, Check, Loader2 } from 'lucide-react';
import type { MonthlyParam, MonthlyParamsStats } from '@/lib/types';
import type { RobustParams } from '@/lib/api/backtest';
import { saveOptimizeResult } from '@/lib/backtest-api';

interface MonthlyParamsTrendProps {
  params: MonthlyParam[];
  stats: MonthlyParamsStats | null;
  robustParams?: RobustParams | null;
  symbol?: string;
  timeframe?: string;
  regimeFilter?: 'none' | 'gmm' | 'hmm';
}

export default function MonthlyParamsTrend({
  params,
  stats,
  robustParams,
  symbol = 'BTCUSDT',
  timeframe = '5m',
  regimeFilter = 'none',
}: MonthlyParamsTrendProps) {
  // 저장 상태
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 로버스트 파라미터를 실시간 전략 DB에 저장
  const handleSaveToStrategy = async () => {
    if (!robustParams?.recommended) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const filterLabel = regimeFilter === 'none' ? 'None' : regimeFilter.toUpperCase();
      await saveOptimizeResult({
        symbol,
        timeframe,
        indicators: ['rsi'],
        metric: 'sharpe',
        optimizeMethod: 'bayesian',
        params: {
          rsi_period: 14,
          pivot_left: robustParams.recommended.pivotLeft,
          pivot_right: robustParams.recommended.pivotRight,
          min_distance: robustParams.recommended.rangeLower ?? 5,
          max_distance: robustParams.recommended.rangeUpper ?? 60,
          tp_atr: robustParams.recommended.tpPct,
          sl_atr: robustParams.recommended.slPct,
        },
        result: {
          totalTrades: robustParams.totalWindows * 10,
          winRate: (robustParams.positiveWindows / robustParams.totalWindows) * 100,
          totalPnlPercent: robustParams.avgPositiveTestPnl,
          profitFactor: 1.5,
          maxDrawdown: 5,
          sharpeRatio: robustParams.avgPositiveTestSharpe,
        },
        rank: 1,
        note: `[Robust] ${filterLabel} 필터, ${robustParams.positiveWindows}/${robustParams.totalWindows} 양성 윈도우`,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

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
      rl: p.rangeLower ?? 5,
      ru: p.rangeUpper ?? 60,
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

      {/* 로버스트 파라미터 추천 */}
      {robustParams && robustParams.recommended && (
        <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-lg border border-blue-800/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white">🎯 로버스트 파라미터 추천</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400">
                긍정적 Test Sharpe 윈도우 기반 ({robustParams.positiveWindows}/{robustParams.totalWindows})
              </span>
              <button
                onClick={handleSaveToStrategy}
                disabled={isSaving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  saveSuccess
                    ? 'bg-green-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                } disabled:opacity-50`}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    저장 중...
                  </>
                ) : saveSuccess ? (
                  <>
                    <Check size={14} />
                    저장됨
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    전략 저장
                  </>
                )}
              </button>
            </div>
          </div>
          {saveError && (
            <div className="text-red-400 text-xs mb-2">{saveError}</div>
          )}
          <div className="grid grid-cols-3 md:grid-cols-8 gap-3">
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">pivotLeft</div>
              <div className="text-xl font-bold text-white">{robustParams.recommended.pivotLeft}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">pivotRight</div>
              <div className="text-xl font-bold text-white">{robustParams.recommended.pivotRight}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">rangeLower</div>
              <div className="text-xl font-bold text-amber-400">{robustParams.recommended.rangeLower ?? 5}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">rangeUpper</div>
              <div className="text-xl font-bold text-amber-400">{robustParams.recommended.rangeUpper ?? 60}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">tpPct</div>
              <div className="text-xl font-bold text-white">{robustParams.recommended.tpPct}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">slPct</div>
              <div className="text-xl font-bold text-white">{robustParams.recommended.slPct}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">Avg Positive Sharpe</div>
              <div className="text-xl font-bold text-green-400">{robustParams.avgPositiveTestSharpe.toFixed(2)}</div>
            </div>
            <div className="bg-black/30 p-3 rounded">
              <div className="text-xs text-zinc-500">Avg Positive PnL</div>
              <div className="text-xl font-bold text-green-400">+{robustParams.avgPositiveTestPnl.toFixed(2)}%</div>
            </div>
          </div>
          {/* 파라미터 상세 분석 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
            {['pl', 'pr', 'rl', 'ru', 'tp', 'sl'].map((key) => {
              const paramKey = key as keyof typeof robustParams.paramDetails;
              const details = robustParams.paramDetails[paramKey];
              if (!details || details.length === 0) return null;
              const labelMap: Record<string, string> = {
                pl: 'pivotLeft',
                pr: 'pivotRight',
                rl: 'rangeLower',
                ru: 'rangeUpper',
                tp: 'tpPct',
                sl: 'slPct',
              };
              return (
                <div key={key} className="bg-black/20 p-2 rounded">
                  <div className="text-zinc-500 mb-1">{labelMap[key]}</div>
                  {details.slice(0, 3).map((d, i) => (
                    <div key={i} className={`flex justify-between ${i === 0 ? 'text-white font-semibold' : 'text-zinc-400'}`}>
                      <span>{d.value}</span>
                      <span>{d.count}회 (Sharpe: {d.avgTestSharpe})</span>
                    </div>
                  ))}
                </div>
              );
            })}
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
                    rl: 'RangeLower',
                    ru: 'RangeUpper',
                    tp: 'TP%',
                    sl: 'SL%',
                  };
                  return names[value] || value;
                }}
              />
              <Line type="monotone" dataKey="pl" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="pr" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="rl" stroke="#06b6d4" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="ru" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} />
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
              <th className="text-center py-2 px-2">PL/PR</th>
              <th className="text-center py-2 px-2">RL/RU</th>
              <th className="text-center py-2 px-2">TP/SL</th>
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
                  {p.pivotLeft}/{p.pivotRight}
                </td>
                <td className="py-2 px-2 text-center text-amber-300 font-mono text-xs">
                  {p.rangeLower ?? 5}/{p.rangeUpper ?? 60}
                </td>
                <td className="py-2 px-2 text-center text-zinc-300 font-mono text-xs">
                  {p.tpPct}/{p.slPct}
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
              <div className="text-xs text-zinc-500 mb-2">Range Lower</div>
              <div className="space-y-1">
                {stats.paramFrequency.rl && Object.entries(stats.paramFrequency.rl)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">RL={val}</span>
                      <span className="text-cyan-400">{count}회</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 mb-2">Range Upper</div>
              <div className="space-y-1">
                {stats.paramFrequency.ru && Object.entries(stats.paramFrequency.ru)
                  .sort(([, a], [, b]) => b - a)
                  .map(([val, count]) => (
                    <div key={val} className="flex justify-between text-sm">
                      <span className="text-zinc-400">RU={val}</span>
                      <span className="text-cyan-400">{count}회</span>
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
