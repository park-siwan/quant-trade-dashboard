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
  preloadedStats?: Map<string, any>,  // 전략별 통계 (헤더 표시용)
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

  // TP/SL로 퇴출된 포지션의 entryTime (세션 내에서만 유지)
  const exitedEntryTimeRef = useRef<string | null>(null);

  // 전략 변경 시 openPosition 리셋 (다른 전략의 포지션이 남는 것 방지)
  const prevStrategyRef = useRef<string>('');
  useEffect(() => {
    const stratType = selectedStrategy?.strategy || '';
    if (prevStrategyRef.current && stratType !== prevStrategyRef.current) {
      setOpenPosition(null);
      exitedEntryTimeRef.current = null;
    }
    prevStrategyRef.current = stratType;
  }, [selectedStrategy?.strategy]);

  // 리페인팅 방지: 완료된 거래 누적 (백테스트 재실행 시 사라지지 않도록)
  const persistentTradesRef = useRef<Map<string, TradeResult>>(new Map());
  const persistentKeyRef = useRef<string>('');

  /** 새 백테스트 결과를 기존 거래와 병합 (완료된 거래 보존) */
  const mergeTrades = useCallback((newTrades: TradeResult[], key: string): TradeResult[] => {
    // 전략/심볼/타임프레임 변경 시 리셋
    if (key !== persistentKeyRef.current) {
      persistentTradesRef.current.clear();
      persistentKeyRef.current = key;
    }

    const map = persistentTradesRef.current;

    // 새 결과의 거래를 추가/업데이트
    for (const trade of newTrades) {
      map.set(trade.entryTime, trade);
    }

    // entryTime 기준 정렬 후 반환
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime()
    );
  }, []);

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
        const mergeKey = `${strategy.strategy}_${symbol}_${timeframe}`;
        setBacktestTrades(mergeTrades(cached.trades, mergeKey));
        setSkippedSignals(cached.skippedSignals);
        if (cached.openPosition) setOpenPosition(cached.openPosition);
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

      // 12주 데이터로 백테스트 (useBacktestRunner와 동일 기간)
      const TF_MIN: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240 };
      const tfMin = TF_MIN[timeframe] || 5;
      const candleCount = Math.ceil(12 * 7 * 24 * 60 / tfMin);

      const result = await runBacktest({
        strategy: (strategy.strategy || 'rsi_div') as any,
        symbol: symbolSlashFormat,
        timeframe: timeframe,
        candleCount,
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

      // 상태 업데이트 (완료 거래 보존 + 새 결과 병합)
      const mergeKey = `${strategy.strategy}_${symbol}_${timeframe}`;
      setBacktestTrades(mergeTrades(trades, mergeKey));
      setSkippedSignals(result.skippedSignals || []);
      // 리페인팅 방지: 포지션이 있으면 업데이트, 없으면 기존 유지
      const newPos = result.openPosition || null;
      if (newPos) {
        if (exitedEntryTimeRef.current === newPos.entryTime) {
          console.log('[Backtest] Suppressing exited position:', newPos.entryTime);
          setOpenPosition(null);
        } else {
          exitedEntryTimeRef.current = null; // 새 포지션이면 리셋
          setOpenPosition(newPos);
        }
      }
      // newPos === null이면 기존 openPosition 유지 (리페인팅 방지)
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
  }, [symbol, symbolSlashFormat, timeframe, mergeTrades]);

  // 전략/타임프레임 변경 시: 미리 로드된 데이터 우선 사용, 없으면 runBacktest 호출
  useEffect(() => {
    if (!selectedStrategy || isLoadingCandles || candlesLength === 0) return;

    const strategyType = selectedStrategy.strategy || 'rsi_div';

    // 1순위: 미리 로드된 데이터 사용 (API 호출 없음)
    if (preloadedTradesMap) {
      if (preloadedTradesMap.has(strategyType)) {
        const trades = preloadedTradesMap.get(strategyType) || [];
        const openPos = preloadedOpenPositions?.get(strategyType) || null;
        const stats = preloadedStats?.get(strategyType) || null;

        console.log('[Backtest] Using pre-loaded data for strategy:', strategyType, 'trades:', trades.length, 'stats:', !!stats);

        const mergeKey = `${strategyType}_${symbol}_${timeframe}`;
        setBacktestTrades(mergeTrades(trades, mergeKey));
        // 리페인팅 방지: 포지션이 있으면 업데이트, 없으면 기존 유지 (TP/SL 감지로만 제거)
        if (openPos) {
          if (exitedEntryTimeRef.current === openPos.entryTime) {
            setOpenPosition(null);
          } else {
            setOpenPosition(openPos);
          }
        }
        // openPos === null이면 기존 openPosition 유지 (백테스트 리페인팅으로 사라지는 것 방지)
        setBacktestStats(stats);  // 통계도 설정 (헤더 표시용)
        setSkippedSignals([]); // pre-loaded에서는 skippedSignals 없음
        setLastBacktestTime(new Date());
        setIsBacktestRunning(false);
        isChangingStrategyRef.current = false;
      } else {
        // preload 시스템 활성 but 아직 미로딩 → 대기 (API fallback 방지: 리페인팅 원인)
        console.log('[Backtest] Waiting for pre-loaded data for:', strategyType);
      }
      return;
    }

    // preload 시스템 없을 때만 API fallback
    console.log('[Backtest] No preload system, calling runBacktest for:', strategyType);
    loadBacktestTrades(selectedStrategy);
  }, [selectedStrategy, timeframe, symbol, candlesLength, isLoadingCandles, loadBacktestTrades, preloadedTradesMap, preloadedOpenPositions, preloadedStats]);

  // TP/SL 도달 시 포지션 즉시 청산 함수
  const clearOpenPosition = useCallback(() => {
    setOpenPosition(prev => {
      if (prev) {
        console.log('[Backtest] Clearing open position (TP/SL hit), entry:', prev.entryTime);
        exitedEntryTimeRef.current = prev.entryTime;
      }
      return null;
    });
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
