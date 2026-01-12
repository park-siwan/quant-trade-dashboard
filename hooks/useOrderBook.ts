import { useState, useEffect, useRef } from 'react';

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookData {
  bids: OrderBookLevel[]; // 매수 호가
  asks: OrderBookLevel[]; // 매도 호가
  lastUpdateId: number;
}

export interface RatioHistoryPoint {
  timestamp: number;
  bidRatio: number; // 매수 비율 (0~100)
}

interface UseOrderBookProps {
  symbol?: string;
  limit?: number; // 표시할 호가 단계 (5, 10, 20)
}

export function useOrderBook({ symbol = 'BTCUSDT', limit = 20 }: UseOrderBookProps = {}) {
  // Binance가 지원하는 depth 레벨로 조정 (5, 10, 20)
  const validLimit = limit <= 5 ? 5 : limit <= 10 ? 10 : 20;
  const [orderBook, setOrderBook] = useState<OrderBookData>({
    bids: [],
    asks: [],
    lastUpdateId: 0,
  });
  const [ratioHistory, setRatioHistory] = useState<RatioHistoryPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastRatioUpdateRef = useRef<number>(0);

  useEffect(() => {
    // SSR 방지 - 브라우저 환경에서만 실행
    if (typeof window === 'undefined') {
      return;
    }

    // Binance Futures partial book depth 스트림 (매번 스냅샷 전송)
    const wsSymbol = symbol.toLowerCase();
    const wsUrl = `wss://fstream.binance.com/ws/${wsSymbol}@depth${validLimit}@100ms`;

    let isIntentionalClose = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      // 이미 의도적으로 닫힌 경우 재연결 안함
      if (isIntentionalClose) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
          // Binance는 URL에 스트림 포함, 별도 구독 불필요
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const now = Date.now();

            // Binance partial book depth 데이터 처리
            if (data.bids && data.asks) {
              // 배열을 OrderBookLevel로 변환
              const parseLevels = (levels: string[][], ascending: boolean): OrderBookLevel[] => {
                const arr = levels.map(([price, qty]) => ({
                  price: parseFloat(price),
                  quantity: parseFloat(qty),
                  total: 0,
                }));

                // 정렬
                arr.sort((a, b) => ascending ? a.price - b.price : b.price - a.price);

                // 누적 합계 계산
                let total = 0;
                arr.forEach(item => {
                  total += item.quantity;
                  item.total = total;
                });

                return arr;
              };

              const newBids = parseLevels(data.bids, false); // 내림차순
              const newAsks = parseLevels(data.asks, true);  // 오름차순

              setOrderBook({
                bids: newBids,
                asks: newAsks,
                lastUpdateId: data.lastUpdateId || 0,
              });

              // 비율 히스토리 업데이트 (3초마다, 최근 15분 유지)
              if (now - lastRatioUpdateRef.current > 3000) {
                lastRatioUpdateRef.current = now;
                const totalBid = newBids.reduce((sum, b) => sum + b.quantity, 0);
                const totalAsk = newAsks.reduce((sum, a) => sum + a.quantity, 0);
                const total = totalBid + totalAsk;
                const bidRatio = total > 0 ? (totalBid / total) * 100 : 50;

                setRatioHistory(prev => {
                  const fifteenMinutesAgo = now - 15 * 60 * 1000;
                  const filtered = prev.filter(p => p.timestamp > fifteenMinutesAgo);
                  return [...filtered, { timestamp: now, bidRatio }];
                });
              }
            }
          } catch (err) {
            // 파싱 에러 무시
          }
        };

        ws.onerror = () => {
          setError(new Error('WebSocket 연결 실패'));
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);

          // 의도적 종료가 아니면 재연결 시도
          if (!isIntentionalClose) {
            reconnectTimeout = setTimeout(() => {
              connectWebSocket();
            }, 5000);
          }
        };
      } catch (err) {
        setError(err as Error);
      }
    };

    connectWebSocket();

    // 클린업
    return () => {
      isIntentionalClose = true;

      // 재연결 timeout 취소
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbol, validLimit]);

  return {
    orderBook,
    ratioHistory,
    isConnected,
    error,
  };
}
