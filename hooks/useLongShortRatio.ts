'use client';

import { useSocket, LongShortRatioData } from '@/contexts/SocketContext';

interface UseLongShortRatioParams {
  symbol?: string;
  period?: string;
  enabled?: boolean;
}

// 레거시 타입 호환성 유지
export interface LongShortRatio {
  longRatio: number;
  shortRatio: number;
  dominant: 'long' | 'short' | 'neutral';
  dominance: number;
  timestamp: number;
}

/**
 * 롱숏 비율 데이터 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useLongShortRatio({
  symbol = 'BTCUSDT',
  period = '1h',
  enabled = true,
}: UseLongShortRatioParams = {}) {
  const { longShortRatioData, isConnected } = useSocket();

  return {
    data: longShortRatioData,
    isLoading: !longShortRatioData && isConnected,
    isError: false,
    error: null,
    ratio: longShortRatioData, // 기존 API 호환
  };
}

export type { LongShortRatioData };
