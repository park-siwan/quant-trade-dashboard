'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { fetchCandles } from '@/lib/api/exchange';
import { getRefreshInterval } from '@/lib/timeframe';
import { WEBSOCKET, API } from '@/lib/constants';
import { useSocket, KlineData } from '@/contexts/SocketContext';

interface UseCandlesParams {
  symbol: string;
  timeframe: string;
  limit?: number;
  enableAutoRefresh?: boolean;
  enableWebSocket?: boolean;
}

interface RealtimeCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}

/**
 * 캔들 데이터 훅
 * - 초기 데이터: React Query (API)
 * - 실시간 업데이트: 백엔드 socket.io (Binance)
 */
export function useCandles({
  symbol,
  timeframe,
  limit = API.DEFAULT_CANDLE_LIMIT,
  enableAutoRefresh = true,
  enableWebSocket = true,
}: UseCandlesParams) {
  const queryClient = useQueryClient();
  const { getKline, subscribeKline } = useSocket();
  const kline = getKline(timeframe); // 현재 타임프레임의 kline만 사용
  const lastCandleTimeRef = useRef<number>(0);
  const prevCandleCloseRef = useRef<number>(0);
  const currentCandleTimeRef = useRef<number>(0);
  const syncCountRef = useRef<number>(0);

  const queryKey = ['candles', symbol, timeframe, limit];

  // 지표(ATR/VAH/VAL 등) 갱신을 위한 주기적 refetch 간격 (ms)
  // WebSocket이 활성화되어도 지표는 API에서만 계산되므로 주기적 refetch 필요
  const getIndicatorRefreshInterval = (tf: string): number => {
    switch (tf) {
      case '1d': return 5 * 60 * 1000;   // 1일봉: 5분마다
      case '4h': return 3 * 60 * 1000;   // 4시간봉: 3분마다
      case '1h': return 2 * 60 * 1000;   // 1시간봉: 2분마다
      default: return 60 * 1000;         // 그 외: 1분마다
    }
  };

  const query = useQuery({
    queryKey,
    queryFn: () => fetchCandles({ symbol, timeframe, limit }),
    // WebSocket 사용 시에도 지표 갱신을 위해 주기적 refetch 활성화
    refetchInterval: enableAutoRefresh ? getIndicatorRefreshInterval(timeframe) : false,
    staleTime: 30_000,
  });

  // refetch 함수를 ref로 저장
  const refetchRef = useRef(query.refetch);
  useEffect(() => {
    refetchRef.current = query.refetch;
  }, [query.refetch]);

  // 캔들 캐시 증분 업데이트 함수
  const appendCandleToCache = useCallback((newCandle: number[]) => {
    queryClient.setQueryData(queryKey, (oldData: any) => {
      if (!oldData?.data?.candles) return oldData;

      const candles = [...oldData.data.candles];
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

  // 타임프레임 구독 요청
  useEffect(() => {
    if (enableWebSocket) {
      subscribeKline(timeframe);
    }
  }, [timeframe, enableWebSocket, subscribeKline]);

  // API 데이터 로드 시 마지막 캔들의 close 저장
  useEffect(() => {
    const candles = query.data?.data?.candles;
    if (candles && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      prevCandleCloseRef.current = lastCandle[4];
      currentCandleTimeRef.current = lastCandle[0];
    }
  }, [query.data]);

  // 실시간 캔들 데이터 처리
  const realtimeCandle: RealtimeCandle | null = (() => {
    if (!kline || !enableWebSocket) return null;
    if (kline.timeframe !== timeframe) return null;

    const currentCandleTime = kline.timestamp;
    const isNewCandle = currentCandleTime !== currentCandleTimeRef.current;

    let adjustedOpen = kline.open;
    let adjustedLow = kline.low;
    let adjustedHigh = kline.high;

    // 새 캔들 시작 시 갭 보정
    if (isNewCandle && prevCandleCloseRef.current > 0) {
      adjustedOpen = prevCandleCloseRef.current;
      adjustedLow = Math.min(kline.low, adjustedOpen, kline.close);
      adjustedHigh = Math.max(kline.high, adjustedOpen, kline.close);
    }

    // 캔들 종료 시 close 저장
    if (kline.isFinal) {
      prevCandleCloseRef.current = kline.close;

      // 캐시 업데이트
      if (currentCandleTime !== lastCandleTimeRef.current) {
        lastCandleTimeRef.current = currentCandleTime;

        const confirmedCandle = [
          currentCandleTime,
          kline.open,
          kline.high,
          kline.low,
          kline.close,
          kline.volume,
        ];
        appendCandleToCache(confirmedCandle);

        // N캔들마다 전체 동기화
        syncCountRef.current++;
        if (syncCountRef.current >= WEBSOCKET.SYNC_INTERVAL) {
          syncCountRef.current = 0;
          refetchRef.current();
        }
      }
    }

    currentCandleTimeRef.current = currentCandleTime;

    return {
      timestamp: currentCandleTime,
      open: adjustedOpen,
      high: adjustedHigh,
      low: adjustedLow,
      close: kline.close,
      volume: kline.volume,
      isFinal: kline.isFinal,
    };
  })();

  return {
    ...query,
    realtimeCandle,
  };
}
