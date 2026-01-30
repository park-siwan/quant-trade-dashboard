'use client';

import { useState, useCallback, useEffect } from 'react';
import { Play, Square, Save, History, Zap } from 'lucide-react';
import { streamWalkForward, saveRollingParams, fetchMonthlyParams, fetchMonthlyParamsStats, type WalkForwardEvent } from '@/lib/api/backtest';
import type { WalkForwardWindow, WalkForwardSummary, WalkForwardStatus, MonthlyParam, MonthlyParamsStats } from '@/lib/types';
import WalkForwardChart from './WalkForwardChart';
import MonthlyParamsTrend from './MonthlyParamsTrend';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const TIMEFRAMES = ['5m', '15m', '1h', '4h'];
const REGIME_FILTERS = [
  { value: 'none', label: 'None (필터 없음)' },
  { value: 'hmm', label: 'HMM (안정적)' },
  { value: 'gmm', label: 'GMM (노이즈)' },
] as const;

type ViewMode = 'run' | 'history';
type RegimeFilter = 'none' | 'gmm' | 'hmm';

export default function WalkForward() {
  // 뷰 모드
  const [viewMode, setViewMode] = useState<ViewMode>('history');

  // 입력 상태
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>('none');
  const [trainMonths, setTrainMonths] = useState(4);
  const [testMonths, setTestMonths] = useState(1);

  // 실행 상태
  const [status, setStatus] = useState<WalkForwardStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // 결과
  const [windows, setWindows] = useState<WalkForwardWindow[]>([]);
  const [summary, setSummary] = useState<WalkForwardSummary | null>(null);

  // 히스토리 상태
  const [monthlyParams, setMonthlyParams] = useState<MonthlyParam[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyParamsStats | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 캔들 수 계산 (5분봉 기준)
  const candlesPerMonth: Record<string, number> = {
    '5m': 8640,   // 30일 * 24시간 * 12
    '15m': 2880,  // 30일 * 24시간 * 4
    '1h': 720,    // 30일 * 24시간
    '4h': 180,    // 30일 * 6
  };

  // 히스토리 로드
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [params, stats] = await Promise.all([
        fetchMonthlyParams(symbol, timeframe, regimeFilter),
        fetchMonthlyParamsStats(symbol, timeframe, regimeFilter),
      ]);
      setMonthlyParams(params);
      setMonthlyStats(stats);
    } catch (error) {
      console.error('Failed to load monthly params:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [symbol, timeframe, regimeFilter]);

  // 히스토리 모드에서 심볼/타임프레임/레짐필터 변경 시 자동 로드
  useEffect(() => {
    if (viewMode === 'history') {
      loadHistory();
    }
  }, [viewMode, symbol, timeframe, regimeFilter, loadHistory]);

  const runOptimization = useCallback(async () => {
    setStatus('running');
    setWindows([]);
    setSummary(null);
    setProgress({ current: 0, total: 0 });

    const perMonth = candlesPerMonth[timeframe] || 8640;
    const trainCandles = trainMonths * perMonth;
    const testCandles = testMonths * perMonth;

    try {
      const stream = streamWalkForward({
        symbol,
        timeframe,
        trainCandles,
        testCandles,
      });

      for await (const event of stream) {
        switch (event.type) {
          case 'status':
            setStatusMessage(event.message);
            break;
          case 'progress':
            setProgress({ current: event.current, total: event.total });
            setStatusMessage(event.message);
            break;
          case 'window':
            setWindows(prev => [...prev, event.data]);
            break;
          case 'summary':
            setSummary(event.data);
            break;
          case 'complete':
            setStatus('completed');
            setStatusMessage(event.message);
            break;
          case 'error':
            setStatus('error');
            setStatusMessage(event.message);
            break;
        }
      }

      if (status !== 'error') {
        setStatus('completed');
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '알 수 없는 오류');
    }
  }, [symbol, timeframe, trainMonths, testMonths, status, candlesPerMonth]);

  const stopOptimization = useCallback(() => {
    // TODO: AbortController로 스트림 중단
    setStatus('idle');
    setStatusMessage('중단됨');
  }, []);

  const handleSave = useCallback(async () => {
    if (!summary || windows.length === 0) return;

    const lastWindow = windows[windows.length - 1];
    try {
      await saveRollingParams({
        symbol,
        timeframe,
        strategy: 'rsi_divergence',
        params: lastWindow.bestParams,
        trainSharpe: summary.avgTrainSharpe,
        testSharpe: summary.avgTestSharpe,
        degradationRatio: summary.degradationRatio,
        totalWindows: summary.totalWindows,
      });
      setStatusMessage('저장 완료');
    } catch {
      setStatusMessage('저장 실패');
    }
  }, [summary, windows, symbol, timeframe]);

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

  return (
    <div className="space-y-6">
      {/* 모드 선택 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'history'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <History size={16} />
          저장된 추이
        </button>
        <button
          onClick={() => setViewMode('run')}
          className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'run'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          <Zap size={16} />
          실행 모드
        </button>
      </div>

      {/* 히스토리 모드 */}
      {viewMode === 'history' && (
        <>
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
            <MonthlyParamsTrend params={monthlyParams} stats={monthlyStats} />
          )}
        </>
      )}

      {/* 실행 모드 */}
      {viewMode === 'run' && (
        <>
          {/* 입력 폼 */}
          <div className="bg-zinc-900 p-4 rounded-lg">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Symbol */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Symbol</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  disabled={status === 'running'}
                  className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none"
                >
                  {SYMBOLS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Timeframe */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Timeframe</label>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  disabled={status === 'running'}
                  className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none"
                >
                  {TIMEFRAMES.map(tf => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </div>

              {/* Train Months */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Train (개월)</label>
                <input
                  type="number"
                  value={trainMonths}
                  onChange={(e) => setTrainMonths(Number(e.target.value))}
                  disabled={status === 'running'}
                  min={1}
                  max={12}
                  className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none w-20"
                />
              </div>

              {/* Test Months */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Test (개월)</label>
                <input
                  type="number"
                  value={testMonths}
                  onChange={(e) => setTestMonths(Number(e.target.value))}
                  disabled={status === 'running'}
                  min={1}
                  max={6}
                  className="bg-zinc-800 text-white px-3 py-2 rounded text-sm border border-zinc-700 focus:border-zinc-500 outline-none w-20"
                />
              </div>

              {/* 실행 버튼 */}
              <div className="flex gap-2">
                {status === 'running' ? (
                  <button
                    onClick={stopOptimization}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    <Square size={16} />
                    중단
                  </button>
                ) : (
                  <button
                    onClick={runOptimization}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    <Play size={16} />
                    실행
                  </button>
                )}

                {status === 'completed' && summary && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    <Save size={16} />
                    저장
                  </button>
                )}
              </div>
            </div>

            {/* 진행 상황 */}
            {status === 'running' && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>{statusMessage}</span>
                  <span>{progress.current}/{progress.total}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="mt-4 text-red-400 text-sm">{statusMessage}</div>
            )}
          </div>

          {/* 결과 표시 */}
          {windows.length > 0 && (
            <>
              {/* 요약 통계 */}
              {summary && (
                <div className="bg-zinc-900 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-white mb-4">요약</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-zinc-500">Total Test PnL</div>
                      <div className={`text-xl font-bold ${summary.totalTestPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {summary.totalTestPnlPct >= 0 ? '+' : ''}{summary.totalTestPnlPct.toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Win Windows</div>
                      <div className="text-xl font-bold text-white">
                        {summary.winWindows}/{summary.totalWindows}
                        <span className="text-sm text-zinc-400 ml-1">
                          ({((summary.winWindows / summary.totalWindows) * 100).toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Degradation Ratio</div>
                      <div className={`text-xl font-bold ${getDegradationColor(summary.degradationRatio)}`}>
                        {summary.degradationRatio.toFixed(2)}
                        <span className="text-sm ml-1">
                          ({getDegradationGrade(summary.degradationRatio)})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">Total Trades</div>
                      <div className="text-xl font-bold text-white">{summary.totalTrades}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* 차트 */}
              <WalkForwardChart windows={windows} />

              {/* 결과 테이블 */}
              <div className="bg-zinc-900 p-4 rounded-lg overflow-x-auto">
                <h3 className="text-lg font-semibold text-white mb-4">윈도우별 결과</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-zinc-400 border-b border-zinc-800">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">기간</th>
                      <th className="text-left py-2 px-2">파라미터</th>
                      <th className="text-right py-2 px-2">Train Sharpe</th>
                      <th className="text-right py-2 px-2">Test Sharpe</th>
                      <th className="text-right py-2 px-2">Test PnL</th>
                      <th className="text-right py-2 px-2">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windows.map((w, i) => (
                      <tr key={w.windowId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2 px-2 text-zinc-500">{i + 1}</td>
                        <td className="py-2 px-2 text-zinc-300 text-xs">
                          {w.testStart.slice(0, 10)} ~ {w.testEnd.slice(0, 10)}
                        </td>
                        <td className="py-2 px-2 text-zinc-400 text-xs font-mono">
                          {Object.entries(w.bestParams).map(([k, v]) => `${k}=${v}`).join(', ')}
                        </td>
                        <td className="py-2 px-2 text-right text-zinc-300">{w.trainSharpe.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-zinc-300">{w.testSharpe.toFixed(2)}</td>
                        <td className={`py-2 px-2 text-right font-medium ${w.testPnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {w.testPnlPct >= 0 ? '+' : ''}{w.testPnlPct.toFixed(2)}%
                        </td>
                        <td className="py-2 px-2 text-right text-zinc-400">{w.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

    </div>
  );
}
