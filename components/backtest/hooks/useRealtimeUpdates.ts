import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SavedOptimizeResult,
  TradeResult,
  SkippedSignal,
  OpenPosition,
  BacktestResult,
  EquityPoint,
  runBacktest,
} from '@/lib/backtest-api';

interface BacktestCache {
  trades: TradeResult[];
  skippedSignals: SkippedSignal[];
  openPosition: OpenPosition | null;
  stats: BacktestResult;
  equityCurve: EquityPoint[];
  timestamp: number;
}

interface UseRealtimeUpdatesResult {
  backtestTrades: TradeResult[];
  skippedSignals: SkippedSignal[];
  openPosition: OpenPosition | null;
  backtestStats: BacktestResult | null;
  equityCurve: EquityPoint[];
  lastBacktestTime: Date | null;
  isBacktestRunning: boolean;
  backtestCacheRef: React.MutableRefObject<Map<string, BacktestCache>>;
  loadBacktestTrades: (strategy: SavedOptimizeResult, retryCount?: number, forceRun?: boolean) => Promise<void>;
  clearOpenPosition: () => void;  // TP/SL 도달 시 포지션 즉시 청산
}

const BACKTEST_THROTTLE_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

/**
 * 실시간 백테스트 업데이트 Hook
 * - 전략 선택 시 미리 로드된 trades/openPosition 우선 사용 (API 호출 없음)
 * - fallback으로만 runBacktest 호출
 * - 캐싱 및 throttling으로 성능 최적화
 */
export function useRealtimeUpdates(
  selectedStrategy: SavedOptimizeResult | null,
  symbol: string,
  symbolSlashFormat: string,
  timeframe: string,
  candlesLength: number,
  isLoadingCandles: boolean,
  // 미리 로드된 데이터 (useBacktestRunner에서 제공)
  preloadedTradesMap?: Map<string, TradeResult[]>,
  preloadedOpenPositions?: Map<string, OpenPosition>,
  preloadedStats?: Map<string, BacktestResult>,  // 전략별 통계 (헤더 표시용)
): UseRealtimeUpdatesResult {
  const [backtestTrades, setBacktestTrades] = useState<TradeResult[]>([]);
  const [skippedSignals, setSkippedSignals] = useState<SkippedSignal[]>([]);
  const [openPosition, setOpenPosition] = useState<OpenPosition | null>(null);
  const [backtestStats, setBacktestStats] = useState<BacktestResult | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [lastBacktestTime, setLastBacktestTime] = useState<Date | null>(null);
  const [isBacktestRunning, setIsBacktestRunning] = useState(false);

  // 백테스트 캐시
  const backtestCacheRef = useRef<Map<string, BacktestCache>>(new Map());

  // Throttling ref
  const lastBacktestCallRef = useRef<{
    strategyId: number;
    timeframe: string;
    timestamp: number;
  } | null>(null);

  // 전략 변경 중 플래그
  const isChangingStrategyRef = useRef(false);

  // 백테스트 실행 함수
  const loadBacktestTrades = useCallback(async (
    strategy: SavedOptimizeResult,
    retryCount = 0,
    forceRun = false,
  ) => {
    const startedForStrategyId = strategy.id;
    const cacheKey = `${strategy.id}_${symbol}_${timeframe}`;
    const now = Date.now();

    // 캐시 확인
    if (!forceRun) {
      const cached = backtestCacheRef.current.get(cacheKey);
      if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        console.log('[Backtest] Using cached result for strategy:', startedForStrategyId);
        setBacktestTrades(cached.trades);
        setSkippedSignals(cached.skippedSignals);
        setOpenPosition(cached.openPosition);
        setBacktestStats(cached.stats);
        setEquityCurve(cached.equityCurve);
        setLastBacktestTime(new Date(cached.timestamp));
        isChangingStrategyRef.current = false;
        return;
      }
    }

    // Throttling
    if (
      !forceRun &&
      lastBacktestCallRef.current &&
      lastBacktestCallRef.current.strategyId === strategy.id &&
      lastBacktestCallRef.current.timeframe === timeframe &&
      now - lastBacktestCallRef.current.timestamp < BACKTEST_THROTTLE_MS
    ) {
      console.log('[Backtest] Skipped duplicate call (throttled)');
      return;
    }

    lastBacktestCallRef.current = {
      strategyId: strategy.id,
      timeframe,
      timestamp: now,
    };

    setIsBacktestRunning(true);
    try {
      console.log('[Backtest] Running for strategy:', startedForStrategyId, 'type:', strategy.strategy);

      const result = await runBacktest({
        strategy: (strategy.strategy || 'rsi_div') as any,
        symbol: symbolSlashFormat,
        timeframe: timeframe,
        candleCount: 5000,
        initialCapital: 1000,
        positionSizePercent: 100,
        useLiveData: false,
      });

      // 🔍 **BUG FIX**: trades 배열 방어 로직
      console.log('🔍 [BUG FIX] API response:', {
        statsTradesCount: result.totalTrades,
        tradesArrayLength: result.trades?.length || 0,
        tradesArray: result.trades,
        hasTradesArray: Array.isArray(result.trades),
      });

      // ✅ trades 배열이 없으면 빈 배열로 초기화 (버그 수정)
      const trades = Array.isArray(result.trades) ? result.trades : [];
      if (trades.length === 0 && result.totalTrades > 0) {
        console.warn('⚠️ [BUG DETECTED] Stats shows trades but trades array is empty!', {
          statsTradesCount: result.totalTrades,
          tradesArrayLength: trades.length,
        });
        // API 응답 문제이므로 경고만 출력
      }

      // 캐시 저장
      backtestCacheRef.current.set(cacheKey, {
        trades, // 방어된 trades 사용
        skippedSignals: result.skippedSignals || [],
        openPosition: result.openPosition || null,
        stats: result,
        equityCurve: result.equityCurve || [],
        timestamp: now,
      });

      // 디버그 로그
      console.log('🔍 [Backtest] Result data structure:', {
        hasStartDate: !!result.startDate,
        hasEndDate: !!result.endDate,
        startDate: result.startDate,
        endDate: result.endDate,
        tradesCount: trades.length,
        equityCurveLength: result.equityCurve?.length || 0,
        firstTrade: trades[0],
        lastTrade: trades[trades.length - 1],
      });

      // 상태 업데이트 (방어된 데이터 사용)
      setBacktestTrades(trades);
      setSkippedSignals(result.skippedSignals || []);
      setOpenPosition(result.openPosition || null);
      setBacktestStats(result);
      setEquityCurve(result.equityCurve || []);
      setLastBacktestTime(new Date());

      console.log('[Backtest] Applied result for strategy:', startedForStrategyId, 'Open position:', result.openPosition);
      console.log('[Backtest] Trade entries:', trades.map(t => `${t.direction}@${t.entryTime}`).join(', '));
    } catch (err) {
      console.error('Failed to load backtest trades:', err);

      // 최대 2번 재시도
      if (retryCount < 2) {
        setTimeout(() => loadBacktestTrades(strategy, retryCount + 1, forceRun), 1000);
      } else {
        setBacktestTrades([]);
        setSkippedSignals([]);
        setOpenPosition(null);
      }
    } finally {
      setIsBacktestRunning(false);
      isChangingStrategyRef.current = false;
    }
  }, [symbol, symbolSlashFormat, timeframe]);

  // 전략/타임프레임 변경 시: 미리 로드된 데이터 우선 사용, 없으면 runBacktest 호출
  useEffect(() => {
    if (!selectedStrategy || isLoadingCandles || candlesLength === 0) return;

    const strategyType = selectedStrategy.strategy || 'rsi_div';

    // 1순위: 미리 로드된 데이터 사용 (API 호출 없음)
    if (preloadedTradesMap && preloadedTradesMap.has(strategyType)) {
      const trades = preloadedTradesMap.get(strategyType) || [];
      const openPos = preloadedOpenPositions?.get(strategyType) || null;
      const stats = preloadedStats?.get(strategyType) || null;

      console.log('[Backtest] Using pre-loaded data for strategy:', strategyType, 'trades:', trades.length, 'stats:', !!stats);

      setBacktestTrades(trades);
      setOpenPosition(openPos);
      setBacktestStats(stats);  // 통계도 설정 (헤더 표시용)
      setSkippedSignals([]); // pre-loaded에서는 skippedSignals 없음
      setLastBacktestTime(new Date());
      setIsBacktestRunning(false);
      isChangingStrategyRef.current = false;
      return;
    }

    // 2순위: 캐시 또는 API 호출 (fallback)
    console.log('[Backtest] No pre-loaded data, calling runBacktest for:', strategyType);
    loadBacktestTrades(selectedStrategy);
  }, [selectedStrategy, timeframe, symbol, candlesLength, isLoadingCandles, loadBacktestTrades, preloadedTradesMap, preloadedOpenPositions, preloadedStats]);

  // TP/SL 도달 시 포지션 즉시 청산 함수
  const clearOpenPosition = useCallback(() => {
    console.log('[Backtest] Clearing open position (TP/SL hit)');
    setOpenPosition(null);
  }, []);

  return {
    backtestTrades,
    skippedSignals,
    openPosition,
    backtestStats,
    equityCurve,
    lastBacktestTime,
    isBacktestRunning,
    backtestCacheRef,
    loadBacktestTrades,
    clearOpenPosition,
  };
}
