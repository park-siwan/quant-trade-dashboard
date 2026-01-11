import { useQueries } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchCandles } from '@/lib/api/exchange';
import {
  MTFTimeframeData,
  MTFOverviewData,
  MTFStatus,
  MTFStrength,
  MTFSignalValidation,
  MTFAction,
  MTFActionInfo,
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

// 다이버전스 유효기간 (캔들 수 기준)
// 5m~15m: 수 시간 → ~24캔들 (5m: 2시간, 15m: 6시간)
// 30m~1h: 1~3일 → ~48캔들
// 4h: 3~7일 → ~42캔들 (7일)
// 1d: 7~14일 → ~14캔들
export const DIVERGENCE_EXPIRY_CANDLES: Record<string, number> = {
  '5m': 24,   // 2시간
  '15m': 24,  // 6시간
  '30m': 48,  // 1일
  '1h': 72,   // 3일
  '4h': 42,   // 7일
  '1d': 14,   // 14일
};

interface UseMTFParams {
  symbol: string;
  limit?: number;
  enabled?: boolean;
}

// actionInfo 없는 중간 타입
interface RawTimeframeData {
  timeframe: string;
  trend: MTFStatus;
  rsi: number | null;
  cvdDirection: MTFStatus;
  cvdStrength: MTFStrength;
  cvdChange: number;
  oiDirection: MTFStatus;
  oiStrength: MTFStrength;
  oiChange: number;
  divergence: {
    type: 'rsi' | 'obv' | 'cvd' | 'oi';
    direction: 'bullish' | 'bearish';
    timestamp: number;
    candlesAgo: number;
    isExpired: boolean; // 유효기간 만료 여부
  } | null;
  currentPrice: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  // ADX (추세 강도)
  adx: number | null;
  isStrongTrend: boolean; // ADX >= 25
  // ATR Ratio (평균 대비 변동성)
  atrRatio: number | null;
}

// 타임프레임 데이터 변환
const processTimeframeData = (
  timeframe: string,
  data: ApiResponse | undefined
): RawTimeframeData | null => {
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

  // CVD 분석 (방향 + 강도 + 변화율)
  const cvdAnalysis = analyzeCvd(data.data.indicators?.cvd);

  // OI 분석 (방향 + 강도 + 변화율)
  const oiAnalysis = analyzeOi(data.data.indicators?.oi);

  // 다이버전스 (최근 신호 + 시간 정보 + 만료 여부)
  const divergence = getLatestDivergence(
    data.data.signals?.divergence,
    candles.length,
    timeframe
  );

  // ADX 데이터
  const adxData = data.data.adx;
  const adx = adxData?.currentAdx ?? null;
  const isStrongTrend = adx !== null && adx >= 25;

  // ATR Ratio (평균 대비 변동성)
  const atrRatio = data.data.vwapAtr?.atrRatio ?? null;

  return {
    timeframe,
    trend,
    rsi,
    cvdDirection: cvdAnalysis.direction,
    cvdStrength: cvdAnalysis.strength,
    cvdChange: cvdAnalysis.change,
    oiDirection: oiAnalysis.direction,
    oiStrength: oiAnalysis.strength,
    oiChange: oiAnalysis.change,
    divergence,
    currentPrice,
    ema20,
    ema50,
    ema200,
    adx,
    isStrongTrend,
    atrRatio,
  };
};

// CVD 분석 (방향 + 강도 + 변화율)
const analyzeCvd = (cvd: number[] | undefined): {
  direction: MTFStatus;
  strength: MTFStrength;
  change: number;
} => {
  if (!cvd || cvd.length < 10) {
    return { direction: 'neutral', strength: 'neutral', change: 0 };
  }

  const recent = cvd.slice(-10);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const change = ((end - start) / Math.abs(start || 1)) * 100;

  let direction: MTFStatus = 'neutral';
  let strength: MTFStrength = 'neutral';

  if (change > 8) {
    direction = 'bullish';
    strength = 'strong';      // ↑↑↑
  } else if (change > 4) {
    direction = 'bullish';
    strength = 'medium';      // ↑↑
  } else if (change > 2) {
    direction = 'bullish';
    strength = 'weak';        // ↑
  } else if (change < -8) {
    direction = 'bearish';
    strength = 'strong';      // ↓↓↓
  } else if (change < -4) {
    direction = 'bearish';
    strength = 'medium';      // ↓↓
  } else if (change < -2) {
    direction = 'bearish';
    strength = 'weak';        // ↓
  }

  return { direction, strength, change };
};

// OI 분석 (방향 + 강도 + 변화율)
const analyzeOi = (oi: (number | null)[] | undefined): {
  direction: MTFStatus;
  strength: MTFStrength;
  change: number;
} => {
  if (!oi) {
    return { direction: 'neutral', strength: 'neutral', change: 0 };
  }

  const validOi = oi.filter((v): v is number => v !== null);
  if (validOi.length < 10) {
    return { direction: 'neutral', strength: 'neutral', change: 0 };
  }

  const recent = validOi.slice(-10);
  const start = recent[0];
  const end = recent[recent.length - 1];
  const change = ((end - start) / Math.abs(start || 1)) * 100;

  let direction: MTFStatus = 'neutral';
  let strength: MTFStrength = 'neutral';

  if (change > 8) {
    direction = 'bullish';
    strength = 'strong';      // ↑↑↑
  } else if (change > 4) {
    direction = 'bullish';
    strength = 'medium';      // ↑↑
  } else if (change > 2) {
    direction = 'bullish';
    strength = 'weak';        // ↑
  } else if (change < -8) {
    direction = 'bearish';
    strength = 'strong';      // ↓↓↓
  } else if (change < -4) {
    direction = 'bearish';
    strength = 'medium';      // ↓↓
  } else if (change < -2) {
    direction = 'bearish';
    strength = 'weak';        // ↓
  }

  return { direction, strength, change };
};

// 최근 다이버전스 가져오기 (타임스탬프 + 캔들 수 + 만료 여부)
const getLatestDivergence = (
  signals: { type: string; direction: string; phase: string; timestamp?: number; index?: number }[] | undefined,
  totalCandles: number,
  timeframe: string
): RawTimeframeData['divergence'] => {
  if (!signals?.length) return null;

  // end 신호 (다이버전스 확정 시점) 필터링
  const endSignals = signals.filter((s) => s.phase === 'end');
  if (endSignals.length === 0) return null;

  // 가장 최근 확정된 다이버전스
  const latest = endSignals[endSignals.length - 1];
  const candlesAgo = latest.index !== undefined ? totalCandles - 1 - latest.index : 0;

  // 유효기간 만료 여부 확인
  const expiryCandles = DIVERGENCE_EXPIRY_CANDLES[timeframe] || 24;
  const isExpired = candlesAgo > expiryCandles;

  return {
    type: latest.type as 'rsi' | 'obv' | 'cvd' | 'oi',
    direction: latest.direction as 'bullish' | 'bearish',
    timestamp: latest.timestamp || Date.now(),
    candlesAgo,
    isExpired,
  };
};

// 전체 추세 계산
const calculateOverallTrend = (
  timeframes: RawTimeframeData[]
): MTFStatus => {
  const bullishCount = timeframes.filter((t) => t.trend === 'bullish').length;
  const bearishCount = timeframes.filter((t) => t.trend === 'bearish').length;

  if (bullishCount > timeframes.length / 2) return 'bullish';
  if (bearishCount > timeframes.length / 2) return 'bearish';
  return 'neutral';
};

// 강도 점수 계산 (0~1)
const calculateStrengthScore = (timeframes: RawTimeframeData[]): number => {
  if (timeframes.length === 0) return 0;

  const trends = timeframes.map((t) => t.trend);
  const bullishCount = trends.filter((t) => t === 'bullish').length;
  const bearishCount = trends.filter((t) => t === 'bearish').length;
  const maxCount = Math.max(bullishCount, bearishCount);

  return maxCount / trends.length;
};

// 액션 추천 계산
const calculateAction = (
  tfData: RawTimeframeData,
  overallTrend: MTFStatus,
  higherTfTrend: MTFStatus // 4h or 1d trend
): MTFActionInfo => {
  const { trend, divergence, rsi, isStrongTrend, atrRatio } = tfData;

  // 다이버전스가 있고 만료되지 않은 경우
  if (divergence && !divergence.isExpired) {
    const divDirection = divergence.direction;

    // 다이버전스가 상위TF 추세와 같은 방향 → OK
    if (divDirection === 'bullish' && (overallTrend === 'bullish' || higherTfTrend === 'bullish')) {
      return { action: 'long_ok', reason: '추세+다이버전스 일치' };
    }
    if (divDirection === 'bearish' && (overallTrend === 'bearish' || higherTfTrend === 'bearish')) {
      return { action: 'short_ok', reason: '추세+다이버전스 일치' };
    }

    // 다이버전스가 상위TF 추세와 반대 → 반전 주의
    // ADX 강한 추세(🔥)에서 역추세 다이버전스 = 더 강한 경고
    if (divDirection === 'bullish' && (overallTrend === 'bearish' || higherTfTrend === 'bearish')) {
      const reason = isStrongTrend ? '강한추세 역행🔥' : '역추세 다이버전스';
      return { action: 'reversal_warn', reason };
    }
    if (divDirection === 'bearish' && (overallTrend === 'bullish' || higherTfTrend === 'bullish')) {
      const reason = isStrongTrend ? '강한추세 역행🔥' : '역추세 다이버전스';
      return { action: 'reversal_warn', reason };
    }

    // 중립 추세에서 다이버전스
    if (divDirection === 'bullish') {
      return { action: 'long_ok', reason: '다이버전스 발생' };
    }
    return { action: 'short_ok', reason: '다이버전스 발생' };
  }

  // 다이버전스 없는 경우
  // RSI 과매수/과매도 체크 (강한 추세에서는 무시)
  if (rsi !== null && !isStrongTrend) {
    if (rsi >= 70 && trend === 'bullish') {
      return { action: 'reversal_warn', reason: 'RSI 과매수' };
    }
    if (rsi <= 30 && trend === 'bearish') {
      return { action: 'reversal_warn', reason: 'RSI 과매도' };
    }
  }

  // 횡보 + 저변동성 = 브레이크아웃 대기
  if (trend === 'neutral' && atrRatio !== null && atrRatio < 0.8) {
    return { action: 'wait', reason: '횡보 저변동' };
  }

  // 추세 유지 (다이버전스가 있으면 주의 표시)
  if (trend === 'bullish') {
    // 하락 다이버전스가 있으면 반락 주의
    if (divergence && divergence.direction === 'bearish') {
      const suffix = divergence.isExpired ? '(만료)' : '';
      return { action: 'reversal_warn', reason: `반락주의${suffix}` };
    }
    return { action: 'trend_hold', reason: '상승추세 유지' };
  }
  if (trend === 'bearish') {
    // 상승 다이버전스가 있으면 반등 주의
    if (divergence && divergence.direction === 'bullish') {
      const suffix = divergence.isExpired ? '(만료)' : '';
      return { action: 'reversal_warn', reason: `반등주의${suffix}` };
    }
    return { action: 'trend_hold', reason: '하락추세 유지' };
  }

  // 신호 없음
  return { action: 'wait', reason: '명확한 신호 없음' };
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

  // 모든 타임프레임 데이터 처리 (actionInfo 제외)
  const rawTimeframesData: RawTimeframeData[] = queries
    .map((q, index) => processTimeframeData(TIMEFRAMES[index], q.data))
    .filter((t): t is RawTimeframeData => t !== null);

  // 전체 추세 및 상위TF 추세 계산
  const overallTrend: MTFStatus = rawTimeframesData.length > 0
    ? calculateOverallTrend(rawTimeframesData)
    : 'neutral';

  // 4h, 1d 추세 가져오기
  const h4Trend: MTFStatus = rawTimeframesData.find(t => t.timeframe === '4h')?.trend || 'neutral';
  const d1Trend: MTFStatus = rawTimeframesData.find(t => t.timeframe === '1d')?.trend || 'neutral';
  const higherTfTrend: MTFStatus = d1Trend !== 'neutral' ? d1Trend : h4Trend;

  // 각 타임프레임에 actionInfo 추가
  const timeframesData: MTFTimeframeData[] = rawTimeframesData.map((tfData): MTFTimeframeData => ({
    ...tfData,
    actionInfo: calculateAction(tfData, overallTrend, higherTfTrend),
  }));

  const mtfData: MTFOverviewData | null =
    timeframesData.length > 0
      ? {
          timeframes: timeframesData,
          overallTrend,
          alignmentScore: calculateStrengthScore(rawTimeframesData),
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
