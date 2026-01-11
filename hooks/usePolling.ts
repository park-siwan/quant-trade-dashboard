'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_CONFIG } from '@/lib/config';

interface UsePollingParams<T> {
  endpoint: string;
  params?: Record<string, string>;
  refreshInterval?: number;
  enabled?: boolean;
  transform?: (data: unknown) => T;
}

interface UsePollingReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePolling<T>({
  endpoint,
  params = {},
  refreshInterval = 5000,
  enabled = true,
  transform,
}: UsePollingParams<T>): UsePollingReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    try {
      const queryString = new URLSearchParams(params).toString();
      const url = `${API_CONFIG.BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url);
      const result = await response.json();

      if (!mountedRef.current) return;

      if (result.success && result.data) {
        const transformedData = transform ? transform(result.data) : result.data;
        setData(transformedData);
        setError(null);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error(`Failed to fetch ${endpoint}:`, err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [endpoint, JSON.stringify(params), enabled, transform]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setIsLoading(false);
      return;
    }

    fetchData();
    const interval = setInterval(fetchData, refreshInterval);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchData, refreshInterval, enabled]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}
