'use client';

import { useState, useEffect, useCallback } from 'react';

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: number;
}

export interface CoinglassTradingSignals {
  symbol: string;
  fearGreed: FearGreedData | null;
  liquidationBias: 'long_heavy' | 'short_heavy' | 'neutral';
  bullMarketRisk: number;
  etfTrend: 'inflow' | 'outflow' | 'neutral';
}

interface UseCoinglassParams {
  symbol?: string;
  refreshInterval?: number;
}

interface UseCoinglassReturn {
  data: CoinglassTradingSignals | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCoinglass({
  symbol = 'BTC',
  refreshInterval = 60000, // 1분마다 갱신 (API rate limit 고려)
}: UseCoinglassParams = {}): UseCoinglassReturn {
  const [data, setData] = useState<CoinglassTradingSignals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTradingSignals = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(
        `${apiUrl}/exchange/coinglass/trading-signals?symbol=${symbol}`
      );
      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch Coinglass trading signals:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchTradingSignals();

    const interval = setInterval(fetchTradingSignals, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchTradingSignals, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchTradingSignals,
  };
}
