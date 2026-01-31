'use client';

import { useState, useCallback, useEffect } from 'react';
import { fetchMonthlyParams, fetchMonthlyParamsStats, fetchRobustParams, type RobustParams } from '@/lib/api/backtest';
import type { MonthlyParam, MonthlyParamsStats } from '@/lib/types';
import MonthlyParamsTrend from './MonthlyParamsTrend';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const TIMEFRAMES = ['5m', '15m', '1h', '4h'];
const REGIME_FILTERS = [
  { value: 'none', label: 'None (필터 없음)' },
  { value: 'hmm', label: 'HMM (안정적)' },
  { value: 'gmm', label: 'GMM (노이즈)' },
] as const;

type RegimeFilter = 'none' | 'gmm' | 'hmm';

export default function WalkForward() {
  // 입력 상태
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>('hmm');

  // 히스토리 상태
  const [monthlyParams, setMonthlyParams] = useState<MonthlyParam[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyParamsStats | null>(null);
  const [robustParams, setRobustParams] = useState<RobustParams | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [params, stats, robust] = await Promise.all([
        fetchMonthlyParams(symbol, timeframe, regimeFilter),
        fetchMonthlyParamsStats(symbol, timeframe, regimeFilter),
        fetchRobustParams(symbol, timeframe, regimeFilter),
      ]);
      setMonthlyParams(params);
      setMonthlyStats(stats);
      setRobustParams(robust);
    } catch (error) {
      console.error('Failed to load monthly params:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [symbol, timeframe, regimeFilter]);

  // 심볼/타임프레임/레짐필터 변경 시 자동 로드
  useEffect(() => {
    loadHistory();
  }, [symbol, timeframe, regimeFilter, loadHistory]);

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <div className="bg-zinc-900 p-4 rounded-lg">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none"
            >
              {SYMBOLS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none"
            >
              {TIMEFRAMES.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Regime Filter</label>
            <select
              value={regimeFilter}
              onChange={(e) => setRegimeFilter(e.target.value as RegimeFilter)}
              className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none"
            >
              {REGIME_FILTERS.map(rf => (
                <option key={rf.value} value={rf.value}>{rf.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadHistory}
            disabled={historyLoading}
            className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:opacity-50"
          >
            {historyLoading ? '로딩...' : '조회'}
          </button>
        </div>
      </div>

      {/* 히스토리 데이터 표시 */}
      {historyLoading ? (
        <div className="bg-zinc-900 p-8 rounded-lg text-center text-zinc-500">
          로딩 중...
        </div>
      ) : (
        <MonthlyParamsTrend
          params={monthlyParams}
          stats={monthlyStats}
          robustParams={robustParams}
          symbol={symbol}
          timeframe={timeframe}
          regimeFilter={regimeFilter}
        />
      )}
    </div>
  );
}
