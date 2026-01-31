'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchCurrentRegime, CurrentRegimeStatus } from '@/lib/api/backtest';

interface UseRegimeParams {
  symbol: string;
  timeframe: string;
  periodDays?: number;
  enabled?: boolean;
}

/**
 * 현재 시장 레짐 상태 조회 훅
 * - HMM/GMM 기반 레짐 감지 (Bullish/Sideways/Bearish)
 * - RSI 다이버전스 전략은 Sideways 레짐에서 유효
 */
export function useRegime({
  symbol,
  timeframe,
  periodDays = 30, // 차트용으로 30일만 필요
  enabled = true,
}: UseRegimeParams) {
  // 심볼 형식 변환 (BTC/USDT -> BTCUSDT)
  const normalizedSymbol = symbol.replace('/', '');

  const query = useQuery({
    queryKey: ['regime', normalizedSymbol, timeframe, periodDays],
    queryFn: () => fetchCurrentRegime(normalizedSymbol, timeframe, periodDays),
    enabled,
    staleTime: 60 * 1000, // 1분간 캐시 유지
    refetchInterval: 60 * 1000, // 1분마다 자동 갱신
    retry: 1,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    // 편의 속성
    regime: query.data?.regime ?? null,
    regimeNum: query.data?.regimeNum ?? null,
    confidence: query.data?.confidence ?? null,
    isSideways: query.data?.regime === 'Sideways',
    isBullish: query.data?.regime === 'Bullish',
    isBearish: query.data?.regime === 'Bearish',
  };
}

export type { CurrentRegimeStatus };
