'use client';

import { useState } from 'react';
import {
  OptimizeParams,
  OptimizeResult,
  OptimizeResultItem,
  OptimizeProgress,
  runOptimizationWithProgress,
  saveOptimizeResult,
  saveMultipleOptimizeResults,
} from '@/lib/backtest-api';

interface OptimizePanelProps {
  onApplyParams: (params: {
    rsiPeriod: number;
    pivotLeftBars: number;
    pivotRightBars: number;
    minDistance: number;
    maxDistance: number;
    takeProfitAtr: number;
    stopLossAtr: number;
  }) => void;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}분 ${secs}초`;
}

export default function OptimizePanel({ onApplyParams }: OptimizePanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [params, setParams] = useState<OptimizeParams>({
    symbol: 'BTC/USDT',
    timeframe: '5m',
    candleCount: 5000,
    indicators: ['rsi', 'obv', 'cvd', 'oi'],
    initialCapital: 1000,
    positionSizePercent: 100,
    metric: 'sharpe',
    topResults: 10,
  });

  const handleOptimize = async () => {
    setIsLoading(true);
    setError(null);
    setProgress(null);
    setResult(null);

    try {
      const optimizeResult = await runOptimizationWithProgress(params, (prog) => {
        setProgress(prog);
      });
      setResult(optimizeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleApply = (item: OptimizeResultItem) => {
    onApplyParams({
      rsiPeriod: item.params.rsi_period,
      pivotLeftBars: item.params.pivot_left,
      pivotRightBars: item.params.pivot_right,
      minDistance: item.params.min_distance,
      maxDistance: item.params.max_distance,
      takeProfitAtr: item.params.tp_atr,
      stopLossAtr: item.params.sl_atr,
    });
  };

  const handleSaveOne = async (item: OptimizeResultItem, rank: number) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await saveOptimizeResult({
        symbol: params.symbol,
        timeframe: params.timeframe,
        candleCount: params.candleCount,
        indicators: params.indicators || [],
        metric: params.metric || 'sharpe',
        params: item.params,
        result: item.result,
        rank: rank,
      });
      setSaveMessage(`#${rank} 결과가 저장되었습니다.`);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('저장 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!result) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await saveMultipleOptimizeResults({
        symbol: params.symbol,
        timeframe: params.timeframe,
        candleCount: params.candleCount,
        indicators: params.indicators || [],
        metric: params.metric || 'sharpe',
        results: result.topResults,
      });
      setSaveMessage(`${result.topResults.length}개 결과가 모두 저장되었습니다.`);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('저장 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-4 rounded-lg space-y-4">
      <h2 className="text-lg font-semibold text-white mb-4">파라미터 최적화</h2>

      {/* 설정 */}
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">타임프레임</label>
          <select
            value={params.timeframe}
            onChange={e => setParams(p => ({ ...p, timeframe: e.target.value }))}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          >
            <option value="5m">5분</option>
            <option value="15m">15분</option>
            <option value="1h">1시간</option>
            <option value="4h">4시간</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">캔들 수</label>
          <input
            type="number"
            value={params.candleCount}
            onChange={e => setParams(p => ({ ...p, candleCount: parseInt(e.target.value) }))}
            min={1000}
            max={5000}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">최적화 기준</label>
          <select
            value={params.metric}
            onChange={e => setParams(p => ({ ...p, metric: e.target.value as OptimizeParams['metric'] }))}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          >
            <option value="sharpe">Sharpe Ratio</option>
            <option value="profit">총 수익률</option>
            <option value="winrate">승률</option>
            <option value="profitfactor">Profit Factor</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">상위 결과</label>
          <input
            type="number"
            value={params.topResults}
            onChange={e => setParams(p => ({ ...p, topResults: parseInt(e.target.value) }))}
            min={5}
            max={20}
            className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
          />
        </div>
      </div>

      {/* 지표 선택 */}
      <div className="flex flex-wrap gap-3">
        {['rsi', 'obv', 'cvd', 'oi'].map(indicator => (
          <label key={indicator} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={params.indicators?.includes(indicator) || false}
              onChange={e => {
                const current = params.indicators || [];
                if (e.target.checked) {
                  setParams(p => ({ ...p, indicators: [...current, indicator] }));
                } else {
                  setParams(p => ({ ...p, indicators: current.filter(i => i !== indicator) }));
                }
              }}
              className="w-4 h-4 accent-blue-500"
            />
            <span className="text-sm text-zinc-300 uppercase">{indicator}</span>
          </label>
        ))}
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleOptimize}
        disabled={isLoading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {isLoading ? '최적화 실행 중...' : '최적화 실행'}
      </button>

      {/* 진행 상황 */}
      {isLoading && progress && (
        <div className="bg-zinc-800 p-4 rounded-lg space-y-3">
          {progress.type === 'status' && (
            <div className="text-zinc-300 text-sm">{progress.message}</div>
          )}

          {progress.type === 'progress' && (
            <>
              {/* 진행바 */}
              <div className="relative h-4 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress.percent || 0}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-medium">
                  {progress.current} / {progress.total} ({progress.percent}%)
                </div>
              </div>

              {/* 시간 정보 */}
              <div className="flex justify-between text-xs text-zinc-400">
                <span>경과: {formatTime(progress.elapsed || 0)}</span>
                <span>예상 남은 시간: {formatTime(progress.remaining || 0)}</span>
              </div>

              {/* 현재까지 최고 성과 */}
              {progress.best && (
                <div className="border-t border-zinc-700 pt-3 mt-3">
                  <div className="text-xs text-zinc-400 mb-2">현재까지 최고 성과:</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <span className="text-zinc-500">수익률:</span>{' '}
                      <span className={progress.best.result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {progress.best.result.totalPnlPercent >= 0 ? '+' : ''}{progress.best.result.totalPnlPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500">승률:</span>{' '}
                      <span className="text-white">{progress.best.result.winRate.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Sharpe:</span>{' '}
                      <span className="text-white">{progress.best.result.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {/* 결과 */}
      {result && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-zinc-400">
              총 {result.totalCombinations}개 조합 중 {result.validResults}개 유효 (기준: {result.metric})
            </div>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white px-3 py-1.5 rounded"
            >
              {isSaving ? '저장 중...' : '전체 저장'}
            </button>
          </div>

          {saveMessage && (
            <div className={`text-sm mb-2 ${saveMessage.includes('실패') ? 'text-red-400' : 'text-green-400'}`}>
              {saveMessage}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-700">
                  <th className="text-left py-2 px-2 w-8">#</th>
                  <th className="text-center py-2 px-2">RSI</th>
                  <th className="text-center py-2 px-2">Pivot L</th>
                  <th className="text-center py-2 px-2">Pivot R</th>
                  <th className="text-center py-2 px-2">Min Dist</th>
                  <th className="text-center py-2 px-2">Max Dist</th>
                  <th className="text-center py-2 px-2">TP ATR</th>
                  <th className="text-center py-2 px-2">SL ATR</th>
                  <th className="text-right py-2 px-2">거래수</th>
                  <th className="text-right py-2 px-2">승률</th>
                  <th className="text-right py-2 px-2">수익률</th>
                  <th className="text-right py-2 px-2">Sharpe</th>
                  <th className="text-right py-2 px-2">PF</th>
                  <th className="text-center py-2 px-2 w-24">액션</th>
                </tr>
              </thead>
              <tbody>
                {result.topResults.map((item, idx) => (
                  <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800">
                    <td className="py-2 px-2 text-zinc-500">{idx + 1}</td>
                    <td className="py-2 px-2 text-center">{item.params.rsi_period}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.pivot_left}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.pivot_right}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.min_distance}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.max_distance}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.tp_atr}</td>
                    <td className="py-2 px-2 text-center text-zinc-400">{item.params.sl_atr}</td>
                    <td className="py-2 px-2 text-right">{item.result.totalTrades}</td>
                    <td className="py-2 px-2 text-right">{item.result.winRate.toFixed(1)}%</td>
                    <td className={`py-2 px-2 text-right font-medium ${item.result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.result.totalPnlPercent >= 0 ? '+' : ''}{item.result.totalPnlPercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-right font-medium text-blue-400">{item.result.sharpeRatio.toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-zinc-400">{item.result.profitFactor.toFixed(1)}</td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => handleApply(item)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                        >
                          적용
                        </button>
                        <button
                          onClick={() => handleSaveOne(item, idx + 1)}
                          disabled={isSaving}
                          className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white px-2 py-1 rounded"
                          title="이 결과만 저장"
                        >
                          저장
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
