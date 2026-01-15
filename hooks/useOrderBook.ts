'use client';

import { useState, useEffect, useRef } from 'react';
import { useSocket, OrderBookLevel, OrderBookData as SocketOrderBookData } from '@/contexts/SocketContext';

// Re-export types for backward compatibility
export type { OrderBookLevel };

export interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
}

export interface RatioHistoryPoint {
  timestamp: number;
  bidRatio: number;
}

interface UseOrderBookProps {
  symbol?: string;
  limit?: number;
}

/**
 * 호가창 데이터 훅
 * 백엔드 socket.io를 통해 Binance 데이터 수신
 */
export function useOrderBook({ symbol = 'BTCUSDT', limit = 20 }: UseOrderBookProps = {}) {
  const { orderbook, isConnected } = useSocket();
  const [ratioHistory, setRatioHistory] = useState<RatioHistoryPoint[]>([]);
  const lastRatioUpdateRef = useRef<number>(0);

  // 비율 히스토리 업데이트
  useEffect(() => {
    if (!orderbook) return;

    const now = Date.now();
    // 3초마다 히스토리 업데이트
    if (now - lastRatioUpdateRef.current > 3000) {
      lastRatioUpdateRef.current = now;

      const totalBid = orderbook.bids.reduce((sum, b) => sum + b.quantity, 0);
      const totalAsk = orderbook.asks.reduce((sum, a) => sum + a.quantity, 0);
      const total = totalBid + totalAsk;
      const bidRatio = total > 0 ? (totalBid / total) * 100 : 50;

      setRatioHistory(prev => {
        const fifteenMinutesAgo = now - 15 * 60 * 1000;
        const filtered = prev.filter(p => p.timestamp > fifteenMinutesAgo);
        return [...filtered, { timestamp: now, bidRatio }];
      });
    }
  }, [orderbook]);

  // limit에 맞게 데이터 자르기
  const slicedOrderbook: OrderBookData = orderbook ? {
    bids: orderbook.bids.slice(0, limit),
    asks: orderbook.asks.slice(0, limit),
    lastUpdateId: orderbook.lastUpdateId,
  } : {
    bids: [],
    asks: [],
    lastUpdateId: 0,
  };

  return {
    orderBook: slicedOrderbook,
    ratioHistory,
    isConnected,
    error: null,
  };
}
