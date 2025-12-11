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
  limit?: number; // 표시할 호가 단계 (1, 25, 50, 100, 200)
}

export function useOrderBook({ symbol = 'BTCUSDT', limit = 25 }: UseOrderBookProps = {}) {
  // Bybit이 지원하는 depth 레벨로 조정 (1, 25, 50, 100, 200)
  const validLimit = limit <= 1 ? 1 : limit <= 25 ? 25 : limit <= 50 ? 50 : limit <= 100 ? 100 : 200;
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

    // Bybit 선물 WebSocket 엔드포인트
    const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
    const wsSymbol = symbol.toUpperCase();

    let isIntentionalClose = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      // 이미 의도적으로 닫힌 경우 재연결 안함
      if (isIntentionalClose) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);

          // Bybit은 연결 후 구독 메시지를 보내야 함
          const subscribeMsg = {
            op: 'subscribe',
            args: [`orderbook.${validLimit}.${wsSymbol}`],
          };
          ws.send(JSON.stringify(subscribeMsg));

          // Bybit은 20초마다 ping을 보내야 연결 유지
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ op: 'ping' }));
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Bybit orderbook 데이터 처리
            if (data.topic && data.topic.startsWith('orderbook.') && data.data) {
              const orderbookData = data.data;

              // 중복 업데이트 방지
              if (orderbookData.u <= lastUpdateIdRef.current) {
                return;
              }

              lastUpdateIdRef.current = orderbookData.u;

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
                bids: processLevels(orderbookData.b || []),
                asks: processLevels(orderbookData.a || []),
                lastUpdateId: orderbookData.u,
              });
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

          // ping interval 정리
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }

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

      // ping interval 정리
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }

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
