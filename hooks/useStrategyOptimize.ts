'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  fetchOptimizationStatus,
  proposeOptimization,
  applyOptimization,
  OptimizationStatusItem,
  ProposeResult,
  ApplyResult,
} from '@/lib/backtest-api';

interface UseStrategyOptimizeReturn {
  /** 전 전략 상태 */
  strategies: OptimizationStatusItem[];
  isLoadingStatus: boolean;
  /** 현재 최적화 중인 전략 */
  optimizingStrategy: string | null;
  /** 비교 결과 */
  proposeResult: ProposeResult | null;
  /** 적용 중 */
  isApplying: boolean;
  applyResult: ApplyResult | null;
  error: string | null;
  /** 전체 최적화 진행 상태 */
  optimizeAllProgress: { current: number; total: number } | null;
  /** 액션 */
  startOptimize: (strategy: string) => Promise<void>;
  startOptimizeAll: (strategies: string[]) => void;
  approve: () => Promise<void>;
  reject: () => void;
  refreshStatus: () => void;
}

export function useStrategyOptimize(): UseStrategyOptimizeReturn {
  const [strategies, setStrategies] = useState<OptimizationStatusItem[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [optimizingStrategy, setOptimizingStrategy] = useState<string | null>(null);
  const [proposeResult, setProposeResult] = useState<ProposeResult | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOptimizingRef = useRef(false);
  const optimizeQueueRef = useRef<string[]>([]);
  const [optimizeAllProgress, setOptimizeAllProgress] = useState<{ current: number; total: number } | null>(null);

  // 상태 로드
  const refreshStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const data = await fetchOptimizationStatus();
      setStrategies(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // 큐에서 다음 전략 시작
  const processNextInQueue = useCallback(async () => {
    if (optimizeQueueRef.current.length === 0) {
      setOptimizeAllProgress(null);
      return;
    }
    const next = optimizeQueueRef.current[0];
    optimizeQueueRef.current = optimizeQueueRef.current.slice(1);
    setOptimizeAllProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);

    isOptimizingRef.current = true;
    setOptimizingStrategy(next);
    setProposeResult(null);
    setApplyResult(null);
    setError(null);

    try {
      const result = await proposeOptimization(next);
      setProposeResult(result);
    } catch (err: any) {
      setError(err.message);
      setOptimizingStrategy(null);
      // 에러 시에도 큐 계속 진행
      setTimeout(() => processNextInQueue(), 500);
    } finally {
      isOptimizingRef.current = false;
      setOptimizingStrategy(null);
    }
  }, []);

  // 단일 전략 최적화
  const startOptimize = useCallback(async (strategy: string) => {
    if (isOptimizingRef.current) return;
    // 단일 호출 시 큐 초기화
    optimizeQueueRef.current = [];
    setOptimizeAllProgress(null);

    isOptimizingRef.current = true;
    setOptimizingStrategy(strategy);
    setProposeResult(null);
    setApplyResult(null);
    setError(null);

    try {
      const result = await proposeOptimization(strategy);
      setProposeResult(result);
    } catch (err: any) {
      setError(err.message);
      setOptimizingStrategy(null);
    } finally {
      isOptimizingRef.current = false;
      setOptimizingStrategy(null);
    }
  }, []);

  // 전체 전략 순차 최적화
  const startOptimizeAll = useCallback((strategies: string[]) => {
    if (isOptimizingRef.current || strategies.length === 0) return;
    optimizeQueueRef.current = strategies.slice(1);
    setOptimizeAllProgress({ current: 1, total: strategies.length });

    // 첫 번째 전략 시작
    isOptimizingRef.current = true;
    setOptimizingStrategy(strategies[0]);
    setProposeResult(null);
    setApplyResult(null);
    setError(null);

    proposeOptimization(strategies[0])
      .then(result => setProposeResult(result))
      .catch((err: any) => {
        setError(err.message);
        setOptimizingStrategy(null);
        setTimeout(() => processNextInQueue(), 500);
      })
      .finally(() => {
        isOptimizingRef.current = false;
        setOptimizingStrategy(null);
      });
  }, [processNextInQueue]);

  // 승인
  const approve = useCallback(async () => {
    if (!proposeResult) return;
    setIsApplying(true);
    setError(null);

    try {
      const result = await applyOptimization(
        proposeResult.strategy,
        proposeResult.proposed.params,
      );
      setApplyResult(result);
      setProposeResult(null);
      await refreshStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsApplying(false);
      // 큐에 남은 전략이 있으면 다음 진행
      if (optimizeQueueRef.current.length > 0) {
        setTimeout(() => processNextInQueue(), 500);
      } else {
        setOptimizeAllProgress(null);
      }
    }
  }, [proposeResult, refreshStatus, processNextInQueue]);

  // 거절
  const reject = useCallback(() => {
    setProposeResult(null);
    setApplyResult(null);
    setError(null);
    // 큐에 남은 전략이 있으면 다음 진행
    if (optimizeQueueRef.current.length > 0) {
      setTimeout(() => processNextInQueue(), 500);
    } else {
      setOptimizeAllProgress(null);
    }
  }, [processNextInQueue]);

  return {
    strategies,
    isLoadingStatus,
    optimizingStrategy,
    proposeResult,
    isApplying,
    applyResult,
    error,
    optimizeAllProgress,
    startOptimize,
    startOptimizeAll,
    approve,
    reject,
    refreshStatus,
  };
}
