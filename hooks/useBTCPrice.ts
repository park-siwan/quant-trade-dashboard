'use client';

import { useSocket } from '@/contexts/SocketContext';

interface PriceData {
  price: number;
  change24h: number;
  changePercent24h: number;
}

/**
 * BTC 실시간 가격 훅
 * 백엔드 socket.io를 통해 Binance 데이터 수신
 */
export function useBTCPrice(): PriceData | null {
  const { ticker } = useSocket();

  if (!ticker) return null;

  return {
    price: ticker.price,
    change24h: ticker.change24h,
    changePercent24h: ticker.changePercent24h,
  };
}
