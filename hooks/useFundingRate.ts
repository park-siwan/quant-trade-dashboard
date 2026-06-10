'use client';

import { useState, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { fundingRateDataAtom, isConnectedAtom } from '@/stores/socketAtoms';
import type { FundingRateData } from '@/contexts/SocketContext';

interface UseFundingRateParams {
  symbol: string;
  refreshInterval?: number;
}

export function useFundingRate({ symbol }: UseFundingRateParams) {
  const fundingRateData = useAtomValue(fundingRateDataAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  const [timeUntilFunding, setTimeUntilFunding] = useState<string>('--:--:--');

  useEffect(() => {
    if (!fundingRateData?.fundingTime) return;

    const updateCountdown = () => {
      const diff = fundingRateData.fundingTime - Date.now();
      if (diff <= 0) { setTimeUntilFunding('00:00:00'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimeUntilFunding(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };

    updateCountdown();
    const id = setInterval(updateCountdown, 1000);
    return () => clearInterval(id);
  }, [fundingRateData?.fundingTime]);

  return {
    data: fundingRateData,
    isLoading: !fundingRateData && isConnected,
    isError: false,
    error: null,
    timeUntilFunding,
  };
}

export type { FundingRateData };
