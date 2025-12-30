'use client';

import { useState, useEffect, useCallback } from 'react';
import { WhaleSummary } from '@/lib/types';

interface UseWhalesParams {
  symbol: string;
  refreshInterval?: number; // 밀리초 (기본 5초)
}

interface UseWhalesReturn {
  data: WhaleSummary | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWhales({
  symbol,
  refreshInterval = 5000,
}: UseWhalesParams): UseWhalesReturn {
  const [data, setData] = useState<WhaleSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWhales = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/exchange/whales?symbol=${symbol}`);
      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch whale trades:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchWhales();

    const interval = setInterval(fetchWhales, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchWhales, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchWhales,
  };
}
