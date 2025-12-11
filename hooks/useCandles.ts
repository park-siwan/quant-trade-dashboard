import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCandles } from '@/lib/api/exchange';

interface UseCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
  enableAutoRefresh?: boolean;
  enableWebSocket?: boolean;
}

// 타임프레임 변환 (API 형식 -> Binance WebSocket 형식)
const convertTimeframe = (timeframe: string): string => {
  // '5m', '15m', '1h', '4h', '1d' 등은 그대로 사용 가능
  return timeframe;
};

// 타임프레임에 맞춘 폴링 간격
const getRefreshInterval = (timeframe: string) => {
  const map: Record<string, number> = {
    '1m': 60_000,      // 1분
    '5m': 300_000,     // 5분
    '15m': 900_000,    // 15분
    '30m': 1_800_000,  // 30분
    '1h': 3_600_000,   // 1시간
    '4h': 14_400_000,  // 4시간
    '1d': 86_400_000,  // 1일
  };
  return map[timeframe] || 300_000; // 기본값 5분
};

export function useCandles({
  symbol,
  timeframe,
  limit = 1000,
  enableAutoRefresh = true,
  enableWebSocket = true,
}: UseCandlesParams) {
  const [wsData, setWsData] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastCandleTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // throttle용

  const query = useQuery({
    queryKey: ['candles', symbol, timeframe, limit],
    queryFn: () => fetchCandles({ symbol, timeframe, limit }),
    refetchInterval: enableAutoRefresh && !enableWebSocket ? getRefreshInterval(timeframe) : false,
    staleTime: 10_000, // 10초 동안 fresh
  });

  // refetch 함수를 ref로 저장 (dependency 문제 해결)
  const refetchRef = useRef(query.refetch);
  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  // WebSocket 연결 (실시간 캔들 업데이트)
  useEffect(() => {
    if (!enableWebSocket) return;
    if (typeof window === 'undefined') {
      return;
    }

    // 심볼 변환: BTC/USDT -> btcusdt
    const wsSymbol = symbol.replace('/', '').toLowerCase();
    const wsTimeframe = convertTimeframe(timeframe);
    const wsUrl = `wss://fstream.binance.com/ws/${wsSymbol}@kline_${wsTimeframe}`;

    let isIntentionalClose = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      // 이미 의도적으로 닫힌 경우 재연결 안함
      if (isIntentionalClose) return;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {};

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.e === 'kline' && data.k) {
              const kline = data.k;
              const currentCandleTime = kline.t;
              const now = Date.now();

              // throttle: 500ms마다 업데이트 (더 실시간)
              const shouldUpdate = now - lastUpdateTimeRef.current > 500;

              if (shouldUpdate) {
                lastUpdateTimeRef.current = now;

                // 새로운 캔들 데이터로 업데이트
                setWsData({
                  timestamp: currentCandleTime,
                  open: parseFloat(kline.o),
                  high: parseFloat(kline.h),
                  low: parseFloat(kline.l),
                  close: parseFloat(kline.c),
                  volume: parseFloat(kline.v),
                  isFinal: kline.x, // 캔들이 닫혔는지 여부
                });
              }

              // 캔들이 닫히면 전체 데이터 리프레시 (지표 재계산)
              if (kline.x && currentCandleTime !== lastCandleTimeRef.current) {
                lastCandleTimeRef.current = currentCandleTime;
                refetchRef.current();
              }
            }
          } catch (err) {
            // 파싱 에러 무시
          }
        };

        ws.onerror = () => {};

        ws.onclose = () => {
          // 의도적 종료가 아니면 재연결 시도
          if (!isIntentionalClose) {
            reconnectTimeout = setTimeout(() => {
              connectWebSocket();
            }, 5000);
          }
        };
      } catch (err) {
        // 연결 에러 무시
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
  }, [symbol, timeframe, enableWebSocket]);

  return {
    ...query,
    realtimeCandle: wsData, // WebSocket 데이터를 별도로 반환
  };
}
