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

// 타임프레임 변환 (API 형식 -> Bybit WebSocket 형식)
const convertTimeframeToBybit = (timeframe: string): string => {
  // Bybit 타임프레임: 1, 3, 5, 15, 30, 60, 120, 240, 360, 720, D, W, M
  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
  };
  return map[timeframe] || '5';
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

  // WebSocket 연결 (실시간 캔들 업데이트) - Bybit
  useEffect(() => {
    if (!enableWebSocket) return;
    if (typeof window === 'undefined') {
      return;
    }

    // 심볼 변환: BTC/USDT -> BTCUSDT
    const wsSymbol = symbol.replace('/', '').toUpperCase();
    const wsTimeframe = convertTimeframeToBybit(timeframe);
    const wsUrl = 'wss://stream.bybit.com/v5/public/linear';

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
          // Bybit은 연결 후 구독 메시지를 보내야 함
          const subscribeMsg = {
            op: 'subscribe',
            args: [`kline.${wsTimeframe}.${wsSymbol}`],
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

            // Bybit kline 데이터 처리
            if (data.topic && data.topic.startsWith('kline.') && data.data) {
              const klineArray = data.data;
              if (klineArray.length > 0) {
                const kline = klineArray[0];
                const currentCandleTime = kline.start;
                const now = Date.now();

                // throttle: 500ms마다 업데이트 (더 실시간)
                const shouldUpdate = now - lastUpdateTimeRef.current > 500;

                if (shouldUpdate) {
                  lastUpdateTimeRef.current = now;

                  // 새로운 캔들 데이터로 업데이트
                  setWsData({
                    timestamp: currentCandleTime,
                    open: parseFloat(kline.open),
                    high: parseFloat(kline.high),
                    low: parseFloat(kline.low),
                    close: parseFloat(kline.close),
                    volume: parseFloat(kline.volume),
                    isFinal: kline.confirm, // 캔들이 닫혔는지 여부
                  });
                }

                // 캔들이 닫히면 전체 데이터 리프레시 (지표 재계산)
                if (kline.confirm && currentCandleTime !== lastCandleTimeRef.current) {
                  lastCandleTimeRef.current = currentCandleTime;
                  refetchRef.current();
                }
              }
            }
          } catch (err) {
            // 파싱 에러 무시
          }
        };

        ws.onerror = () => {};

        ws.onclose = () => {
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
        // 연결 에러 무시
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
  }, [symbol, timeframe, enableWebSocket]);

  return {
    ...query,
    realtimeCandle: wsData, // WebSocket 데이터를 별도로 반환
  };
}
