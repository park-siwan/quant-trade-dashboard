import { useState, useEffect, useRef } from 'react';
import {
  SavedOptimizeResult,
  EquityPoint,
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
 * - daily-rolling-sharpe API 1회 호출로 모든 전략의 equity curve + rolling sharpe 데이터 로드
 * - 별도 /backtest/run 호출 제거 (6개 → 0개)
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

  // 백테스트 캐시 (선택된 전략의 실시간 업데이트용)
  const backtestCacheRef = useRef<Map<string, BacktestCache>>(new Map());

  // 동시 실행 방지 guard
  const loadingRef = useRef(false);

  // daily-rolling-sharpe API에서 rollingSharpe + equityCurve 모두 로드
  useEffect(() => {
    if (strategies.length === 0) return;
    if (loadingRef.current) {
      console.log('[useBacktestRunner] SKIP - already running');
      return;
    }

    const loadData = async () => {
      loadingRef.current = true;
      setIsLoading(true);

      try {
        console.log('[useBacktestRunner] Fetching from daily-rolling-sharpe API...');
        const data = await getDailyRollingSharpeTimeline(symbolId, timeframe, 12, 14);

        // Map으로 변환
        const newRollingSharpeMap = new Map<string, Array<{ timestamp: number; sharpe: number }>>();
        const newEquityCurves = new Map<number, EquityPoint[]>();

        // 전략 타입 → ID 매핑 생성
        const strategyTypeToId = new Map<string, number>();
        strategies.forEach(s => {
          strategyTypeToId.set(s.strategy || 'rsi_div', s.id);
        });

        data.forEach(item => {
          // rollingSharpe 저장
          newRollingSharpeMap.set(item.strategy, item.rollingSharpe);

          // equityCurve 저장 (전략 ID로 매핑)
          const strategyId = strategyTypeToId.get(item.strategy);
          if (strategyId && item.equityCurve && item.equityCurve.length > 0) {
            // timestamp 타입 정규화 + drawdown 계산
            let maxEquity = item.equityCurve[0].equity;
            const normalizedCurve: EquityPoint[] = item.equityCurve.map(point => {
              const equity = point.equity;
              maxEquity = Math.max(maxEquity, equity);
              const drawdown = maxEquity > 0 ? ((maxEquity - equity) / maxEquity) * 100 : 0;
              return {
                timestamp: typeof point.timestamp === 'number'
                  ? String(point.timestamp)
                  : String(point.timestamp),
                equity,
                drawdown,
              };
            });
            newEquityCurves.set(strategyId, normalizedCurve);
          }
        });

        // 참조 안정화: rollingSharpeData
        setRollingSharpeData(prev => {
          if (prev.size === newRollingSharpeMap.size) {
            let isEqual = true;
            for (const [strategy, sharpeData] of newRollingSharpeMap.entries()) {
              const prevData = prev.get(strategy);
              if (!prevData || prevData.length !== sharpeData.length) {
                isEqual = false;
                break;
              }
              if (prevData[0]?.timestamp !== sharpeData[0]?.timestamp ||
                  prevData[prevData.length - 1]?.timestamp !== sharpeData[sharpeData.length - 1]?.timestamp) {
                isEqual = false;
                break;
              }
            }
            if (isEqual) {
              console.log('[useBacktestRunner] rollingSharpe unchanged, reusing Map');
              return prev;
            }
          }
          console.log('[useBacktestRunner] rollingSharpe changed, updating Map');
          return newRollingSharpeMap;
        });

        // 참조 안정화: equityCurves
        setEquityCurves(prev => {
          if (prev.size === newEquityCurves.size) {
            let isEqual = true;
            for (const [id, curve] of newEquityCurves.entries()) {
              const prevCurve = prev.get(id);
              if (!prevCurve || prevCurve.length !== curve.length) {
                isEqual = false;
                break;
              }
              if (prevCurve[0]?.timestamp !== curve[0]?.timestamp ||
                  prevCurve[prevCurve.length - 1]?.timestamp !== curve[curve.length - 1]?.timestamp) {
                isEqual = false;
                break;
              }
            }
            if (isEqual) {
              console.log('[useBacktestRunner] equityCurves unchanged, reusing Map');
              return prev;
            }
          }
          console.log('[useBacktestRunner] equityCurves changed, updating Map');
          return newEquityCurves;
        });

        console.log('[useBacktestRunner] Loaded data for', data.length, 'strategies');
      } catch (error) {
        console.error('[useBacktestRunner] Failed to load data:', error);
      } finally {
        setIsLoading(false);
        loadingRef.current = false;
      }
    };

    loadData();
  }, [strategies, timeframe, symbolId]);

  return {
    equityCurves,
    isLoading,
    rollingSharpeData,
    backtestCacheRef,
  };
}
