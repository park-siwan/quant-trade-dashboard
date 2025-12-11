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
  limit?: number; // 표시할 호가 단계 (1, 50, 200, 500)
}

export function useOrderBook({ symbol = 'BTCUSDT', limit = 50 }: UseOrderBookProps = {}) {
  // Bybit Linear가 지원하는 depth 레벨로 조정 (1, 50, 200, 500)
  const validLimit = limit <= 1 ? 1 : limit <= 50 ? 50 : limit <= 200 ? 200 : 500;
  const [orderBook, setOrderBook] = useState<OrderBookData>({
    bids: [],
    asks: [],
    lastUpdateId: 0,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  // 오더북 데이터를 ref로 관리 (delta 병합용)
  const orderBookRef = useRef<{ bids: Map<string, number>; asks: Map<string, number> }>({
    bids: new Map(),
    asks: new Map(),
  });

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
            const message = JSON.parse(event.data);

            // Bybit orderbook 데이터 처리 (snapshot 또는 delta)
            if (message.topic && message.topic.startsWith('orderbook.') && message.data) {
              const orderbookData = message.data;
              const now = Date.now();

              // delta 업데이트 적용 함수
              const applyDelta = (levels: string[][], map: Map<string, number>) => {
                levels.forEach((level: string[]) => {
                  const price = level[0];
                  const qty = parseFloat(level[1]);
                  if (qty === 0) {
                    map.delete(price);
                  } else {
                    map.set(price, qty);
                  }
                });
              };

              // Map을 정렬된 배열로 변환
              const mapToSortedArray = (map: Map<string, number>, ascending: boolean): OrderBookLevel[] => {
                const arr = Array.from(map.entries())
                  .map(([price, qty]) => ({ price: parseFloat(price), quantity: qty, total: 0 }))
                  .sort((a, b) => ascending ? a.price - b.price : b.price - a.price);

                let total = 0;
                arr.forEach(item => { total += item.quantity; item.total = total; });
                return arr;
              };

              // snapshot: ref 초기화 + 즉시 렌더
              if (message.type === 'snapshot') {
                orderBookRef.current.bids.clear();
                orderBookRef.current.asks.clear();

                (orderbookData.b || []).forEach((level: string[]) => {
                  orderBookRef.current.bids.set(level[0], parseFloat(level[1]));
                });
                (orderbookData.a || []).forEach((level: string[]) => {
                  orderBookRef.current.asks.set(level[0], parseFloat(level[1]));
                });

                lastUpdateTimeRef.current = now;
                setOrderBook({
                  bids: mapToSortedArray(orderBookRef.current.bids, false),
                  asks: mapToSortedArray(orderBookRef.current.asks, true),
                  lastUpdateId: orderbookData.u || 0,
                });
              }
              // delta: ref에 병합 + throttle 렌더
              else if (message.type === 'delta') {
                // ref에 delta 즉시 병합
                applyDelta(orderbookData.b || [], orderBookRef.current.bids);
                applyDelta(orderbookData.a || [], orderBookRef.current.asks);

                // throttle: 100ms마다만 UI 업데이트
                if (now - lastUpdateTimeRef.current > 100) {
                  lastUpdateTimeRef.current = now;
                  setOrderBook({
                    bids: mapToSortedArray(orderBookRef.current.bids, false),
                    asks: mapToSortedArray(orderBookRef.current.asks, true),
                    lastUpdateId: orderbookData.u || 0,
                  });
                }
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
