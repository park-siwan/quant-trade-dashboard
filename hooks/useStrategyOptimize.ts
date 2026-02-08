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
  /** 액션 */
  startOptimize: (strategy: string) => Promise<void>;
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

  // 최적화 시작
  const startOptimize = useCallback(async (strategy: string) => {
    if (isOptimizingRef.current) return;
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
      // 상태 갱신
      await refreshStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsApplying(false);
    }
  }, [proposeResult, refreshStatus]);

  // 거절
  const reject = useCallback(() => {
    setProposeResult(null);
    setApplyResult(null);
    setError(null);
  }, []);

  return {
    strategies,
    isLoadingStatus,
    optimizingStrategy,
    proposeResult,
    isApplying,
    applyResult,
    error,
    startOptimize,
    approve,
    reject,
    refreshStatus,
  };
}
