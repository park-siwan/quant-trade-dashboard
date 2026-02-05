'use client';

import { useSocketTicker } from '@/contexts/SocketContext';

interface PriceData {
  price: number;
  change24h: number;
  changePercent24h: number;
}

/**
 * 현재 선택된 심볼의 실시간 가격 훅
 * 백엔드 socket.io를 통해 Binance 데이터 수신
 */
export function usePrice(): PriceData | null {
  const { ticker } = useSocketTicker();

  if (!ticker) return null;

  return {
    price: ticker.price,
    change24h: ticker.change24h,
    changePercent24h: ticker.changePercent24h,
  };
}

// 하위 호환성을 위한 alias
export const useBTCPrice = usePrice;
