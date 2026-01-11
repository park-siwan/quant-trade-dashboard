'use client';

import { useState, useEffect, useRef } from 'react';

interface PriceData {
  price: number;
  change24h: number;
  changePercent24h: number;
}

export function useBTCPrice() {
  const [data, setData] = useState<PriceData | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const wsUrl = 'wss://stream.bybit.com/v5/public/linear';
    let isIntentionalClose = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    const connect = () => {
      if (isIntentionalClose) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Bybit ticker 구독
          ws.send(JSON.stringify({
            op: 'subscribe',
            args: ['tickers.BTCUSDT'],
          }));

          // 20초마다 ping
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ op: 'ping' }));
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.topic === 'tickers.BTCUSDT' && msg.data) {
              const ticker = msg.data;
              const lastPrice = parseFloat(ticker.lastPrice);
              // Bybit은 price24hPcnt를 소수로 제공 (예: 0.0312 = 3.12%)
              const price24hPcnt = parseFloat(ticker.price24hPcnt);

              if (!isNaN(lastPrice) && lastPrice > 0) {
                const changePercent = !isNaN(price24hPcnt) ? price24hPcnt * 100 : 0;

                setData({
                  price: lastPrice,
                  change24h: 0,
                  changePercent24h: changePercent,
                });
              }
            }
          } catch {
            // 파싱 에러 무시
          }
        };

        ws.onerror = () => {
          // 에러 무시
        };

        ws.onclose = () => {
          if (!isIntentionalClose) {
            reconnectTimeout = setTimeout(connect, 5000);
          }
        };
      } catch {
        // 연결 에러 무시
      }
    };

    connect();

    return () => {
      isIntentionalClose = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return data;
}
