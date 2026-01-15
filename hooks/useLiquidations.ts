'use client';

import { useSocket, LiquidationData } from '@/contexts/SocketContext';

interface UseLiquidationsParams {
  symbol: string;
  refreshInterval?: number; // Ignored - data comes from socket
}

/**
 * 청산 데이터 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useLiquidations({ symbol }: UseLiquidationsParams) {
  const { liquidationData, isConnected } = useSocket();

  return {
    data: liquidationData,
    isLoading: !liquidationData && isConnected,
    isError: false,
    error: null,
  };
}
