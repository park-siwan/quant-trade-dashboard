'use client';

import { useState, useEffect, useCallback } from 'react';
import { LiquidationSummary } from '@/lib/types';

interface UseLiquidationsParams {
  symbol: string;
  refreshInterval?: number; // 밀리초 (기본 3초)
}

interface UseLiquidationsReturn {
  data: LiquidationSummary | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useLiquidations({
  symbol,
  refreshInterval = 3000,
}: UseLiquidationsParams): UseLiquidationsReturn {
  const [data, setData] = useState<LiquidationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchLiquidations = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/exchange/liquidations?symbol=${symbol}`);
      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch liquidations:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  // 초기 로드 및 주기적 갱신
  useEffect(() => {
    fetchLiquidations();

    const interval = setInterval(fetchLiquidations, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchLiquidations, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchLiquidations,
  };
}
