'use client';

import { useState, useEffect } from 'react';
import { useSocket, FundingRateData } from '@/contexts/SocketContext';

interface UseFundingRateParams {
  symbol: string;
  refreshInterval?: number; // Ignored - data comes from socket
}

/**
 * 펀딩 레이트 데이터 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useFundingRate({ symbol }: UseFundingRateParams) {
  const { fundingRateData, isConnected } = useSocket();
  const [timeUntilFunding, setTimeUntilFunding] = useState<string>('--:--:--');

  // 다음 펀딩까지 남은 시간 계산
  useEffect(() => {
    if (!fundingRateData?.fundingTime) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = fundingRateData.fundingTime - now;

      if (diff <= 0) {
        setTimeUntilFunding('00:00:00');
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
