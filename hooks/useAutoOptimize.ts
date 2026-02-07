'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSocketKline } from '@/contexts/SocketContext';
import { triggerAutoOptimization, AutoOptimizeResult } from '@/lib/backtest-api';

interface UseAutoOptimizeParams {
  symbol?: string;
  timeframe?: string;
  enabled?: boolean;
  strategies?: string[];
  candleCount?: number;
}

interface UseAutoOptimizeReturn {
  isOptimizing: boolean;
  lastOptimizeTime: number | null;
  lastResult: AutoOptimizeResult | null;
  error: string | null;
  triggerManual: () => Promise<void>;
}

/**
 * 캔들 마감 시 자동 파라미터 최적화 훅
 *
 * WebSocket으로 캔들 isFinal 감지 → 백엔드 최적화 API 호출
 *
 * 사용법:
 * ```tsx
 * const { isOptimizing, lastResult } = useAutoOptimize({
 *   symbol: 'BTCUSDT',
 *   timeframe: '5m',
 *   enabled: true,
 * });
 * ```
 */
export function useAutoOptimize({
  symbol = 'BTCUSDT',
  timeframe = '5m',
  enabled = false,
  strategies = ['orchestrator', 'vol_breakout'],
  candleCount = 3000,
}: UseAutoOptimizeParams): UseAutoOptimizeReturn {
  const { getKline } = useSocketKline();
  const kline = getKline(timeframe);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [lastOptimizeTime, setLastOptimizeTime] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<AutoOptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 이전 캔들 타임스탬프 추적 (중복 최적화 방지)
  const lastProcessedCandleRef = useRef<number>(0);
  // 최적화 진행 중 플래그 (중복 호출 방지)
  const isOptimizingRef = useRef(false);

  const runOptimization = useCallback(async () => {
    if (isOptimizingRef.current) {
      console.log('[AutoOptimize] Already running, skipping');
      return;
    }

    isOptimizingRef.current = true;
    setIsOptimizing(true);
    setError(null);

    const startTime = Date.now();
    console.log(`[AutoOptimize] Starting optimization for ${symbol}/${timeframe}...`);

    try {
      const result = await triggerAutoOptimization({
        symbol,
        timeframe,
        candleCount,
        strategies,
      });

      setLastResult(result);
      setLastOptimizeTime(Date.now());

      // 결과 로깅
      console.log(`[AutoOptimize] Completed in ${result.duration}ms`);
      for (const r of result.results) {
        const status = r.updated ? 'UPDATED' : 'kept';
        console.log(`  ${r.strategy}: SR=${r.bestSharpe} ${JSON.stringify(r.bestParams)} [${status}]`);
      }
    } catch (err: any) {
      console.error('[AutoOptimize] Failed:', err);
      setError(err.message || 'Optimization failed');
    } finally {
      isOptimizingRef.current = false;
      setIsOptimizing(false);
    }
  }, [symbol, timeframe, candleCount, strategies]);

  // 캔들 마감 감지
  useEffect(() => {
    if (!enabled || !kline) return;

    // 캔들이 마감되었고, 이전에 처리하지 않은 캔들이면 최적화 실행
    if (kline.isFinal && kline.timestamp !== lastProcessedCandleRef.current) {
      console.log(`[AutoOptimize] Candle closed at ${new Date(kline.timestamp).toLocaleTimeString()}`);
      lastProcessedCandleRef.current = kline.timestamp;
      runOptimization();
    }
  }, [enabled, kline, runOptimization]);

  // 수동 트리거
  const triggerManual = useCallback(async () => {
    await runOptimization();
  }, [runOptimization]);

  return {
    isOptimizing,
    lastOptimizeTime,
    lastResult,
    error,
    triggerManual,
  };
}
