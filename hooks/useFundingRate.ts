'use client';

import { useState, useEffect } from 'react';
import { usePolling } from './usePolling';
import { POLLING_INTERVALS } from '@/lib/config';

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
  refreshInterval?: number;
}

export function useFundingRate({
  symbol,
  refreshInterval = POLLING_INTERVALS.FUNDING_RATE,
}: UseFundingRateParams) {
  const [timeUntilFunding, setTimeUntilFunding] = useState<string>('--:--:--');

  const polling = usePolling<FundingRateData>({
    endpoint: '/exchange/funding-rate',
    params: { symbol },
    refreshInterval,
  });

  // 다음 펀딩까지 남은 시간 계산
  useEffect(() => {
    if (!polling.data?.fundingTime) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = polling.data!.fundingTime - now;

      if (diff <= 0) {
        setTimeUntilFunding('00:00:00');
        polling.refetch();
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
  }, [polling.data?.fundingTime, polling.refetch]);

  return {
    ...polling,
    timeUntilFunding,
  };
}
