'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  MTFTimeframeData,
  MTFOverviewData,
  MTFStatus,
  MTFStrength,
  MTFSignalValidation,
  MTFActionInfo,
  OrderBlock,
} from '@/lib/types/index';
import { API_CONFIG } from '@/lib/config';

const TIMEFRAMES = ['5m', '15m', '30m', '1h', '4h', '1d'];

// 타임프레임별 캔들 간격 (밀리초)
const CANDLE_INTERVALS: Record<string, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

// 다이버전스 유효기간 (캔들 수 기준)
const DIVERGENCE_EXPIRY_CANDLES: Record<string, number> = {
  '5m': 24,
  '15m': 24,
  '30m': 48,
  '1h': 72,
  '4h': 42,
  '1d': 14,
};

export const CANDLE_INTERVALS_SEC: Record<string, number> = {
  '5m': 5 * 60,
  '15m': 15 * 60,
  '30m': 30 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
};

export const getNextCandleClose = (timeframe: string): number => {
  const now = Date.now();
  const interval = CANDLE_INTERVALS[timeframe] || 5 * 60 * 1000;
  const currentCandleStart = Math.floor(now / interval) * interval;
  return currentCandleStart + interval;
};

export const getSecondsUntilClose = (timeframe: string): number => {
  const nextClose = getNextCandleClose(timeframe);
  return Math.max(0, Math.floor((nextClose - Date.now()) / 1000));
};

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
    isExpired: boolean;
  } | null;
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

// 다이버전스 추출
const getLatestDivergence = (
  signals: Array<{ type: string; direction: string; phase: string; timestamp?: number; index?: number }> | undefined,
  totalCandles: number,
  timeframe: string
): RawTimeframeData['divergence'] => {
  if (!signals?.length) return null;

  const endSignals = signals.filter((s) => s.phase === 'end');
  if (endSignals.length === 0) return null;

  const latest = endSignals[endSignals.length - 1];
  const candlesAgo = latest.index !== undefined ? totalCandles - 1 - latest.index : 0;
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

  const divergence = getLatestDivergence(
    tf.signals?.divergence,
    candles.length,
    tf.timeframe
  );

  const adx = tf.adx?.currentAdx ?? null;
  const isStrongTrend = adx !== null && adx >= 25;
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

// 액션 추천 계산
const calculateAction = (
  tfData: RawTimeframeData,
  overallTrend: MTFStatus,
  higherTfTrend: MTFStatus
): MTFActionInfo => {
  const { trend, divergence, rsi, isStrongTrend, atrRatio } = tfData;

  if (divergence && !divergence.isExpired) {
    const divDirection = divergence.direction;

    if (divDirection === 'bullish' && (overallTrend === 'bullish' || higherTfTrend === 'bullish')) {
      return { action: 'long_ok', reason: '추세+다이버전스 일치' };
    }
    if (divDirection === 'bearish' && (overallTrend === 'bearish' || higherTfTrend === 'bearish')) {
      return { action: 'short_ok', reason: '추세+다이버전스 일치' };
    }

    if (divDirection === 'bullish' && (overallTrend === 'bearish' || higherTfTrend === 'bearish')) {
      const reason = isStrongTrend ? '강한추세 역행🔥' : '역추세 다이버전스';
      return { action: 'reversal_warn', reason };
    }
    if (divDirection === 'bearish' && (overallTrend === 'bullish' || higherTfTrend === 'bullish')) {
      const reason = isStrongTrend ? '강한추세 역행🔥' : '역추세 다이버전스';
      return { action: 'reversal_warn', reason };
    }

    if (divDirection === 'bullish') {
      return { action: 'long_ok', reason: '다이버전스 발생' };
    }
    return { action: 'short_ok', reason: '다이버전스 발생' };
  }

  if (rsi !== null && !isStrongTrend) {
    if (rsi >= 70 && trend === 'bullish') {
      return { action: 'reversal_warn', reason: 'RSI 과매수' };
    }
    if (rsi <= 30 && trend === 'bearish') {
      return { action: 'reversal_warn', reason: 'RSI 과매도' };
    }
  }

  if (trend === 'neutral' && atrRatio !== null && atrRatio < 0.8) {
    return { action: 'wait', reason: '횡보 저변동' };
  }

  if (trend === 'bullish') {
    if (divergence && divergence.direction === 'bearish') {
      const suffix = divergence.isExpired ? '(만료)' : '';
      return { action: 'reversal_warn', reason: `반락주의${suffix}` };
    }
    return { action: 'trend_hold', reason: '상승추세 유지' };
  }
  if (trend === 'bearish') {
    if (divergence && divergence.direction === 'bullish') {
      const suffix = divergence.isExpired ? '(만료)' : '';
      return { action: 'reversal_warn', reason: `반등주의${suffix}` };
    }
    return { action: 'trend_hold', reason: '하락추세 유지' };
  }

  return { action: 'wait', reason: '명확한 신호 없음' };
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
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const [backendData, setBackendData] = useState<BackendMTFData | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Socket.io 연결
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const socket = io(`${API_CONFIG.BASE_URL}/mtf`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[MTF Socket] Connected');
      setIsConnected(true);
      socket.emit('subscribe', { symbol });
    });

    socket.on('disconnect', () => {
      console.log('[MTF Socket] Disconnected');
      setIsConnected(false);
    });

    socket.on('mtf:data', (data: BackendMTFData) => {
      setBackendData(data);
      setLastUpdate(Date.now());
      setIsLoading(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[MTF Socket] Connection error:', error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, symbol]);

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
    const orderBlocks: OrderBlock[] | undefined = rawOrderBlocks?.map((ob, index) => ({
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
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', { symbol });
    }
  }, [symbol]);

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
  };
}
