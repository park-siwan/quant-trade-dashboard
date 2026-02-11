import { useState, useEffect, useRef } from 'react';
import { CandlestickData, Time } from 'lightweight-charts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseChartDataResult {
  candles: CandlestickData[];
  isLoading: boolean;
  chartKey: number;
  initialCandlesLoaded: boolean;
}

/**
 * 캔들 데이터 로딩 Hook
 * - REST API로 초기 캔들 데이터 로드
 * - WebSocket 구독 트리거
 */
export function useChartData(
  symbol: string,
  timeframe: string,
  subscribeKline: (timeframe: string) => void,
  wakeUpCounter: number = 0
): UseChartDataResult {
  const [candles, setCandles] = useState<CandlestickData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chartKey, setChartKey] = useState(0);
  const initialCandlesLoadedRef = useRef(false);

  useEffect(() => {
    const loadCandles = async () => {
      setIsLoading(true);
      initialCandlesLoadedRef.current = false;

      try {
        const response = await fetch(
          `${API_BASE}/exchange/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=5000`,
        );
        const data = await response.json();
        const candlesArray = data.data?.candles || data.candles;

        if (candlesArray && candlesArray.length > 0) {
          const formattedCandles: CandlestickData[] = candlesArray.map(
            (c: number[]) => ({
              time: (c[0] / 1000) as Time,
              open: c[1],
              high: c[2],
              low: c[3],
              close: c[4],
              volume: c[5],
            }),
          );

          // 디버그 로그
          const firstTs = candlesArray[0][0];
          const lastTs = candlesArray[candlesArray.length - 1][0];
          console.log('[Candles] Loaded:', candlesArray.length);
          console.log('[Candles] First:', new Date(firstTs).toLocaleString('ko-KR'));
          console.log('[Candles] Last:', new Date(lastTs).toLocaleString('ko-KR'));
          console.log('[Candles] Now:', new Date().toLocaleString('ko-KR'));

          setCandles(formattedCandles);
          initialCandlesLoadedRef.current = true;

          // 차트 재생성 트리거
          setChartKey((prev) => prev + 1);
        }
      } catch (err) {
        console.error('Failed to load candles:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCandles();
    subscribeKline(timeframe);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, subscribeKline, symbol, wakeUpCounter]);

  return {
    candles,
    isLoading,
    chartKey,
    initialCandlesLoaded: initialCandlesLoadedRef.current,
  };
}

/**
 * 실시간 캔들 업데이트를 위한 setter 제공
 */
export function useRealtimeCandle() {
  const [candles, setCandles] = useState<CandlestickData[]>([]);

  return {
    candles,
    setCandles,
  };
}
