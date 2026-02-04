import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SavedOptimizeResult,
  EquityPoint,
  runBacktest,
  runWalkForwardBacktest,
  getDailyRollingSharpeTimeline,
} from '@/lib/backtest-api';

interface BacktestCache {
  trades: any[];
  skippedSignals: any[];
  openPosition: any | null;
  stats: any;
  equityCurve: EquityPoint[];
  timestamp: number;
}

interface UseBacktestRunnerResult {
  equityCurves: Map<number, EquityPoint[]>;
  isLoading: boolean;
  rollingSharpeData: Map<string, Array<{ timestamp: number; sharpe: number }>>;
  backtestCacheRef: React.MutableRefObject<Map<string, BacktestCache>>;
}

/**
 * 백테스트 실행 Hook
 * - 모든 전략에 대해 병렬로 백테스트 실행
 * - equity curve 수집 및 캐싱
 * - Walk-Forward 모드 지원
 */
export function useBacktestRunner(
  strategies: SavedOptimizeResult[],
  symbolId: string,
  timeframe: string,
  useWalkForward: boolean
): UseBacktestRunnerResult {
  const [equityCurves, setEquityCurves] = useState<Map<number, EquityPoint[]>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [rollingSharpeData, setRollingSharpeData] = useState<Map<string, Array<{ timestamp: number; sharpe: number }>>>(new Map());

  // 백테스트 캐시
  const backtestCacheRef = useRef<Map<string, BacktestCache>>(new Map());

  // 동시 실행 방지 guard
  const loadingRef = useRef(false);
  const rollingSharpeLoadingRef = useRef(false);

  useEffect(() => {
    if (strategies.length === 0) return;
    if (loadingRef.current) {
      console.log('[loadAllEquityCurves] SKIP - already running');
      return;
    }

    const loadAllEquityCurves = async () => {
      loadingRef.current = true;
      console.log('[loadAllEquityCurves] START - strategies:', strategies.length);
      setIsLoading(true);
      const newEquityCurves = new Map<number, EquityPoint[]>();

      // 상위 10개 전략만 차트에 표시
      const topStrategies = strategies.slice(0, 10);
      console.log('[loadAllEquityCurves] Top strategies count:', topStrategies.length);

      // 병렬로 모든 전략 백테스트 실행
      await Promise.all(
        topStrategies.map(async (strategy) => {
          try {
            const cacheKey = `${strategy.id}_${symbolId}_${timeframe}`;

            // 캐시에 있으면 사용
            const cached = backtestCacheRef.current.get(cacheKey);
            if (cached && cached.equityCurve.length > 0) {
              newEquityCurves.set(strategy.id, cached.equityCurve);
              return;
            }

            // 백테스트 파라미터 구성
            const candleCountByTimeframe: Record<string, number> = {
              '5m': 30000,
              '15m': 10000,
              '1h': 2500,
            };

            const backtestParams: any = {
              symbol: symbolId,
              timeframe,
              candleCount: candleCountByTimeframe[timeframe] || 5000,
              strategy: strategy.strategy,
            };

            // indicators 파라미터 처리
            if (strategy.indicators) {
              if (typeof strategy.indicators === 'string') {
                backtestParams.indicators = strategy.indicators.split(',').map(s => s.trim()).filter(Boolean);
              } else if (Array.isArray(strategy.indicators)) {
                backtestParams.indicators = strategy.indicators;
              }
            }

            // 전략별 파라미터 추출
            const paramKeys = [
              'rsi_period', 'pivot_left', 'pivot_right', 'min_distance', 'max_distance',
              'tp_atr', 'sl_atr', 'min_rsi_diff', 'rsi_oversold', 'rsi_overbought',
              'regime_filter', 'volume_confirm', 'lookback', 'entry_z', 'exit_z',
              'stop_z', 'vol_filter', 'vol_threshold', 'rsi_confirm', 'sma_period',
              'atr_period', 'compression_mult', 'breakout_period', 'roc_period',
              'roc_threshold', 'volume_mult', 'adx_threshold', 'cooldown_bars',
              'block_in_trend', 'adx_trend_threshold', 'use_ema_trend_filter', 'ema_period',
              'ema_distance_pct', 'use_volume_confirm', 'low_vol_entry_z', 'high_vol_entry_z',
              'use_stoch_confirm', 'stoch_threshold', 'use_rsi_confirm', 'rsi_threshold',
              'use_mini_sideways', 'bb_bandwidth_threshold', 'use_channel_detection',
              'channel_r2_threshold', 'channel_only_mode', 'bb_lookback', 'bb_volume_mult',
            ];

            paramKeys.forEach(key => {
              if ((strategy as any)[key] !== undefined) {
                backtestParams[key] = (strategy as any)[key];
              }
            });

            // Walk-Forward 모드
            if (useWalkForward) {
              const wfResult = await runWalkForwardBacktest(
                strategy.strategy || 'rsi_div',
                symbolId,
                timeframe,
                12
              );

              if (wfResult.combinedEquityCurve && wfResult.combinedEquityCurve.length > 0) {
                newEquityCurves.set(strategy.id, wfResult.combinedEquityCurve);
                console.log(`[loadAllEquityCurves] Strategy ${strategy.id} WF result:`, {
                  equityCurveLength: wfResult.combinedEquityCurve.length,
                });
              }
            } else {
              const result = await runBacktest(backtestParams);

              if (result.equityCurve && result.equityCurve.length > 0) {
                newEquityCurves.set(strategy.id, result.equityCurve);
                console.log(`[loadAllEquityCurves] Strategy ${strategy.id} result:`, {
                  equityCurveLength: result.equityCurve.length,
                });
              }
            }
          } catch (error) {
            console.error(`Failed to load equity curve for strategy ${strategy.id}:`, error);
          }
        })
      );

      console.log('[loadAllEquityCurves] COMPLETE - Map size:', newEquityCurves.size);

      // 참조 안정화: 내용이 동일하면 기존 Map 참조 유지
      setEquityCurves(prev => {
        if (prev.size === newEquityCurves.size) {
          let isEqual = true;
          for (const [id, curve] of newEquityCurves.entries()) {
            const prevCurve = prev.get(id);
            if (!prevCurve || prevCurve.length !== curve.length) {
              isEqual = false;
              break;
            }
            // 첫/마지막 포인트 비교
            if (prevCurve[0]?.timestamp !== curve[0]?.timestamp ||
                prevCurve[prevCurve.length - 1]?.timestamp !== curve[curve.length - 1]?.timestamp) {
              isEqual = false;
              break;
            }
          }
          if (isEqual) {
            console.log('[loadAllEquityCurves] Data unchanged, reusing Map');
            return prev;
          }
        }
        console.log('[loadAllEquityCurves] Data changed, updating Map');
        return newEquityCurves;
      });

      setIsLoading(false);
      loadingRef.current = false;
    };

    loadAllEquityCurves();
  }, [strategies, timeframe, symbolId, useWalkForward]);

  // Rolling Sharpe 데이터 로딩 (일별 타임라인 차트용)
  useEffect(() => {
    if (strategies.length === 0) return;
    if (rollingSharpeLoadingRef.current) {
      console.log('[loadRollingSharpe] SKIP - already running');
      return;
    }

    const loadRollingSharpe = async () => {
      rollingSharpeLoadingRef.current = true;
      try {
        console.log('[loadRollingSharpe] Fetching from backend...');
        const data = await getDailyRollingSharpeTimeline(symbolId, timeframe, 12, 14);

        // Map으로 변환 (strategy type -> rollingSharpe 데이터)
        const newRollingSharpeMap = new Map<string, Array<{ timestamp: number; sharpe: number }>>();
        data.forEach(item => {
          newRollingSharpeMap.set(item.strategy, item.rollingSharpe);
        });

        // 참조 안정화: 내용이 동일하면 기존 Map 참조 유지
        setRollingSharpeData(prev => {
          if (prev.size === newRollingSharpeMap.size) {
            let isEqual = true;
            for (const [strategy, sharpeData] of newRollingSharpeMap.entries()) {
              const prevData = prev.get(strategy);
              if (!prevData || prevData.length !== sharpeData.length) {
                isEqual = false;
                break;
              }
              // 첫/마지막 포인트 비교 (성능 최적화)
              if (prevData[0]?.timestamp !== sharpeData[0]?.timestamp ||
                  prevData[prevData.length - 1]?.timestamp !== sharpeData[sharpeData.length - 1]?.timestamp) {
                isEqual = false;
                break;
              }
            }
            if (isEqual) {
              console.log('[loadRollingSharpe] Data unchanged, reusing Map');
              return prev;
            }
          }
          console.log('[loadRollingSharpe] Data changed, updating Map');
          return newRollingSharpeMap;
        });
        console.log('[loadRollingSharpe] Loaded rolling sharpe for', data.length, 'strategies');
      } catch (error) {
        console.error('[loadRollingSharpe] Failed to load rolling sharpe:', error);
      } finally {
        rollingSharpeLoadingRef.current = false;
      }
    };

    loadRollingSharpe();
  }, [strategies, timeframe, symbolId]);

  return {
    equityCurves,
    isLoading,
    rollingSharpeData,
    backtestCacheRef,
  };
}
