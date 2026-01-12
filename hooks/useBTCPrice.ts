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

    // Binance Futures 24hr ticker 스트림
    const wsUrl = 'wss://fstream.binance.com/ws/btcusdt@ticker';
    let isIntentionalClose = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      if (isIntentionalClose) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Binance는 URL에 스트림 포함, 별도 구독 불필요
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            // Binance 24hr ticker 데이터 처리
            if (msg.e === '24hrTicker' && msg.s === 'BTCUSDT') {
              const lastPrice = parseFloat(msg.c); // 현재가
              const priceChangePercent = parseFloat(msg.P); // 24시간 변동률 (%)

              if (!isNaN(lastPrice) && lastPrice > 0) {
                setData({
                  price: lastPrice,
                  change24h: parseFloat(msg.p) || 0, // 가격 변화량
                  changePercent24h: priceChangePercent || 0,
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
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return data;
}
