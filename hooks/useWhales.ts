'use client';

import { useSocket, WhaleData } from '@/contexts/SocketContext';

interface UseWhalesParams {
  symbol: string;
  refreshInterval?: number; // Ignored - data comes from socket
}

/**
 * 고래 거래 데이터 훅
 * 백엔드 socket.io를 통해 실시간 데이터 수신
 */
export function useWhales({ symbol }: UseWhalesParams) {
  const { whaleData, isConnected } = useSocket();

  return {
    data: whaleData,
    isLoading: !whaleData && isConnected,
    isError: false,
    error: null,
  };
}
