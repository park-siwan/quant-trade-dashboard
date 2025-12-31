'use client';

import { useState, useEffect, useCallback } from 'react';

export interface FundingRateData {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  nextFundingRate: number | null;
  markPrice: number;
  indexPrice: number;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  signalStrength: 'STRONG' | 'MEDIUM' | 'WEAK';
  description: string;
}

interface UseFundingRateParams {
  symbol: string;
  refreshInterval?: number; // 밀리초 (기본 30초)
}

interface UseFundingRateReturn {
  data: FundingRateData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  timeUntilFunding: string; // 다음 펀딩까지 남은 시간
}

export function useFundingRate({
  symbol,
  refreshInterval = 30000,
}: UseFundingRateParams): UseFundingRateReturn {
  const [data, setData] = useState<FundingRateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [timeUntilFunding, setTimeUntilFunding] = useState<string>('--:--:--');

  const fetchFundingRate = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(
        `${apiUrl}/exchange/funding-rate?symbol=${symbol}`
      );
      const result = await response.json();

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch funding rate:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [symbol]);

  // 다음 펀딩까지 남은 시간 계산
  useEffect(() => {
    if (!data?.fundingTime) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = data.fundingTime - now;

      if (diff <= 0) {
        setTimeUntilFunding('00:00:00');
        fetchFundingRate(); // 펀딩 시간 지나면 새로 fetch
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeUntilFunding(
        `${hours.toString().padStart(2, '0')}:${minutes
          .toString()
          .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [data?.fundingTime, fetchFundingRate]);

  // 초기 로드 및 주기적 갱신
  useEffect(() => {
    fetchFundingRate();

    const interval = setInterval(fetchFundingRate, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchFundingRate, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchFundingRate,
    timeUntilFunding,
  };
}
