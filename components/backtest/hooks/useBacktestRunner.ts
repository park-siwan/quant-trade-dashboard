import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SavedOptimizeResult,
  EquityPoint,
  OpenPosition,
  TradeResult,
  getDailyRollingSharpeTimeline,
  refreshAllStrategies,
} from '@/lib/backtest-api';

interface BacktestCache {
  trades: any[];
  skippedSignals: any[];
  openPosition: any | null;
  stats: any;
  equityCurve: EquityPoint[];
  timestamp: number;
}

interface StrategyStats {
  totalTrades: number;
  winRate: number;
  totalPnlPercent: number;
}

interface UseBacktestRunnerResult {
  equityCurves: Map<number, EquityPoint[]>;
  isLoading: boolean;
  rollingSharpeData: Map<string, Array<{ timestamp: number; sharpe: number }>>;
  allOpenPositions: Map<string, OpenPosition>;  // 모든 전략의 현재 포지션
  allStrategyStats: Map<string, StrategyStats>;  // 모든 전략의 통계 (12주 기준)
  allTradesMap: Map<string, TradeResult[]>;  // 모든 전략의 거래 내역 (마커 표시용)
  backtestCacheRef: React.MutableRefObject<Map<string, BacktestCache>>;
  refetch: (silent?: boolean, forceRefreshCache?: boolean) => void;  // 데이터 강제 새로고침 (silent: 로딩 표시 없이, forceRefreshCache: 백엔드 캐시도 갱신)
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
  const [allOpenPositions, setAllOpenPositions] = useState<Map<string, OpenPosition>>(new Map());
  const [allStrategyStats, setAllStrategyStats] = useState<Map<string, StrategyStats>>(new Map());
  const [allTradesMap, setAllTradesMap] = useState<Map<string, TradeResult[]>>(new Map());

  // 백테스트 캐시 (선택된 전략의 실시간 업데이트용)
  const backtestCacheRef = useRef<Map<string, BacktestCache>>(new Map());

  // 동시 실행 방지 guard
  const loadingRef = useRef(false);

  // silent refetch 모드 (로딩 표시 없이 데이터만 갱신)
  const silentRefetchRef = useRef(false);

  // 강제 refetch를 위한 키
  const [refetchKey, setRefetchKey] = useState(0);
  const refetch = useCallback(async (silent: boolean = false, forceRefreshCache: boolean = false) => {
    silentRefetchRef.current = silent;
    loadingRef.current = false; // guard 해제

    // 캐시 강제 갱신 옵션 (JSON 파라미터 변경 후 사용)
    if (forceRefreshCache) {
      console.log('[useBacktestRunner] Force refreshing backend cache...');
      await refreshAllStrategies(symbolId, timeframe);
    }

    setRefetchKey((k) => k + 1);
  }, [symbolId, timeframe]);

  // daily-rolling-sharpe API에서 rollingSharpe + equityCurve 모두 로드
  useEffect(() => {
    if (strategies.length === 0) return;
    if (loadingRef.current) {
      console.log('[useBacktestRunner] SKIP - already running');
      return;
    }

    const loadData = async () => {
      loadingRef.current = true;
      const isSilent = silentRefetchRef.current;
      silentRefetchRef.current = false; // 리셋

      if (!isSilent) {
        setIsLoading(true);
      }

      try {
        console.log('[useBacktestRunner] Fetching from daily-rolling-sharpe API...');
        const data = await getDailyRollingSharpeTimeline(symbolId, timeframe, 12, 60);

        // Map으로 변환
        const newRollingSharpeMap = new Map<string, Array<{ timestamp: number; sharpe: number }>>();
        const newEquityCurves = new Map<number, EquityPoint[]>();
        const newOpenPositions = new Map<string, OpenPosition>();
        const newStrategyStats = new Map<string, StrategyStats>();
        const newTradesMap = new Map<string, TradeResult[]>();

        // 전략 타입 → ID 매핑 생성
        const strategyTypeToId = new Map<string, number>();
        strategies.forEach(s => {
          strategyTypeToId.set(s.strategy || 'rsi_div', s.id);
        });

        data.forEach(item => {
          // rollingSharpe 저장
          newRollingSharpeMap.set(item.strategy, item.rollingSharpe);

          // openPosition 저장
          if (item.openPosition) {
            newOpenPositions.set(item.strategy, item.openPosition as OpenPosition);
          }

          // 통계 데이터 저장 (12주 기준)
          newStrategyStats.set(item.strategy, {
            totalTrades: item.totalTrades || 0,
            winRate: item.winRate || 0,
            totalPnlPercent: item.totalPnlPercent || 0,
          });

          // trades 저장 (마커 표시용)
          if (item.trades && item.trades.length > 0) {
            newTradesMap.set(item.strategy, item.trades);
          }

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

        // openPositions 업데이트 (안티-리페인팅: 새 데이터에 포지션이 없으면 기존 유지)
        setAllOpenPositions(prev => {
          const merged = new Map(prev);
          // 새 포지션이 있으면 업데이트
          for (const [strategy, pos] of newOpenPositions) {
            merged.set(strategy, pos);
          }
          // 새 데이터에 없는 전략의 기존 포지션은 유지 (리페인팅 방지)
          // 단, 새 데이터에서 해당 전략의 마지막 거래가 포지션 진입 이후면 → 청산된 것이므로 제거
          for (const [strategy, existingPos] of prev) {
            if (!newOpenPositions.has(strategy)) {
              const trades = newTradesMap.get(strategy);
              if (trades && trades.length > 0) {
                const lastTrade = trades[trades.length - 1];
                const lastTradeTime = new Date(lastTrade.exitTime || lastTrade.entryTime).getTime();
                const posEntryTime = new Date(existingPos.entryTime).getTime();
                if (lastTradeTime >= posEntryTime) {
                  // 마지막 거래가 포지션 진입 이후 → 청산됨
                  merged.delete(strategy);
                  continue;
                }
              }
              // 그 외: 기존 포지션 유지 (리페인팅 방지)
            }
          }
          return merged;
        });
        console.log('[useBacktestRunner] Open positions:', Array.from(newOpenPositions.entries()).map(([s, p]) => `${s}: ${p.direction}`));

        // strategyStats 업데이트
        setAllStrategyStats(newStrategyStats);
        console.log('[useBacktestRunner] Strategy stats:', Array.from(newStrategyStats.entries()).map(([s, st]) => `${s}: ${st.totalTrades}회`));

        // tradesMap 업데이트 (안티-리페인팅: 새 데이터에 거래가 없으면 기존 유지)
        setAllTradesMap(prev => {
          const merged = new Map(prev);
          for (const [strategy, trades] of newTradesMap) {
            merged.set(strategy, trades);
          }
          // 새 데이터에 없는 전략의 기존 거래는 유지
          return merged;
        });
        console.log('[useBacktestRunner] Trades loaded:', Array.from(newTradesMap.entries()).map(([s, t]) => `${s}: ${t.length}개`));

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
        if (!isSilent) {
          setIsLoading(false);
        }
        loadingRef.current = false;
      }
    };

    loadData();
  }, [strategies, timeframe, symbolId, refetchKey]);

  return {
    equityCurves,
    isLoading,
    rollingSharpeData,
    allOpenPositions,
    allStrategyStats,
    allTradesMap,
    backtestCacheRef,
    refetch,
  };
}
