'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCandles } from '@/lib/api/exchange';

// Bybit 타임프레임 매핑
const BYBIT_INTERVALS: Record<string, string> = {
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
};

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  confirmed: boolean;
}

interface KlineData {
  [timeframe: string]: Candle[];
}

interface UseKlineWebSocketParams {
  symbol?: string;
  timeframes?: string[];
  limit?: number;
  enabled?: boolean;
}

export function useKlineWebSocket({
  symbol = 'BTCUSDT',
  timeframes = ['5m', '15m', '30m', '1h', '4h', '1d'],
  limit = 200,
  enabled = true,
}: UseKlineWebSocketParams = {}) {
  const [data, setData] = useState<KlineData>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<KlineData>({});

  // 초기 데이터 로드 (REST API - 한 번만)
  const loadInitialData = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    const initialData: KlineData = {};

    try {
      await Promise.all(
        timeframes.map(async (tf) => {
          const response = await fetchCandles({
            symbol: `${symbol.replace('USDT', '')}/USDT`,
            timeframe: tf,
            limit
          });

          if (response.success && response.data) {
            const candles = Array.isArray(response.data) ? response.data : response.data.candles;
            if (candles) {
              initialData[tf] = candles.map((c: number[]) => ({
                timestamp: c[0],
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5],
                confirmed: true,
              }));
            }
          }
        })
      );

      dataRef.current = initialData;
      setData(initialData);
    } catch (error) {
      console.error('Failed to load initial candle data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, symbol, timeframes, limit]);

  // WebSocket 연결
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    loadInitialData();

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
          setIsConnected(true);

          // 모든 타임프레임 kline 구독
          const args = timeframes.map(tf => `kline.${BYBIT_INTERVALS[tf]}.${symbol}`);
          ws.send(JSON.stringify({
            op: 'subscribe',
            args,
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

            // kline 업데이트 처리
            if (msg.topic?.startsWith('kline.') && msg.data) {
              const parts = msg.topic.split('.');
              const bybitInterval = parts[1];
              const timeframe = Object.entries(BYBIT_INTERVALS).find(
                ([, v]) => v === bybitInterval
              )?.[0];

              if (timeframe && msg.data[0]) {
                const kline = msg.data[0];
                const newCandle: Candle = {
                  timestamp: kline.start,
                  open: parseFloat(kline.open),
                  high: parseFloat(kline.high),
                  low: parseFloat(kline.low),
                  close: parseFloat(kline.close),
                  volume: parseFloat(kline.volume),
                  turnover: parseFloat(kline.turnover),
                  confirmed: kline.confirm,
                };

                // 데이터 업데이트
                const currentData = dataRef.current[timeframe] || [];
                let updatedData: Candle[];

                if (currentData.length === 0) {
                  updatedData = [newCandle];
                } else {
                  const lastCandle = currentData[currentData.length - 1];

                  if (newCandle.timestamp === lastCandle.timestamp) {
                    // 같은 캔들 업데이트
                    updatedData = [...currentData.slice(0, -1), newCandle];
                  } else if (newCandle.timestamp > lastCandle.timestamp) {
                    // 새 캔들 추가
                    updatedData = [...currentData.slice(1), newCandle];
                  } else {
                    updatedData = currentData;
                  }
                }

                dataRef.current = {
                  ...dataRef.current,
                  [timeframe]: updatedData,
                };

                // 상태 업데이트 (throttle)
                const now = Date.now();
                if (now - lastUpdate > 100) { // 100ms throttle
                  setData({ ...dataRef.current });
                  setLastUpdate(now);
                }
              }
            }
          } catch {
            // 파싱 에러 무시
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (!isIntentionalClose) {
            reconnectTimeout = setTimeout(connect, 3000);
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
  }, [enabled, symbol, timeframes, loadInitialData, lastUpdate]);

  // 수동 새로고침
  const refetch = useCallback(() => {
    loadInitialData();
  }, [loadInitialData]);

  return {
    data,
    isLoading,
    isConnected,
    refetch,
  };
}
