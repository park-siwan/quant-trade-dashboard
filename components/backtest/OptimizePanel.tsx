'use client';

import { useState } from 'react';
import {
  OptimizeParams,
  OptimizeResult,
  OptimizeResultItem,
  OptimizeProgress,
  runOptimizationWithProgress,
  runBayesianOptimization,
  BayesianOptimizeParams,
  saveOptimizeResult,
  saveMultipleOptimizeResults,
} from '@/lib/backtest-api';

interface OptimizePanelProps {
  onSaveSuccess?: () => void;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}초`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}분 ${secs}초`;
}

type OptimizeMethod = 'grid' | 'bayesian';

export default function OptimizePanel({ onSaveSuccess }: OptimizePanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OptimizeProgress | null>(null);
  const [optimizeMethod, setOptimizeMethod] = useState<OptimizeMethod>('bayesian');
  const [nTrials, setNTrials] = useState(100);
  const [usePriorResults, setUsePriorResults] = useState(true);
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
      let optimizeResult: OptimizeResult;

      if (optimizeMethod === 'bayesian') {
        const bayesianParams: BayesianOptimizeParams = {
          ...params,
          nTrials,
          usePriorResults,
        };
        optimizeResult = await runBayesianOptimization(bayesianParams, (prog) => {
          setProgress(prog);
        });
      } else {
        optimizeResult = await runOptimizationWithProgress(params, (prog) => {
          setProgress(prog);
        });
      }

      setResult(optimizeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsLoading(false);
      setProgress(null);
    }
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
        optimizeMethod,
        params: item.params,
        result: item.result,
        rank: rank,
      });
      setSaveMessage(`#${rank} 결과가 저장되었습니다.`);
      onSaveSuccess?.();
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
        optimizeMethod,
        results: result.topResults,
      });
      setSaveMessage(`${result.topResults.length}개 결과가 모두 저장되었습니다.`);
      onSaveSuccess?.();
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('저장 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const [showGuide, setShowGuide] = useState(true);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">파라미터 최적화</h2>
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
        >
          <span>{showGuide ? '가이드 숨기기' : '효율적인 사용법'}</span>
          <svg className={`w-4 h-4 transition-transform ${showGuide ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* 효율적인 최적화 가이드 */}
      {showGuide && (
        <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-purple-300 mb-3">효율적인 파라미터 최적화 3단계</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">1</div>
              <div>
                <div className="text-sm text-white font-medium">베이지안으로 빠르게 탐색</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  100회 시도로 유망한 파라미터 영역을 빠르게 파악 (1-2분)
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white">2</div>
              <div>
                <div className="text-sm text-white font-medium">좋은 결과 저장</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  상위 결과 중 유망한 파라미터를 저장 → 다음 베이지안 실행 시 시작점으로 활용
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">3</div>
              <div>
                <div className="text-sm text-white font-medium">그리드 서치로 정밀 탐색 (선택)</div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  모든 파라미터 조합을 완전히 테스트 → 놓친 최적해 없이 확인 (10-30분)
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-700/30 text-xs text-zinc-500">
            <span className="text-purple-400">TIP:</span> 베이지안은 ~11,000개 조합 중 100개만 테스트해도 좋은 결과를 찾습니다. 저장된 결과를 활용하면 더 빠르게 수렴합니다.
          </div>
        </div>
      )}

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
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          {['rsi', 'obv', 'cvd', 'oi'].map(indicator => (
            <label key={indicator} className="flex items-center gap-2 cursor-pointer group">
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
              {indicator === 'oi' && (
                <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded">최근 30일</span>
              )}
            </label>
          ))}
        </div>
        {params.indicators?.includes('oi') && (
          <p className="text-xs text-yellow-400/80">
            ⚠️ OI(미결제약정)는 Binance API 제한으로 최근 30일 데이터만 사용 가능합니다.
          </p>
        )}
      </div>

      {/* 최적화 방식 선택 */}
      <div className="border-t border-zinc-700 pt-4">
        <label className="block text-xs text-zinc-400 mb-2">최적화 방식</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="optimizeMethod"
              checked={optimizeMethod === 'bayesian'}
              onChange={() => setOptimizeMethod('bayesian')}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-zinc-300">베이지안 (Optuna)</span>
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-0.5 rounded">권장</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="optimizeMethod"
              checked={optimizeMethod === 'grid'}
              onChange={() => setOptimizeMethod('grid')}
              className="w-4 h-4 accent-purple-500"
            />
            <span className="text-sm text-zinc-300">그리드 서치</span>
          </label>
        </div>

        {/* 베이지안 옵션 */}
        {optimizeMethod === 'bayesian' && (
          <div className="mt-3 grid grid-cols-2 gap-4 bg-zinc-800/50 p-3 rounded-lg">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">시도 횟수 (Trials)</label>
              <input
                type="number"
                value={nTrials}
                onChange={e => setNTrials(parseInt(e.target.value) || 100)}
                min={50}
                max={500}
                className="w-full bg-zinc-800 text-white px-3 py-2 rounded border border-zinc-700 text-sm"
              />
              <span className={`text-xs ${nTrials < 50 ? 'text-red-400' : nTrials < 100 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                {nTrials < 50 ? '50회 이상 권장 (학습 부족)' : nTrials < 100 ? '100회 이상 권장' : '50~500, 100회 이상 권장'}
              </span>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer mt-5">
                <input
                  type="checkbox"
                  checked={usePriorResults}
                  onChange={e => setUsePriorResults(e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
                />
                <span className="text-sm text-zinc-300">저장된 결과 활용</span>
              </label>
              <span className="text-xs text-zinc-500 block mt-1">이전 최적화 결과를 초기값으로 사용</span>
            </div>
          </div>
        )}
      </div>

      {/* 실행 버튼 */}
      <button
        onClick={handleOptimize}
        disabled={isLoading}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-600 text-white font-medium py-3 rounded-lg transition-colors"
      >
        {isLoading
          ? (optimizeMethod === 'bayesian' ? '베이지안 최적화 실행 중...' : '그리드 서치 실행 중...')
          : (optimizeMethod === 'bayesian' ? `베이지안 최적화 (${nTrials}회)` : '그리드 서치 실행')
        }
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
                <tr className="text-zinc-400 border-b border-zinc-700 text-xs">
                  <th className="text-left py-2 px-1 w-6">#</th>
                  <th className="text-center py-2 px-1">RSI</th>
                  <th className="text-center py-2 px-1">PvL</th>
                  <th className="text-center py-2 px-1">PvR</th>
                  <th className="text-center py-2 px-1">Min</th>
                  <th className="text-center py-2 px-1">Max</th>
                  <th className="text-center py-2 px-1">TP</th>
                  <th className="text-center py-2 px-1">SL</th>
                  <th className="text-center py-2 px-1" title="최소 다이버전스 강도">Div</th>
                  <th className="text-right py-2 px-1">거래</th>
                  <th className="text-right py-2 px-1" title="갈아타기 횟수">플립</th>
                  <th className="text-right py-2 px-1">승률</th>
                  <th className="text-right py-2 px-1">수익률</th>
                  <th className="text-right py-2 px-1">MDD</th>
                  <th className="text-right py-2 px-1">Sharpe</th>
                  <th className="text-right py-2 px-1">PF</th>
                  <th className="text-center py-2 px-1 w-20">액션</th>
                </tr>
              </thead>
              <tbody>
                {result.topResults.map((item, idx) => (
                  <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800">
                    <td className="py-2 px-1 text-zinc-500 text-xs">{idx + 1}</td>
                    <td className="py-2 px-1 text-center text-xs">{item.params.rsi_period}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.pivot_left}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.pivot_right}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.min_distance}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.max_distance}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.tp_atr}</td>
                    <td className="py-2 px-1 text-center text-zinc-400 text-xs">{item.params.sl_atr}</td>
                    <td className="py-2 px-1 text-center text-yellow-400 text-xs">{item.params.min_div_pct ?? '-'}</td>
                    <td className="py-2 px-1 text-right text-xs">{item.result.totalTrades}</td>
                    <td className="py-2 px-1 text-right text-purple-400 text-xs">{item.result.flipCount ?? 0}</td>
                    <td className="py-2 px-1 text-right text-xs">{item.result.winRate.toFixed(1)}%</td>
                    <td className={`py-2 px-1 text-right font-medium text-xs ${item.result.totalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.result.totalPnlPercent >= 0 ? '+' : ''}{item.result.totalPnlPercent.toFixed(1)}%
                    </td>
                    <td className="py-2 px-1 text-right text-red-400 text-xs">{item.result.maxDrawdown.toFixed(1)}%</td>
                    <td className="py-2 px-1 text-right font-medium text-blue-400 text-xs">{item.result.sharpeRatio.toFixed(2)}</td>
                    <td className="py-2 px-1 text-right text-zinc-400 text-xs">{item.result.profitFactor.toFixed(1)}</td>
                    <td className="py-2 px-1 text-center">
                      <button
                        onClick={() => handleSaveOne(item, idx + 1)}
                        disabled={isSaving}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white px-1.5 py-0.5 rounded"
                        title="이 결과만 저장"
                      >
                        저장
                      </button>
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
