import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchCandles } from '@/lib/api/exchange';
import { timeframeToBybit, getRefreshInterval } from '@/lib/timeframe';

interface UseCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
  enableAutoRefresh?: boolean;
  enableWebSocket?: boolean;
}

export function useCandles({
  symbol,
  timeframe,
  limit = 1000,
  enableAutoRefresh = true,
  enableWebSocket = true,
}: UseCandlesParams) {
  const queryClient = useQueryClient();
  const [wsData, setWsData] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastCandleTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0); // throttle용
  const prevCandleCloseRef = useRef<number>(0); // 이전(종료된) 캔들의 close
  const currentCandleTimeRef = useRef<number>(0); // 현재 캔들 시작 시간
  const syncCountRef = useRef<number>(0); // 동기화 카운터

  const queryKey = ['candles', symbol, timeframe, limit];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchCandles({ symbol, timeframe, limit }),
    refetchInterval: enableAutoRefresh && !enableWebSocket ? getRefreshInterval(timeframe) : false,
    staleTime: 60_000, // 1분 동안 fresh (WebSocket이 업데이트하므로)
  });

  // 캔들 캐시 증분 업데이트 함수
  const appendCandleToCache = useCallback((newCandle: number[]) => {
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.data?.candles) return oldData;

      const candles = [...oldData.data.candles];
      // 가장 오래된 캔들 제거하고 새 캔들 추가
      candles.shift();
      candles.push(newCandle);

      return {
        ...oldData,
        data: {
          ...oldData.data,
          candles,
        },
      };
    });
  }, [queryClient, queryKey]);

  // refetch 함수를 ref로 저장 (dependency 문제 해결)
  const refetchRef = useRef(query.refetch);
  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  // API 데이터 로드 시 마지막 캔들의 close 저장 (WebSocket 갭 보정용)
  useEffect(() => {
    const candles = query.data?.data?.candles;
    if (candles && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      // 마지막 캔들의 close와 시작 시간 저장
      prevCandleCloseRef.current = lastCandle[4]; // close 값
      currentCandleTimeRef.current = lastCandle[0]; // timestamp
    }
  }, [query.data]);

  // WebSocket 연결 (실시간 캔들 업데이트) - Bybit
  useEffect(() => {
    if (!enableWebSocket) return;
    if (typeof window === 'undefined') {
      return;
    }

    // 심볼 변환: BTC/USDT -> BTCUSDT
    const wsSymbol = symbol.replace('/', '').toUpperCase();
    const wsTimeframe = timeframeToBybit(timeframe);
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

                // 캔들 데이터 파싱
                const rawOpen = parseFloat(kline.open);
                const rawHigh = parseFloat(kline.high);
                const rawLow = parseFloat(kline.low);
                const rawClose = parseFloat(kline.close);
                const rawVolume = parseFloat(kline.volume);

                // 새 캔들 시작 감지 (캔들 시간이 바뀜)
                const isNewCandle = currentCandleTime !== currentCandleTimeRef.current;

                // throttle: 500ms마다 UI 업데이트 (더 실시간)
                const now2 = Date.now();
                const shouldUpdate = now2 - lastUpdateTimeRef.current > 500;

                if (shouldUpdate) {
                  lastUpdateTimeRef.current = now2;

                  let adjustedOpen = rawOpen;
                  let adjustedLow = rawLow;
                  let adjustedHigh = rawHigh;

                  // 새 캔들이 시작되고, 이전 캔들 close가 있으면 갭 보정
                  if (isNewCandle && prevCandleCloseRef.current > 0) {
                    // open을 이전 캔들의 close로 설정 (갭 제거)
                    adjustedOpen = prevCandleCloseRef.current;
                    // low/high도 보정된 open 포함하도록 조정
                    adjustedLow = Math.min(rawLow, adjustedOpen, rawClose);
                    adjustedHigh = Math.max(rawHigh, adjustedOpen, rawClose);
                  }

                  // 캔들이 종료되면 close 저장 (다음 캔들 시작 시 사용)
                  if (kline.confirm) {
                    prevCandleCloseRef.current = rawClose;
                  }

                  // 현재 캔들 시간 업데이트
                  currentCandleTimeRef.current = currentCandleTime;

                  // 새로운 캔들 데이터로 업데이트
                  setWsData({
                    timestamp: currentCandleTime,
                    open: adjustedOpen,
                    high: adjustedHigh,
                    low: adjustedLow,
                    close: rawClose,
                    volume: parseFloat(kline.volume),
                    isFinal: kline.confirm,
                  });
                }

                // 캔들이 닫히면 캐시 증분 업데이트 (전체 refetch 대신)
                if (kline.confirm && currentCandleTime !== lastCandleTimeRef.current) {
                  lastCandleTimeRef.current = currentCandleTime;

                  // 새 캔들 데이터로 캐시 업데이트
                  const confirmedCandle = [
                    currentCandleTime,
                    rawOpen,
                    rawHigh,
                    rawLow,
                    rawClose,
                    rawVolume,
                  ];
                  appendCandleToCache(confirmedCandle);

                  // 10번마다 한 번씩 전체 동기화 (데이터 정합성 보장)
                  syncCountRef.current++;
                  if (syncCountRef.current >= 10) {
                    syncCountRef.current = 0;
                    refetchRef.current();
                  }
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
  }, [symbol, timeframe, enableWebSocket, appendCandleToCache]);

  return {
    ...query,
    realtimeCandle: wsData, // WebSocket 데이터를 별도로 반환
  };
}
