'use client';

import { useQuery } from '@tanstack/react-query';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface CurrentRegimeStatus {
  regime: 'Bullish' | 'Sideways' | 'Bearish';
  regimeNum: number;
  confidence: number;
  timestamp: string;
}

async function fetchCurrentRegime(
  symbol: string,
  timeframe: string,
  periodDays: number,
): Promise<CurrentRegimeStatus> {
  const res = await fetch(
    `${API_BASE}/backtest/regime/current?symbol=${symbol}&timeframe=${timeframe}&days=${periodDays}`,
  );
  if (!res.ok) throw new Error(`Regime fetch failed: ${res.status}`);
  return res.json();
}

interface UseRegimeParams {
  symbol: string;
  timeframe: string;
  periodDays?: number;
  enabled?: boolean;
}

export function useRegime({
  symbol,
  timeframe,
  periodDays = 30,
  enabled = true,
}: UseRegimeParams) {
  const normalizedSymbol = symbol.replace('/', '');

  const query = useQuery({
    queryKey: ['regime', normalizedSymbol, timeframe, periodDays],
    queryFn: () => fetchCurrentRegime(normalizedSymbol, timeframe, periodDays),
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    regime: query.data?.regime ?? null,
    regimeNum: query.data?.regimeNum ?? null,
    confidence: query.data?.confidence ?? null,
    isSideways: query.data?.regime === 'Sideways',
    isBullish: query.data?.regime === 'Bullish',
    isBearish: query.data?.regime === 'Bearish',
  };
}
