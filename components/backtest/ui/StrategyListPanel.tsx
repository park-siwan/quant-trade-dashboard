'use client';

import { useAtom, useAtomValue } from 'jotai';
import { RefreshCw, Zap } from 'lucide-react';
import {
  SavedOptimizeResult,
  TradeResult,
  EquityPoint,
  OpenPosition,
  OptimizationStatusItem,
  ProposeResult,
  ApplyResult,
  refreshSingleStrategy,
  refreshAllStrategies,
  getCachedStrategyDisplayName,
} from '@/lib/backtest-api';
import { OptimizeComparisonCard } from './OptimizeComparisonCard';
import { StrategyMiniChart } from './StrategyMiniChart';
import {
  selectedStrategyAtom,
  refreshingStrategyAtom,
  leverageAtom,
  timeframeAtom,
} from '@/stores/strategyAtoms';
import { symbolIdAtom } from '@/stores/symbolAtom';

interface StrategyStats {
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
}

interface StrategyListPanelProps {
  strategies: SavedOptimizeResult[];
  rollingSharpeData: Map<string, Array<{ timestamp: number; sharpe: number }>>;
  allStrategyStats: Map<string, StrategyStats>;
  allStrategiesEquityCurves: Map<number, EquityPoint[]>;
  allOpenPositions: Map<string, OpenPosition>;
  allTradesMap: Map<string, TradeResult[]>;
  openPosition: OpenPosition | null;
  isLoadingAllStrategies: boolean;
  optimizeStatuses: OptimizationStatusItem[];
  proposeResult: ProposeResult | null;
  isApplying: boolean;
  optimizeError: string | null;
  applyResult: ApplyResult | null;
  optimizingStrategy: string | null;
  optimizeAllProgress: { current: number; total: number } | null;
  onStrategyChange: (strategy: SavedOptimizeResult) => void;
  startOptimize: (strategy: string) => void;
  startOptimizeAll: (strategies: string[]) => void;
  approveOptimize: () => void;
  rejectOptimize: () => void;
  refetchBacktestData: (silent?: boolean, forceRefreshCache?: boolean) => void;
  refetchStrategies: () => void;
}

function getStrategyDisplayName(strategy: SavedOptimizeResult): string {
  if (strategy.note && /[가-힣]/.test(strategy.note)) return strategy.note;
  const match = strategy.note?.match(/\[롤링\]\s*(\w+)/);
  const strategyType = match?.[1] || (strategy as any).strategy || 'rsi_div';
  return getCachedStrategyDisplayName(strategyType);
}

export function StrategyListPanel({
  strategies,
  rollingSharpeData,
  allStrategyStats,
  allStrategiesEquityCurves,
  allOpenPositions,
  allTradesMap,
  openPosition,
  isLoadingAllStrategies,
  optimizeStatuses,
  proposeResult,
  isApplying,
  optimizeError,
  applyResult,
  optimizingStrategy,
  optimizeAllProgress,
  onStrategyChange,
  startOptimize,
  startOptimizeAll,
  approveOptimize,
  rejectOptimize,
  refetchBacktestData,
  refetchStrategies,
}: StrategyListPanelProps) {
  const [selectedStrategy] = useAtom(selectedStrategyAtom);
  const [refreshingStrategy, setRefreshingStrategy] = useAtom(refreshingStrategyAtom);
  const leverage = useAtomValue(leverageAtom);
  const timeframe = useAtomValue(timeframeAtom);
  const symbolId = useAtomValue(symbolIdAtom);

  return (
    <div className='flex flex-col gap-2 min-w-0 h-full'>
      <div className='bg-zinc-900 p-3 rounded-lg flex-1 min-h-0 flex flex-col'>
        <h3 className='text-sm font-medium text-zinc-400 mb-2 shrink-0 flex items-center gap-2'>
          전략 목록 ({strategies.length})
          <span className='text-[10px] text-zinc-600 font-normal'>12주 백테스트</span>
          {isLoadingAllStrategies && (
            <span className='text-[10px] text-blue-400 flex items-center gap-1'>
              <span className='w-2 h-2 rounded-full bg-blue-400 animate-pulse' />
              분석중
            </span>
          )}
          {optimizeAllProgress && (
            <span className='text-[10px] text-yellow-400'>
              {optimizeAllProgress.current}/{optimizeAllProgress.total}
            </span>
          )}
          <div className='ml-auto flex items-center gap-0.5'>
            <button
              onClick={() => {
                const activeStrategies = optimizeStatuses.map(s => s.strategy);
                if (activeStrategies.length > 0) startOptimizeAll(activeStrategies);
              }}
              disabled={!!optimizingStrategy}
              className={`p-1 rounded transition-colors ${
                optimizingStrategy
                  ? 'text-yellow-400 animate-pulse'
                  : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-700'
              }`}
              title='전체 전략 최적화'
            >
              <Zap size={13} />
            </button>
            <button
              onClick={async () => {
                if (refreshingStrategy === '__all__') return;
                setRefreshingStrategy('__all__');
                try {
                  await refreshAllStrategies(symbolId, timeframe);
                  refetchBacktestData(true, true);
                  refetchStrategies();
                } catch (err) {
                  console.error('전체 갱신 실패:', err);
                } finally {
                  setRefreshingStrategy(null);
                }
              }}
              disabled={refreshingStrategy === '__all__'}
              className={`p-1 rounded transition-colors ${
                refreshingStrategy === '__all__'
                  ? 'text-blue-400'
                  : 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-700'
              }`}
              title='전체 전략 캐시 재계산'
            >
              <RefreshCw size={13} className={refreshingStrategy === '__all__' ? 'animate-spin' : ''} />
            </button>
          </div>
        </h3>

        {proposeResult && (
          <div className='mb-2 shrink-0'>
            <OptimizeComparisonCard
              result={proposeResult}
              isApplying={isApplying}
              onApprove={approveOptimize}
              onReject={rejectOptimize}
            />
          </div>
        )}
        {optimizeError && (
          <div className='mb-2 px-2 py-1 bg-red-500/10 border border-red-500/30 rounded text-[10px] text-red-400 shrink-0'>
            {optimizeError}
          </div>
        )}
        {applyResult?.success && !proposeResult && (
          <div className='mb-2 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-[10px] text-green-400 shrink-0'>
            {applyResult.strategy} 최적화 적용 완료
          </div>
        )}

        <div className='flex-1 overflow-y-auto space-y-1 min-h-0 custom-scrollbar'>
          {isLoadingAllStrategies && strategies.length === 0 && (
            <>
              {[...Array(8)].map((_, i) => (
                <div key={`skeleton-${i}`} className='w-full px-2 py-1.5 bg-zinc-800 rounded animate-pulse'>
                  <div className='flex justify-between items-center'>
                    <div className='h-3 bg-zinc-700 rounded w-24' />
                    <div className='h-3 bg-zinc-700 rounded w-12' />
                  </div>
                  <div className='flex items-center gap-1 mt-1.5'>
                    <div className='h-2.5 bg-zinc-700 rounded w-8' />
                    <div className='h-2.5 bg-zinc-700 rounded w-10' />
                    <div className='h-2.5 bg-zinc-700 rounded w-6' />
                  </div>
                </div>
              ))}
            </>
          )}
          {[...strategies].sort((a, b) => {
            if (rollingSharpeData.size > 0) {
              const aData = rollingSharpeData.get(a.strategy || 'rsi_div');
              const bData = rollingSharpeData.get(b.strategy || 'rsi_div');
              const aAvg = aData && aData.length > 0 ? aData.reduce((s, d) => s + d.sharpe, 0) / aData.length : -Infinity;
              const bAvg = bData && bData.length > 0 ? bData.reduce((s, d) => s + d.sharpe, 0) / bData.length : -Infinity;
              return bAvg - aAvg;
            }
            return 0;
          }).slice(0, 30).map((strategy) => {
            const displayName = getStrategyDisplayName(strategy);
            const isSelected = selectedStrategy?.id === strategy.id;
            const strategyType = strategy.strategy || 'rsi_div';
            const dailySharpeArray = rollingSharpeData.get(strategyType);
            const avgSharpe = dailySharpeArray && dailySharpeArray.length > 0
              ? dailySharpeArray.reduce((sum, d) => sum + d.sharpe, 0) / dailySharpeArray.length
              : null;
            const optStatus = optimizeStatuses.find(s => s.strategy === strategyType);
            const tpAtr = optStatus?.currentParams?.tp_atr;
            const slAtr = optStatus?.currentParams?.sl_atr;
            const lastOpt = optStatus?.lastOptimizedAt;
            const lastOptRelative = lastOpt ? (() => {
              const diff = Date.now() - new Date(lastOpt).getTime();
              const mins = Math.floor(diff / 60000);
              if (mins < 60) return `${mins}m ago`;
              const hours = Math.floor(mins / 60);
              if (hours < 24) return `${hours}h ago`;
              return `${Math.floor(hours / 24)}d ago`;
            })() : null;

            return (
              <div
                key={strategy.id}
                className={`w-full px-3 py-2.5 text-left rounded-lg transition-colors ${
                  isSelected ? 'bg-blue-600/30 border border-blue-500/50' : 'bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                <div className='flex items-center mb-1.5'>
                  <button onClick={() => onStrategyChange(strategy)} className='flex items-center gap-1.5 min-w-0 flex-1'>
                    <span className='text-zinc-200 text-[13px] font-semibold truncate'>{displayName}</span>
                    {(() => {
                      const position = isSelected ? openPosition : allOpenPositions.get(strategyType);
                      if (!position) return null;
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                          position.direction === 'long'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {position.direction === 'long' ? '롱' : '숏'}
                        </span>
                      );
                    })()}
                    {avgSharpe !== null && (
                      <span className={`text-[13px] font-bold shrink-0 ${
                        avgSharpe >= 2 ? 'text-green-400' : avgSharpe >= 0 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {avgSharpe.toFixed(1)}
                      </span>
                    )}
                  </button>
                  <div className='flex items-center gap-1 pl-2 ml-2 border-l border-zinc-700 shrink-0'>
                    <button
                      onClick={(e) => { e.stopPropagation(); startOptimize(strategyType); }}
                      disabled={!!optimizingStrategy}
                      className={`p-1 rounded transition-colors ${
                        optimizingStrategy === strategyType ? 'text-yellow-400 animate-pulse'
                          : optimizingStrategy ? 'text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-600/50'
                      }`}
                      title='TP/SL 최적화'
                    >
                      <Zap size={14} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (refreshingStrategy === strategyType) return;
                        setRefreshingStrategy(strategyType);
                        try {
                          await refreshSingleStrategy(symbolId, timeframe, strategyType);
                          refetchBacktestData(true);
                        } catch (err) {
                          console.error('갱신 실패:', err);
                        } finally {
                          setRefreshingStrategy(null);
                        }
                      }}
                      disabled={refreshingStrategy === strategyType}
                      className={`p-1 rounded transition-colors ${
                        refreshingStrategy === strategyType ? 'text-blue-400 animate-spin'
                          : 'text-zinc-500 hover:text-blue-400 hover:bg-zinc-600/50'
                      }`}
                      title='전략 캐시 갱신'
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>

                <button onClick={() => onStrategyChange(strategy)} className='w-full text-left'>
                  <div className='flex items-center gap-1.5 mb-1'>
                    {(() => {
                      const stats = allStrategyStats.get(strategyType);
                      if (!stats || stats.totalTrades === 0) return <span className='text-zinc-600 text-[10px]'>—</span>;
                      const equityCurve = allStrategiesEquityCurves.get(strategy.id) || [];
                      const trades = allTradesMap.get(strategyType) || [];
                      let maxConsecLoss = 0, curStreak = 0;
                      for (const t of trades) {
                        if (t.pnlPercent < 0) { curStreak++; maxConsecLoss = Math.max(maxConsecLoss, curStreak); }
                        else { curStreak = 0; }
                      }
                      let levPnl = stats.totalPnlPercent * leverage;
                      let levDD = 0;
                      if (equityCurve.length > 1 && leverage > 1) {
                        const start = equityCurve[0].equity;
                        let lev = start, peak = start, maxDd = 0;
                        for (let i = 1; i < equityCurve.length; i++) {
                          const r = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
                          lev *= (1 + r * leverage);
                          lev = Math.max(lev, start * 0.01);
                          peak = Math.max(peak, lev);
                          const dd = peak > 0 ? ((peak - lev) / peak) * 100 : 0;
                          maxDd = Math.max(maxDd, dd);
                        }
                        levPnl = ((lev - start) / start) * 100;
                        levDD = maxDd;
                      } else if (equityCurve.length > 0) {
                        levDD = Math.max(...equityCurve.map(p => p.drawdown || 0)) * leverage;
                      }
                      return (
                        <>
                          <span className={`text-[11px] font-medium ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {stats.winRate.toFixed(0)}%
                          </span>
                          <span className='text-zinc-600 text-[10px]'>|</span>
                          <span className={`text-[11px] font-medium ${levPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {levPnl >= 0 ? '+' : ''}{levPnl.toFixed(1)}%
                          </span>
                          <span className='text-zinc-600 text-[10px]'>|</span>
                          <span className='text-zinc-400 text-[11px]'>{stats.totalTrades}회</span>
                          <span className='text-zinc-600 text-[10px]'>|</span>
                          <span className='text-zinc-500 text-[11px]'>일{(stats.totalTrades / 84).toFixed(1)}</span>
                          {levDD > 0 && (
                            <>
                              <span className='text-zinc-600 text-[10px]'>|</span>
                              <span className={`text-[11px] font-medium ${
                                levDD <= 3 ? 'text-orange-400' : levDD <= 5 ? 'text-red-400' : 'text-red-500'
                              }`}>
                                DD-{levDD.toFixed(1)}%
                              </span>
                              {levDD >= 100 && <span className='text-red-500 text-[10px] ml-0.5'>청산</span>}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {(() => {
                    const trades = allTradesMap.get(strategyType) || [];
                    const st = allStrategyStats.get(strategyType);
                    if (!st || trades.length === 0) return null;
                    let maxCL = 0, cur = 0;
                    for (const t of trades) { if (t.pnlPercent < 0) { cur++; maxCL = Math.max(maxCL, cur); } else { cur = 0; } }
                    if (maxCL === 0) return null;
                    const q = 1 - st.winRate / 100;
                    return (
                      <div className='flex items-center gap-1 text-[10px] flex-wrap'>
                        {Array.from({ length: maxCL }, (_, i) => {
                          const n = i + 1;
                          const prob = Math.pow(q, n) * 100;
                          return (
                            <span key={n} className={
                              n === maxCL ? 'text-red-400 font-medium'
                                : prob < 5 ? 'text-orange-400' : 'text-zinc-500'
                            }>
                              {n}패({prob < 1 ? prob.toFixed(1) : prob.toFixed(0)}%)
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className='w-full mb-1'>
                    <StrategyMiniChart equityCurve={allStrategiesEquityCurves.get(strategy.id) || []} leverage={leverage} />
                  </div>

                  <div className='flex items-center gap-1.5 text-[10px]'>
                    {tpAtr != null && slAtr != null && (
                      <span className='text-zinc-500'>TP:{tpAtr} SL:{slAtr}</span>
                    )}
                    {lastOptRelative && <span className='text-zinc-600'>{lastOptRelative}</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
