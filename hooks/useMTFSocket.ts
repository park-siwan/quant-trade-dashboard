'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  MTFTimeframeData,
  MTFOverviewData,
  MTFStatus,
  MTFStrength,
  MTFSignalValidation,
  MTFActionInfo,
  OrderBlock,
} from '@/lib/types/index';
import {
  TIMEFRAMES,
  timeframeToSeconds,
  getNextCandleClose,
  getSecondsUntilClose,
} from '@/lib/timeframe';
import {
  DIVERGENCE_EXPIRY_CANDLES,
  DIVERGENCE_TYPE_PRIORITY,
} from '@/lib/divergence';
import { ADX } from '@/lib/thresholds';
import { useSocket } from '@/contexts/SocketContext';

// Re-export for backward compatibility
export { getNextCandleClose, getSecondsUntilClose };

// 타임프레임별 캔들 간격 (초) - timeframeToSeconds 사용
export const CANDLE_INTERVALS_SEC: Record<string, number> = Object.fromEntries(
  TIMEFRAMES.map(tf => [tf, timeframeToSeconds(tf)])
);

interface BackendTimeframeData {
  timeframe: string;
  candles: number[][];
  indicators: {
    rsi?: number[];
    ema?: {
      ema20?: number[];
      ema50?: number[];
      ema200?: number[];
    };
    cvd?: number[];
    oi?: (number | null)[];
  };
  signals?: {
    divergence?: Array<{
      type: string;
      direction: string;
      phase: string;
      timestamp?: number;
      index?: number;
      confirmed?: boolean; // 피봇 확정 여부
    }>;
  };
  cvdOi?: {
    cvd: number[];
    oi: (number | null)[];
  };
  vwapAtr?: {
    atrRatio?: number;
  };
  adx?: {
    adx?: number[];
    currentAdx?: number;
  };
  orderBlocks?: {
    activeBlocks?: Array<{
      type: 'bullish' | 'bearish';
      top: number;
      bottom: number;
      high?: number;
      low?: number;
      strength: number | 'strong' | 'medium' | 'weak';
      timestamp: number;
      startIndex?: number;
      broken?: boolean;
      isActive?: boolean;
    }>;
    blocks?: Array<{
      type: 'bullish' | 'bearish';
      top: number;
      bottom: number;
      high?: number;
      low?: number;
      strength: number | 'strong' | 'medium' | 'weak';
      timestamp: number;
      startIndex?: number;
      broken?: boolean;
      isActive?: boolean;
    }>;
  };
}

interface BackendMTFData {
  timestamp: number;
  symbol: string;
  timeframes: BackendTimeframeData[];
}

interface DivergenceInfo {
  type: 'rsi' | 'obv' | 'cvd' | 'oi';
  direction: 'bullish' | 'bearish';
  timestamp: number;
  candlesAgo: number;
  isExpired: boolean;
  confirmed?: boolean; // 피봇 확정 여부 (캔들 종가 확정 후 true)
  isFiltered?: boolean; // RSI 필터링 여부 (알림 제외용)
}

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
  divergence: DivergenceInfo | null;
  divergences: DivergenceInfo[]; // 모든 다이버전스 (우선순위 정렬)
  currentPrice: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  adx: number | null;
  isStrongTrend: boolean;
  atrRatio: number | null;
}

interface UseMTFSocketParams {
  symbol?: string;
  enabled?: boolean;
}

// CVD 분석
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
    strength = 'strong';
  } else if (change > 4) {
    direction = 'bullish';
    strength = 'medium';
  } else if (change > 2) {
    direction = 'bullish';
    strength = 'weak';
  } else if (change < -8) {
    direction = 'bearish';
    strength = 'strong';
  } else if (change < -4) {
    direction = 'bearish';
    strength = 'medium';
  } else if (change < -2) {
    direction = 'bearish';
    strength = 'weak';
  }

  return { direction, strength, change };
};

// OI 분석
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
    strength = 'strong';
  } else if (change > 4) {
    direction = 'bullish';
    strength = 'medium';
  } else if (change > 2) {
    direction = 'bullish';
    strength = 'weak';
  } else if (change < -8) {
    direction = 'bearish';
    strength = 'strong';
  } else if (change < -4) {
    direction = 'bearish';
    strength = 'medium';
  } else if (change < -2) {
    direction = 'bearish';
    strength = 'weak';
  }

  return { direction, strength, change };
};

// 모든 다이버전스 추출 (우선순위 정렬)
const getAllDivergences = (
  signals: Array<{ type: string; direction: string; phase: string; timestamp?: number; index?: number; confirmed?: boolean; isFiltered?: boolean }> | undefined,
  totalCandles: number,
  timeframe: string
): DivergenceInfo[] => {
  if (!signals?.length) return [];

  const endSignals = signals.filter((s) => s.phase === 'end');
  if (endSignals.length === 0) return [];

  const expiryCandles = DIVERGENCE_EXPIRY_CANDLES[timeframe] || 24;

  const divergences = endSignals.map(signal => {
    const candlesAgo = signal.index !== undefined ? totalCandles - 1 - signal.index : 0;
    const isExpired = candlesAgo > expiryCandles;
    const direction = signal.direction as 'bullish' | 'bearish';

    // 백엔드에서 isFiltered 값 사용 (폴백 없음)
    const isFiltered = signal.isFiltered ?? false;

    return {
      type: signal.type as 'rsi' | 'obv' | 'cvd' | 'oi',
      direction,
      timestamp: signal.timestamp || Date.now(),
      candlesAgo,
      isExpired,
      confirmed: signal.confirmed,
      isFiltered,
    };
  });

  // 우선순위 정렬: 1) 만료 여부, 2) 최신순, 3) 타입 우선순위
  return divergences.sort((a, b) => {
    // 만료되지 않은 것이 우선
    if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
    // 최신순 (가장 최근 다이버전스 우선)
    if (a.candlesAgo !== b.candlesAgo) return a.candlesAgo - b.candlesAgo;
    // 같은 시점이면 타입 우선순위
    const priorityA = DIVERGENCE_TYPE_PRIORITY[a.type] || 0;
    const priorityB = DIVERGENCE_TYPE_PRIORITY[b.type] || 0;
    return priorityB - priorityA;
  });
};

// 다이버전스 추출 (우선순위: RSI > CVD > OBV > OI) - 대표 1개
const getLatestDivergence = (
  signals: Array<{ type: string; direction: string; phase: string; timestamp?: number; index?: number; isFiltered?: boolean }> | undefined,
  totalCandles: number,
  timeframe: string
): DivergenceInfo | null => {
  const all = getAllDivergences(signals, totalCandles, timeframe);
  return all.length > 0 ? all[0] : null;
};

// 백엔드 데이터 → RawTimeframeData 변환
const processBackendData = (tf: BackendTimeframeData): RawTimeframeData | null => {
  const candles = tf.candles;
  if (!candles?.length) return null;

  const lastCandle = candles[candles.length - 1];
  const currentPrice = lastCandle[4];

  const ema = tf.indicators?.ema;
  const ema20 = ema?.ema20?.[ema.ema20.length - 1] ?? null;
  const ema50 = ema?.ema50?.[ema.ema50.length - 1] ?? null;
  const ema200 = ema?.ema200?.[ema.ema200.length - 1] ?? null;

  let trend: MTFStatus = 'neutral';
  if (ema200 && ema50 && ema20) {
    if (currentPrice > ema200 && ema20 > ema50) {
      trend = 'bullish';
    } else if (currentPrice < ema200 && ema20 < ema50) {
      trend = 'bearish';
    }
  }

  const rsiArray = tf.indicators?.rsi;
  const rsi = rsiArray ? rsiArray[rsiArray.length - 1] : null;

  const cvd = tf.cvdOi?.cvd || tf.indicators?.cvd;
  const oi = tf.cvdOi?.oi || tf.indicators?.oi;

  const cvdAnalysis = analyzeCvd(cvd);
  const oiAnalysis = analyzeOi(oi);

  // 모든 다이버전스 추출 (우선순위 정렬, 백엔드 isFiltered 사용)
  const divergences = getAllDivergences(
    tf.signals?.divergence,
    candles.length,
    tf.timeframe
  );
  // 대표 다이버전스 (첫 번째)
  const divergence = divergences.length > 0 ? divergences[0] : null;

  const adx = tf.adx?.currentAdx ?? null;
  const isStrongTrend = adx !== null && adx >= ADX.STRONG_TREND;
  const atrRatio = tf.vwapAtr?.atrRatio ?? null;

  return {
    timeframe: tf.timeframe,
    trend,
    rsi,
    cvdDirection: cvdAnalysis.direction,
    cvdStrength: cvdAnalysis.strength,
    cvdChange: cvdAnalysis.change,
    oiDirection: oiAnalysis.direction,
    oiStrength: oiAnalysis.strength,
    oiChange: oiAnalysis.change,
    divergence,
    divergences,
    currentPrice,
    ema20,
    ema50,
    ema200,
    adx,
    isStrongTrend,
    atrRatio,
  };
};

// 전체 추세 계산
const calculateOverallTrend = (timeframes: RawTimeframeData[]): MTFStatus => {
  const bullishCount = timeframes.filter((t) => t.trend === 'bullish').length;
  const bearishCount = timeframes.filter((t) => t.trend === 'bearish').length;

  if (bullishCount > timeframes.length / 2) return 'bullish';
  if (bearishCount > timeframes.length / 2) return 'bearish';
  return 'neutral';
};

// 강도 점수 계산
const calculateStrengthScore = (timeframes: RawTimeframeData[]): number => {
  if (timeframes.length === 0) return 0;

  const trends = timeframes.map((t) => t.trend);
  const bullishCount = trends.filter((t) => t === 'bullish').length;
  const bearishCount = trends.filter((t) => t === 'bearish').length;
  const maxCount = Math.max(bullishCount, bearishCount);

  return maxCount / trends.length;
};

// 액션 추천 계산 (역추세 매매 전용 - 다이버전스 기반)
const calculateAction = (
  tfData: RawTimeframeData,
  _overallTrend: MTFStatus,
  _higherTfTrend: MTFStatus
): MTFActionInfo => {
  const { divergence, rsi, isStrongTrend } = tfData;

  // 유효한 다이버전스만 신호 생성 (만료 안 됨 + 필터링 안 됨)
  if (divergence && !divergence.isExpired && !divergence.isFiltered) {
    const divDirection = divergence.direction;

    // 강한 추세에서 역추세 다이버전스 → 주의
    if (isStrongTrend) {
      return { action: 'reversal_warn', reason: '강한추세 역행🔥' };
    }

    // 다이버전스 방향에 따른 신호
    if (divDirection === 'bullish') {
      return { action: 'long_ok', reason: '상승 다이버전스' };
    }
    return { action: 'short_ok', reason: '하락 다이버전스' };
  }

  // RSI 극단값 경고 (다이버전스 없이도 역추세 기회 포착)
  if (rsi !== null) {
    if (rsi >= 75) {
      return { action: 'reversal_warn', reason: 'RSI 과매수' };
    }
    if (rsi <= 25) {
      return { action: 'reversal_warn', reason: 'RSI 과매도' };
    }
  }

  // 다이버전스 없으면 대기
  return { action: 'wait', reason: '다이버전스 대기' };
};

// Volume Profile 계산
interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
}

const calculateVolumeProfile = (candles: number[][]): VolumeProfileResult | null => {
  if (!candles || candles.length < 10) return null;

  const prices = candles.map(c => ({ high: c[2], low: c[3], close: c[4], volume: c[5] || 0 }));
  const allHighs = prices.map(p => p.high);
  const allLows = prices.map(p => p.low);
  const maxPrice = Math.max(...allHighs);
  const minPrice = Math.min(...allLows);
  const priceRange = maxPrice - minPrice;

  if (priceRange === 0) return null;

  const bucketCount = 50;
  const bucketSize = priceRange / bucketCount;

  const buckets: { price: number; volume: number }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    buckets.push({
      price: minPrice + (i + 0.5) * bucketSize,
      volume: 0,
    });
  }

  prices.forEach(({ high, low, volume }) => {
    const lowBucket = Math.floor((low - minPrice) / bucketSize);
    const highBucket = Math.min(Math.floor((high - minPrice) / bucketSize), bucketCount - 1);

    const bucketsInRange = highBucket - lowBucket + 1;
    const volumePerBucket = volume / bucketsInRange;

    for (let i = Math.max(0, lowBucket); i <= highBucket; i++) {
      if (buckets[i]) {
        buckets[i].volume += volumePerBucket;
      }
    }
  });

  const poc = buckets.reduce((max, b) => b.volume > max.volume ? b : max, buckets[0]);
  const totalVolume = buckets.reduce((sum, b) => sum + b.volume, 0);
  const targetVolume = totalVolume * 0.7;

  const pocIndex = buckets.indexOf(poc);
  let vaLowIndex = pocIndex;
  let vaHighIndex = pocIndex;
  let vaVolume = poc.volume;

  while (vaVolume < targetVolume && (vaLowIndex > 0 || vaHighIndex < buckets.length - 1)) {
    const lowVol = vaLowIndex > 0 ? buckets[vaLowIndex - 1].volume : 0;
    const highVol = vaHighIndex < buckets.length - 1 ? buckets[vaHighIndex + 1].volume : 0;

    if (lowVol >= highVol && vaLowIndex > 0) {
      vaLowIndex--;
      vaVolume += lowVol;
    } else if (vaHighIndex < buckets.length - 1) {
      vaHighIndex++;
      vaVolume += highVol;
    } else if (vaLowIndex > 0) {
      vaLowIndex--;
      vaVolume += lowVol;
    }
  }

  return {
    poc: poc.price,
    vah: buckets[vaHighIndex].price + bucketSize / 2,
    val: buckets[vaLowIndex].price - bucketSize / 2,
  };
};

// MTF 신호 검증
export const validateMTFSignal = (
  signalDirection: 'bullish' | 'bearish',
  entryTimeframe: string,
  mtfData: MTFOverviewData
): MTFSignalValidation => {
  const tfOrder = ['5m', '15m', '30m', '1h', '4h', '1d'];
  const entryIndex = tfOrder.indexOf(entryTimeframe);

  const higherTFs = mtfData.timeframes.filter((tf) => {
    const tfIndex = tfOrder.indexOf(tf.timeframe);
    return tfIndex > entryIndex;
  });

  if (higherTFs.length === 0) {
    return { valid: true, confidence: 1, details: [] };
  }

  const details = higherTFs.map((tf) => ({
    timeframe: tf.timeframe,
    trend: tf.trend,
    aligned: tf.trend === signalDirection || tf.trend === 'neutral',
  }));

  const h4Data = details.find((d) => d.timeframe === '4h');
  if (h4Data && !h4Data.aligned && h4Data.trend !== 'neutral') {
    return {
      valid: false,
      confidence: 0,
      reason: '4H 추세 역행',
      details,
    };
  }

  const alignedCount = details.filter((d) => d.aligned).length;
  const confidence = alignedCount / details.length;

  return { valid: true, confidence, details };
};

export function useMTFSocket({ symbol = 'BTCUSDT', enabled = true }: UseMTFSocketParams = {}) {
  const { mtfData: backendData, lastMtfUpdate: lastUpdate, isConnected, subscribeMtf } = useSocket();
  const [isLoading, setIsLoading] = useState(true);

  // 로딩 상태 업데이트
  useEffect(() => {
    if (backendData) {
      setIsLoading(false);
    }
  }, [backendData]);

  // 심볼 구독 (필요시)
  useEffect(() => {
    if (enabled) {
      subscribeMtf(symbol);
    }
  }, [enabled, symbol, subscribeMtf]);

  // 다음 캔들 마감 시간
  const nextCloseTime = useMemo(() => {
    return TIMEFRAMES.reduce((acc, tf) => ({ ...acc, [tf]: getNextCandleClose(tf) }), {} as Record<string, number>);
  }, [lastUpdate]);

  // 백엔드 데이터 → UI 데이터 변환
  const processedData = useMemo((): {
    mtfData: MTFOverviewData | null;
    volumeProfile: VolumeProfileResult | null;
    orderBlocks: OrderBlock[] | undefined;
  } => {
    if (!backendData?.timeframes?.length) {
      return { mtfData: null, volumeProfile: null, orderBlocks: undefined };
    }

    const rawTimeframesData = backendData.timeframes
      .map(processBackendData)
      .filter((t): t is RawTimeframeData => t !== null);

    if (rawTimeframesData.length === 0) {
      return { mtfData: null, volumeProfile: null, orderBlocks: undefined };
    }

    const overallTrend = calculateOverallTrend(rawTimeframesData);
    const h4Trend: MTFStatus = rawTimeframesData.find(t => t.timeframe === '4h')?.trend || 'neutral';
    const d1Trend: MTFStatus = rawTimeframesData.find(t => t.timeframe === '1d')?.trend || 'neutral';
    const higherTfTrend: MTFStatus = d1Trend !== 'neutral' ? d1Trend : h4Trend;

    const timeframesData: MTFTimeframeData[] = rawTimeframesData.map((tfData): MTFTimeframeData => ({
      ...tfData,
      actionInfo: calculateAction(tfData, overallTrend, higherTfTrend),
    }));

    const mtfData: MTFOverviewData = {
      timeframes: timeframesData,
      overallTrend,
      alignmentScore: calculateStrengthScore(rawTimeframesData),
    };

    // Volume Profile (4h)
    const h4Data = backendData.timeframes.find(tf => tf.timeframe === '4h');
    const volumeProfile = h4Data?.candles ? calculateVolumeProfile(h4Data.candles) : null;

    // Order Blocks (4h) - transform to OrderBlock type
    const rawOrderBlocks = h4Data?.orderBlocks?.activeBlocks || h4Data?.orderBlocks?.blocks;
    const orderBlocks: OrderBlock[] | undefined = rawOrderBlocks?.map((ob: any, index: number) => ({
      type: ob.type,
      startIndex: ob.startIndex ?? index,
      timestamp: ob.timestamp,
      high: ob.high ?? ob.top,
      low: ob.low ?? ob.bottom,
      isActive: ob.isActive ?? (ob.broken !== undefined ? !ob.broken : true),
      strength: (typeof ob.strength === 'number'
        ? ob.strength >= 0.7 ? 'strong' : ob.strength >= 0.4 ? 'medium' : 'weak'
        : ob.strength) as 'strong' | 'medium' | 'weak',
    }));

    return { mtfData, volumeProfile, orderBlocks };
  }, [backendData]);

  // 수동 새로고침 (재구독)
  const refetch = useCallback(() => {
    subscribeMtf(symbol);
  }, [symbol, subscribeMtf]);

  // 특정 타임프레임의 원본 다이버전스 시그널 가져오기
  const getRawDivergences = useCallback((timeframe: string) => {
    if (!backendData?.timeframes) return [];
    const tf = backendData.timeframes.find(t => t.timeframe === timeframe);
    return tf?.signals?.divergence || [];
  }, [backendData]);

  return {
    data: processedData.mtfData,
    isLoading,
    isError: false,
    isConnected,
    nextCloseTime,
    volumeProfile: processedData.volumeProfile,
    orderBlocks: processedData.orderBlocks,
    lastUpdate,
    refetch,
    refetchTimeframe: (_timeframe?: string) => refetch(), // WebSocket이라 개별 타임프레임 갱신 불필요
    validateSignal: (
      signalDirection: 'bullish' | 'bearish',
      entryTimeframe: string
    ) =>
      processedData.mtfData
        ? validateMTFSignal(signalDirection, entryTimeframe, processedData.mtfData)
        : null,
    getRawDivergences, // 원본 다이버전스 시그널 (차트용)
  };
}
