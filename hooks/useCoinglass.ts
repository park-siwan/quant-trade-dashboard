'use client';

import { useSocket, CoinglassData, FearGreedData } from '@/contexts/SocketContext';

interface UseCoinglassParams {
  symbol?: string;
  refreshInterval?: number; // Ignored - data comes from socket
}

/**
 * 코인글래스 트레이딩 시그널 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useCoinglass({ symbol = 'BTC' }: UseCoinglassParams = {}) {
  const { coinglassData, isConnected } = useSocket();

  return {
    data: coinglassData,
    isLoading: !coinglassData && isConnected,
    isError: false,
    error: null,
  };
}

// Re-export types for backwards compatibility
export type CoinglassTradingSignals = CoinglassData;
export type { FearGreedData };
