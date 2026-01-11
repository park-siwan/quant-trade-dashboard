import { useQueries } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCandles } from '@/lib/api/exchange';
import {
  MTFTimeframeData,
  MTFOverviewData,
  MTFStatus,
  MTFSignalValidation,
  ApiResponse,
} from '@/lib/types/index';

const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'];

// 타임프레임별 캔들 간격 (밀리초)
const CANDLE_INTERVALS: Record<string, number> = {
  '5m': 5 * 60 * 1000,       // 5분
  '15m': 15 * 60 * 1000,     // 15분
  '30m': 30 * 60 * 1000,     // 30분
  '1h': 60 * 60 * 1000,      // 1시간
  '4h': 4 * 60 * 60 * 1000,  // 4시간
  '1d': 24 * 60 * 60 * 1000, // 1일
};

// 다음 캔들 마감 시간 계산 (UTC 기준)
export const getNextCandleClose = (timeframe: string): number => {
  const now = Date.now();
  const interval = CANDLE_INTERVALS[timeframe] || 5 * 60 * 1000;

  // 현재 시간을 interval로 나눈 나머지를 빼서 현재 캔들 시작 시간 계산
  // 그 다음 interval을 더하면 다음 캔들 마감 시간
  const currentCandleStart = Math.floor(now / interval) * interval;
  const nextCandleClose = currentCandleStart + interval;

  return nextCandleClose;
};

// 캔들 마감까지 남은 시간 (초)
export const getSecondsUntilClose = (timeframe: string): number => {
  const nextClose = getNextCandleClose(timeframe);
  const remaining = Math.max(0, Math.floor((nextClose - Date.now()) / 1000));
  return remaining;
};

// 타임프레임별 갱신 간격 (초) - UI 표시용 (캔들 간격)
export const CANDLE_INTERVALS_SEC: Record<string, number> = {
  '5m': 5 * 60,
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
};

interface UseMTFParams {
  symbol: string;
  limit?: number;
  enabled?: boolean;
}

// 타임프레임 데이터 변환
const processTimeframeData = (
  timeframe: string,
  data: ApiResponse | undefined
): MTFTimeframeData | null => {
  if (!data?.success || !data?.data?.candles?.length) {
    return null;
  }

  const candles = data.data.candles;
  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle[4]; // close

  // EMA 데이터
  const ema = data.data.indicators?.ema;
  const ema20 = ema?.ema20?.[ema.ema20.length - 1] ?? null;
  const ema50 = ema?.ema50?.[ema.ema50.length - 1] ?? null;
  const ema200 = ema?.ema200?.[ema.ema200.length - 1] ?? null;

  // 추세 판단: 가격 > EMA200 AND EMA20 > EMA50 = bullish
  let trend: MTFStatus = 'neutral';
  if (ema200 && ema50 && ema20) {
    if (currentPrice > ema200 && ema20 > ema50) {
      trend = 'bullish';
    } else if (currentPrice < ema200 && ema20 < ema50) {
      trend = 'bearish';
    }
  }

  // RSI
  const rsiArray = data.data.indicators?.rsi;
  const rsi = rsiArray ? rsiArray[rsiArray.length - 1] : null;

  // CVD 방향 (최근 10캔들 기준)
  const cvdDirection = getCvdDirection(data.data.indicators?.cvd);

  // OI 방향 (최근 10캔들 기준)
  const oiDirection = getOiDirection(data.data.indicators?.oi);

  // 다이버전스 (최근 신호)
  const divergence = getLatestDivergence(data.data.signals?.divergence);

  return {
    timeframe,
    trend,
    rsi,
    cvdDirection,
    oiDirection,
    divergence,
    currentPrice,
    ema20,
    ema50,
    ema200,
  };
};

// CVD 방향 계산 (최근 N캔들 기준)
const getCvdDirection = (cvd: number[] | undefined): MTFStatus => {
  if (!cvd || cvd.length < 10) return 'neutral';

  const recent = cvd.slice(-10);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const change = ((end - start) / Math.abs(start || 1)) * 100;

  if (change > 2) return 'bullish';
  if (change < -2) return 'bearish';
  return 'neutral';
};

// OI 방향 계산 (최근 N캔들 기준)
const getOiDirection = (oi: (number | null)[] | undefined): MTFStatus => {
  if (!oi) return 'neutral';

  const validOi = oi.filter((v): v is number => v !== null);
  if (validOi.length < 10) return 'neutral';

  const recent = validOi.slice(-10);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const change = ((end - start) / Math.abs(start || 1)) * 100;

  if (change > 2) return 'bullish';
  if (change < -2) return 'bearish';
  return 'neutral';
};

// 최근 다이버전스 가져오기
const getLatestDivergence = (
  signals: { type: string; direction: string; phase: string }[] | undefined
): MTFTimeframeData['divergence'] => {
  if (!signals?.length) return null;

  // 최근 5개 신호 중 마지막
  const recentSignals = signals
    .filter((s) => s.phase === 'start')
    .slice(-5);

  if (recentSignals.length === 0) return null;

  const latest = recentSignals[recentSignals.length - 1];
  return {
    type: latest.type as 'rsi' | 'obv' | 'cvd' | 'oi',
    direction: latest.direction as 'bullish' | 'bearish',
  };
};

// 전체 추세 계산
const calculateOverallTrend = (
  timeframes: MTFTimeframeData[]
): MTFStatus => {
  const bullishCount = timeframes.filter((t) => t.trend === 'bullish').length;
  const bearishCount = timeframes.filter((t) => t.trend === 'bearish').length;

  if (bullishCount > timeframes.length / 2) return 'bullish';
  if (bearishCount > timeframes.length / 2) return 'bearish';
  return 'neutral';
};

// 강도 점수 계산 (0~1)
const calculateStrengthScore = (timeframes: MTFTimeframeData[]): number => {
  if (timeframes.length === 0) return 0;

  const trends = timeframes.map((t) => t.trend);
  const bullishCount = trends.filter((t) => t === 'bullish').length;
  const bearishCount = trends.filter((t) => t === 'bearish').length;
  const maxCount = Math.max(bullishCount, bearishCount);

  return maxCount / trends.length;
};

// MTF 신호 검증
export const validateMTFSignal = (
  signalDirection: 'bullish' | 'bearish',
  entryTimeframe: string,
  mtfData: MTFOverviewData
): MTFSignalValidation => {
  const tfOrder = ['5m', '15m', '30m', '1h', '4h', '1d'];
  const entryIndex = tfOrder.indexOf(entryTimeframe);

  // 상위 타임프레임 가져오기
  const higherTFs = mtfData.timeframes.filter((tf) => {
    const tfIndex = tfOrder.indexOf(tf.timeframe);
    return tfIndex > entryIndex;
  });

  if (higherTFs.length === 0) {
    return {
      valid: true,
      confidence: 1,
      details: [],
    };
  }

  const details = higherTFs.map((tf) => ({
    timeframe: tf.timeframe,
    trend: tf.trend,
    aligned:
      tf.trend === signalDirection ||
      tf.trend === 'neutral',
  }));

  // 4시간봉 추세가 반대면 Invalid
  const h4Data = details.find((d) => d.timeframe === '4h');
  if (h4Data && !h4Data.aligned && h4Data.trend !== 'neutral') {
    return {
      valid: false,
      confidence: 0,
      reason: '4H 추세 역행',
      details,
    };
  }

  // 정렬된 타임프레임 개수로 신뢰도 계산
  const alignedCount = details.filter((d) => d.aligned).length;
  const confidence = alignedCount / details.length;

  return {
    valid: true,
    confidence,
    details,
  };
};

export function useMTF({ symbol, limit = 200, enabled = true }: UseMTFParams) {
  // 각 타임프레임별 다음 캔들 마감 시간
  const [nextCloseTime, setNextCloseTime] = useState<Record<string, number>>(() => {
    return TIMEFRAMES.reduce((acc, tf) => ({ ...acc, [tf]: getNextCandleClose(tf) }), {});
  });

  // 캔들 마감 시 refetch를 위한 타이머
  const timerRefs = useRef<Record<string, NodeJS.Timeout | null>>({});

  const queries = useQueries({
    queries: TIMEFRAMES.map((timeframe) => ({
      queryKey: ['mtf-candles', symbol, timeframe, limit],
      queryFn: () => fetchCandles({ symbol, timeframe, limit }),
      enabled,
      staleTime: CANDLE_INTERVALS[timeframe] / 2,
      // refetchInterval 제거 - 수동으로 캔들 마감 시 갱신
      refetchInterval: false as const,
    })),
  });

  // 캔들 마감 시 자동 갱신 스케줄링
  useEffect(() => {
    if (!enabled) return;

    const scheduleRefetch = (timeframe: string, queryIndex: number) => {
      // 기존 타이머 취소
      if (timerRefs.current[timeframe]) {
        clearTimeout(timerRefs.current[timeframe]!);
      }

      const msUntilClose = getNextCandleClose(timeframe) - Date.now();
      // 캔들 마감 2초 후에 갱신 (데이터 확정 대기)
      const delay = Math.max(0, msUntilClose + 2000);

      timerRefs.current[timeframe] = setTimeout(() => {
        queries[queryIndex].refetch();
        // 다음 캔들 마감 시간 업데이트
        setNextCloseTime((prev) => ({
          ...prev,
          [timeframe]: getNextCandleClose(timeframe),
        }));
        // 다음 캔들 마감 스케줄링
        scheduleRefetch(timeframe, queryIndex);
      }, delay);
    };

    // 각 타임프레임별 스케줄링
    TIMEFRAMES.forEach((tf, index) => {
      scheduleRefetch(tf, index);
    });

    // 클린업
    return () => {
      Object.values(timerRefs.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [enabled, symbol]); // queries 제외 - 무한 루프 방지

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  // 모든 타임프레임 데이터 처리
  const timeframesData: MTFTimeframeData[] = queries
    .map((q, index) => processTimeframeData(TIMEFRAMES[index], q.data))
    .filter((t): t is MTFTimeframeData => t !== null);

  const mtfData: MTFOverviewData | null =
    timeframesData.length > 0
      ? {
          timeframes: timeframesData,
          overallTrend: calculateOverallTrend(timeframesData),
          alignmentScore: calculateStrengthScore(timeframesData),
        }
      : null;

  // 개별 타임프레임 refetch
  const refetchTimeframe = useCallback((timeframe: string) => {
    const index = TIMEFRAMES.indexOf(timeframe);
    if (index !== -1) {
      queries[index].refetch();
    }
  }, [queries]);

  return {
    data: mtfData,
    isLoading,
    isError,
    nextCloseTime,
    refetch: () => queries.forEach((q) => q.refetch()),
    refetchTimeframe,
    validateSignal: (
      signalDirection: 'bullish' | 'bearish',
      entryTimeframe: string
    ) =>
      mtfData
        ? validateMTFSignal(signalDirection, entryTimeframe, mtfData)
        : null,
  };
}
