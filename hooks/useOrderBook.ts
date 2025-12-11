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

interface UseOrderBookProps {
  symbol?: string;
  limit?: number; // 표시할 호가 단계 (5, 10, 20 중 하나)
}

export function useOrderBook({ symbol = 'BTCUSDT', limit = 20 }: UseOrderBookProps = {}) {
  // 바이낸스가 지원하는 depth 레벨로 조정
  const validLimit = limit <= 5 ? 5 : limit <= 10 ? 10 : 20;
  const [orderBook, setOrderBook] = useState<OrderBookData>({
    bids: [],
    asks: [],
    lastUpdateId: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastUpdateIdRef = useRef<number>(0);

  useEffect(() => {
    // SSR 방지 - 브라우저 환경에서만 실행
    if (typeof window === 'undefined') {
      return;
    }

    // 바이낸스 선물 WebSocket 엔드포인트 (validLimit 사용)
    const wsUrl = `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@depth${validLimit}@100ms`;

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
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 중복 업데이트 방지
            if (data.u <= lastUpdateIdRef.current) {
              return;
            }

            lastUpdateIdRef.current = data.u;

            // 매수/매도 호가 누적 총량 계산
            const processLevels = (levels: [string, string][]): OrderBookLevel[] => {
              let cumulativeTotal = 0;
              return levels.map(([price, quantity]) => {
                cumulativeTotal += parseFloat(quantity);
                return {
                  price: parseFloat(price),
                  quantity: parseFloat(quantity),
                  total: cumulativeTotal,
                };
              });
            };

            setOrderBook({
              bids: processLevels(data.b || []),
              asks: processLevels(data.a || []),
              lastUpdateId: data.u,
            });
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
    isConnected,
    error,
  };
}
