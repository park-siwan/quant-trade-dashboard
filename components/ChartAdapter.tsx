'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useCandles } from '@/hooks/useCandles';
import { useLongShortRatio } from '@/hooks/useLongShortRatio';
import { useLiquidations } from '@/hooks/useLiquidations';
import { useWhales } from '@/hooks/useWhales';
import { useMTFSocket } from '@/hooks/useMTFSocket';
import { useRegime } from '@/hooks/useRegime';
import ChartRenderer from '@/components/chart/ChartRenderer';
import { CandlestickData, LineData } from 'lightweight-charts';
import {
  DivergenceSignal,
  EmaData,
  TrendAnalysis,
  CrossoverEvent,
  ConsolidationData,
  VwapAtrData,
  OrderBlockData,
  OrderBookData,
  LiquidationSummary,
  WhaleSummary,
  MarketStructureData,
  AdxData,
} from '@/lib/types/index';

interface ChartAdapterProps {
  symbol?: string;
  initialTimeframe?: string;
  limit?: number;
}

const TIMEFRAMES = [
  { value: '1d', label: '1일' },
  { value: '4h', label: '4시간' },
  { value: '1h', label: '1시간' },
  { value: '30m', label: '30분' },
  { value: '15m', label: '15분' },
  { value: '5m', label: '5분' },
];

export default function ChartAdapter({
  symbol = 'BTC/USDT',
  initialTimeframe = '5m',
  limit = 1000,
}: ChartAdapterProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState(initialTimeframe);
  const prevSymbolRef = useRef<string>(symbol);
  const [isSymbolTransitioning, setIsSymbolTransitioning] = useState(false);

  // 심볼 변경 감지 및 전환 상태 관리
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      // 심볼이 변경되면 전환 상태로 설정 (이전 심볼 데이터 잔재 방지)
      setIsSymbolTransitioning(true);
      prevSymbolRef.current = symbol;

      // 다음 렌더 사이클에서 전환 상태 해제
      const timer = setTimeout(() => {
        setIsSymbolTransitioning(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [symbol]);

  const { data, isLoading, error, refetch, realtimeCandle } = useCandles({
    symbol,
    timeframe: selectedTimeframe,
    limit,
    enableAutoRefresh: true,
    enableWebSocket: true, // 실시간 캔들 WebSocket 활성화
  });

  // Long/Short Ratio 가져오기 (Bybit API)
  const { ratio: longShortRatio } = useLongShortRatio({
    symbol: symbol.replace('/', ''),
    period: '1h',
  });

  // 청산 데이터 가져오기 (Binance WebSocket)
  const { data: liquidationData } = useLiquidations({
    symbol,
    refreshInterval: 3000, // 3초마다 갱신
  });

  // 고래 거래 데이터 가져오기 (Binance WebSocket)
  const { data: whaleData } = useWhales({
    symbol,
    refreshInterval: 5000, // 5초마다 갱신
  });

  // MTF WebSocket에서 추가 다이버전스 가져오기 (REST API에서 누락된 것들)
  const { data: mtfData, getRawDivergences } = useMTFSocket({
    symbol: symbol.replace('/', ''),
    enabled: true,
  });

  // 레짐 상태 가져오기 (HMM 기반)
  const { regime, isSideways, confidence } = useRegime({
    symbol,
    timeframe: selectedTimeframe,
    periodDays: 30,
  });

  // 현재 타임프레임의 actionInfo 가져오기
  const actionInfo = useMemo(() => {
    if (!mtfData?.timeframes) return null;
    const tf = mtfData.timeframes.find(t => t.timeframe === selectedTimeframe);
    return tf?.actionInfo || null;
  }, [mtfData, selectedTimeframe]);

  // API 응답을 CandlestickData 형식으로 변환 (데이터가 없으면 빈 배열)
  // 모든 useMemo 훅은 early return 전에 호출되어야 함
  const chartData: CandlestickData[] = useMemo(
    () =>
      data?.data?.candles?.map((candle) => ({
        time: (candle[0] / 1000) as CandlestickData['time'], // 밀리초를 초로 변환
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
      })) || [],
    [data],
  );

  // Volume Profile 계산 (가격대별 거래량 집계)
  const volumeProfile = useMemo(() => {
    // 심볼 전환 중이면 null 반환 (이전 심볼 가격 데이터 잔재 방지)
    if (isSymbolTransitioning) return null;
    if (!data?.data?.candles || data.data.candles.length === 0) return null;

    // 심볼 검증: 데이터가 현재 요청한 심볼과 일치하는지 확인
    const fetchedSymbol = (data as any)?._fetchedSymbol;
    if (fetchedSymbol && fetchedSymbol !== symbol) {
      return null;
    }

    const candles = data.data.candles;
    // [timestamp, open, high, low, close, volume]
    const prices = candles.map(c => ({ high: c[2], low: c[3], close: c[4], volume: c[5] || 0 }));

    // 가격 범위 계산
    const allHighs = prices.map(p => p.high);
    const allLows = prices.map(p => p.low);
    const maxPrice = Math.max(...allHighs);
    const minPrice = Math.min(...allLows);
    const priceRange = maxPrice - minPrice;

    // 가격을 20개 구간으로 나눔
    const bucketCount = 20;
    const bucketSize = priceRange / bucketCount;

    // 각 구간별 볼륨 집계
    const buckets: Array<{ price: number; volume: number; buyVolume: number; sellVolume: number }> = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketLow = minPrice + (i * bucketSize);
      const bucketHigh = bucketLow + bucketSize;
      const bucketMid = (bucketLow + bucketHigh) / 2;

      let totalVolume = 0;
      let buyVolume = 0;
      let sellVolume = 0;

      prices.forEach(p => {
        // 캔들이 이 가격 구간을 통과하면 볼륨 배분
        if (p.high >= bucketLow && p.low <= bucketHigh) {
          // 캔들이 구간에 걸친 비율만큼 볼륨 배분
          const overlap = Math.min(p.high, bucketHigh) - Math.max(p.low, bucketLow);
          const candleRange = p.high - p.low || 1;
          const volumeShare = p.volume * (overlap / candleRange);

          totalVolume += volumeShare;

          // 상승 캔들이면 매수, 하락 캔들이면 매도
          if (p.close >= p.high - (p.high - p.low) / 2) {
            buyVolume += volumeShare;
          } else {
            sellVolume += volumeShare;
          }
        }
      });

      buckets.push({ price: bucketMid, volume: totalVolume, buyVolume, sellVolume });
    }

    // 최대 볼륨 (정규화용)
    const maxVolume = Math.max(...buckets.map(b => b.volume));

    // POC (Point of Control) - 최대 거래량 가격
    const poc = buckets.reduce((max, b) => b.volume > max.volume ? b : max, buckets[0]);

    // VAH/VAL (Value Area High/Low) - 전체 거래량의 70% 포함 구간
    const totalVolume = buckets.reduce((sum, b) => sum + b.volume, 0);
    const targetVolume = totalVolume * 0.7;

    // POC 중심으로 확장하며 70% 찾기
    const pocIndex = buckets.indexOf(poc);
    let vaLowIndex = pocIndex;
    let vaHighIndex = pocIndex;
    let vaVolume = poc.volume;

    while (vaVolume < targetVolume && (vaLowIndex > 0 || vaHighIndex < buckets.length - 1)) {
      const lowVol = vaLowIndex > 0 ? buckets[vaLowIndex - 1].volume : 0;
      const highVol = vaHighIndex < buckets.length - 1 ? buckets[vaHighIndex + 1].volume : 0;

      if (lowVol >= highVol && vaLowIndex > 0) {
        vaLowIndex--;
        vaVolume += buckets[vaLowIndex].volume;
      } else if (vaHighIndex < buckets.length - 1) {
        vaHighIndex++;
        vaVolume += buckets[vaHighIndex].volume;
      } else if (vaLowIndex > 0) {
        vaLowIndex--;
        vaVolume += buckets[vaLowIndex].volume;
      }
    }

    return {
      buckets,
      maxVolume,
      poc: poc.price,
      vah: buckets[vaHighIndex].price + bucketSize / 2, // Value Area High
      val: buckets[vaLowIndex].price - bucketSize / 2, // Value Area Low
      minPrice,
      maxPrice,
    };
  }, [data, symbol, isSymbolTransitioning]);

  // RSI 데이터 변환 (null 값 제외)
  const rsiData: LineData[] = useMemo(
    () =>
      data?.data?.indicators?.rsi
        ?.map((rsi, index) => {
          if (rsi === null || !data?.data?.candles?.[index]) return null;
          return {
            time: (data.data.candles[index][0] / 1000) as LineData['time'],
            value: rsi,
          };
        })
        .filter((item): item is LineData => item !== null) || [],
    [data],
  );

  // OBV 데이터 변환 (null 값 제외)
  const obvData: LineData[] = useMemo(
    () =>
      data?.data?.indicators?.obv
        ?.map((obv, index) => {
          if (obv === null || !data?.data?.candles?.[index]) return null;
          return {
            time: (data.data.candles[index][0] / 1000) as LineData['time'],
            value: obv,
          };
        })
        .filter((item): item is LineData => item !== null) || [],
    [data],
  );

  // CVD 데이터 변환
  const cvdData: LineData[] = useMemo(
    () =>
      data?.data?.indicators?.cvd
        ?.map((cvd, index) => {
          if (
            cvd === null ||
            cvd === undefined ||
            !data?.data?.candles?.[index]
          )
            return null;
          return {
            time: (data.data.candles[index][0] / 1000) as LineData['time'],
            value: cvd,
          };
        })
        .filter((item): item is LineData => item !== null) || [],
    [data],
  );

  // OI 데이터 변환
  const oiData: LineData[] = useMemo(
    () =>
      data?.data?.indicators?.oi
        ?.map((oi, index) => {
          if (oi === null || oi === undefined || !data?.data?.candles?.[index])
            return null;
          return {
            time: (data.data.candles[index][0] / 1000) as LineData['time'],
            value: oi,
          };
        })
        .filter((item): item is LineData => item !== null) || [],
    [data],
  );

  // EMA 데이터
  const emaData: EmaData | undefined = data?.data?.indicators?.ema;

  // 추세 분석
  const trendAnalysis: TrendAnalysis | undefined = data?.data?.trendAnalysis;

  // 크로스오버 이벤트 (백엔드에서 볼륨 필터링 처리)
  const crossoverEvents: CrossoverEvent[] = data?.data?.crossoverEvents || [];

  // 다이버전스 시그널 (WebSocket 전용 - MTF 분석과 동일 데이터)
  // 레짐 필터 적용: 레짐과 같은 방향의 다이버전스만 유효 (추세 추종)
  const divergenceSignals: DivergenceSignal[] = useMemo(() => {
    const wsSignals = getRawDivergences(selectedTimeframe);

    // 레짐 기반 필터링 로직:
    // - Sideways: 모든 다이버전스 유효 (역추세 전략 가능)
    // - Bullish: 상승 다이버전스만 유효 (추세 추종 롱)
    // - Bearish: 하락 다이버전스만 유효 (추세 추종 숏)
    const shouldFilterByRegime = (direction: string): boolean => {
      if (!regime || isSideways) return false; // Sideways면 필터 안함
      if (regime === 'Bullish' && direction === 'bullish') return false; // 상승장 + 상승 다이버전스 OK
      if (regime === 'Bearish' && direction === 'bearish') return false; // 하락장 + 하락 다이버전스 OK
      return true; // 역추세 신호는 필터링
    };

    return wsSignals.map((s: {
      type: string;
      direction: string;
      phase: string;
      timestamp?: number;
      index?: number;
      priceValue?: number;
      indicatorValue?: number;
      isFiltered?: boolean;
      confirmed?: boolean;
      reason?: string;
    }) => {
      const regimeFiltered = shouldFilterByRegime(s.direction);
      return {
        index: s.index ?? 0,
        type: s.type as 'rsi' | 'obv' | 'cvd' | 'oi',
        direction: s.direction as 'bullish' | 'bearish',
        phase: s.phase as 'start' | 'end' | 'entry',
        timestamp: s.timestamp ?? Date.now(),
        datetime: new Date(s.timestamp ?? Date.now()).toISOString(),
        priceValue: s.priceValue,
        indicatorValue: s.indicatorValue,
        // 레짐 필터 적용 (역추세 신호만 필터링)
        isFiltered: regimeFiltered || s.isFiltered,
        confirmed: s.confirmed,
        // 필터 사유
        reason: regimeFiltered ? `역추세 (${regime} 레짐)` : s.reason,
      };
    });
  }, [getRawDivergences, selectedTimeframe, regime, isSideways]);

  // 다이버전스 요약 정보
  const summary = data?.data?.summary || {
    total: { total: 0, valid: 0, filtered: 0 },
  };

  // CVD + OI 신호
  const marketSignals = data?.data?.cvdOi?.signals || [];

  // 심볼 검증 헬퍼 (가격 기반 데이터의 잔재 방지)
  const isValidSymbolData = useMemo(() => {
    // 심볼 전환 중이면 모든 가격 기반 데이터 무효화
    if (isSymbolTransitioning) return false;

    const fetchedSymbol = (data as any)?._fetchedSymbol;
    return !fetchedSymbol || fetchedSymbol === symbol;
  }, [data, symbol, isSymbolTransitioning]);

  // 횡보 구간 데이터 (심볼 검증 포함)
  const consolidationData: ConsolidationData | null = isValidSymbolData ? (data?.data?.consolidation || null) : null;

  // VWAP + ATR 데이터 (심볼 검증 포함)
  const vwapAtrData: VwapAtrData | null = isValidSymbolData ? (data?.data?.vwapAtr || null) : null;

  // 오더블록 데이터 (심볼 검증 포함)
  const orderBlockData: OrderBlockData | null = isValidSymbolData ? (data?.data?.orderBlocks || null) : null;

  // 오더북 데이터 (매수/매도벽)
  const orderBookData: OrderBookData | null = data?.data?.orderBook || null;

  // 시장 구조 (BOS/CHoCH)
  const marketStructureData: MarketStructureData | null = data?.data?.marketStructure || null;

  // ADX (추세 강도)
  const adxData: AdxData | null = data?.data?.adx || null;

  // 다이버전스 방향별 개수 계산 (start 신호만 카운트)
  const bullishCount = divergenceSignals.filter(
    (signal) => signal.phase === 'start' && signal.direction === 'bullish',
  ).length;
  const bearishCount = divergenceSignals.filter(
    (signal) => signal.phase === 'start' && signal.direction === 'bearish',
  ).length;

  // 스켈레톤 로딩 UI
  const ChartSkeleton = () => (
    <div className='backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl rounded-xl p-2 h-full'>
      {/* 차트 스켈레톤 */}
      <div className='bg-white/5 rounded-xl overflow-hidden relative h-full'>
        <div className='absolute inset-0 flex items-end justify-around px-4 pb-8'>
          {[45, 62, 38, 71, 55, 33, 68, 42].map((h, i) => (
            <div
              key={i}
              className='bg-white/10 rounded-sm animate-pulse w-1'
              style={{
                height: `${h}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='text-center'>
            <div className='animate-spin rounded-full border-b-2 border-blue-400 mx-auto h-5 w-5 mb-1' />
          </div>
        </div>
      </div>
    </div>
  );

  // 에러 상태 처리
  if (error) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-xl p-2 shadow-2xl h-full'>
        <div className='h-full flex items-center justify-center'>
          <div className='text-center'>
            <p className='text-red-400 text-xs mb-2'>로딩 실패</p>
            <button
              onClick={() => refetch()}
              className='px-2 py-1 bg-red-500/30 text-white text-xs rounded hover:bg-red-500/40 transition-all'
            >
              재시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 로딩 상태 - 스켈레톤 표시
  if (isLoading) {
    return <ChartSkeleton />;
  }

  // 데이터 없음 상태 처리
  if (!data?.success || !data?.data?.candles) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-2 h-full'>
        <div className='h-full flex items-center justify-center'>
          <p className='text-gray-500 text-xs'>데이터 없음</p>
        </div>
      </div>
    );
  }

  // 차트 표시
  return (
    <div className='relative bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden h-full'>
      {/* 타임프레임 라벨 + 레짐 뱃지 */}
      <div className='absolute top-2 left-2 z-10 flex items-center gap-1.5'>
        <span className='px-2 py-0.5 bg-black/50 rounded text-xs font-bold text-white'>
          {TIMEFRAMES.find(tf => tf.value === selectedTimeframe)?.label || selectedTimeframe}
        </span>
        {regime && (
          <span
            className='px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1'
            style={{
              backgroundColor: isSideways
                ? 'rgba(59, 130, 246, 0.3)'
                : regime === 'Bullish'
                ? 'rgba(34, 197, 94, 0.2)'
                : 'rgba(239, 68, 68, 0.2)',
              color: isSideways
                ? '#60a5fa'
                : regime === 'Bullish'
                ? '#4ade80'
                : '#f87171',
            }}
            title={`레짐: ${regime} (신뢰도 ${confidence}%)`}
          >
            {regime === 'Bullish' ? '📈' : regime === 'Bearish' ? '📉' : '📊'}
            {regime}
            {isSideways && <span className='text-blue-300 ml-0.5'>✓</span>}
          </span>
        )}
      </div>
      <ChartRenderer
        data={chartData}
        rsiData={rsiData}
        obvData={obvData}
        cvdData={cvdData}
        oiData={oiData}
        emaData={emaData}
        divergenceSignals={divergenceSignals}
        trendAnalysis={trendAnalysis}
        crossoverEvents={crossoverEvents}
        marketSignals={marketSignals}
        timeframe={selectedTimeframe}
        realtimeCandle={realtimeCandle}
        longShortRatio={longShortRatio}
        volumeProfile={volumeProfile}
        consolidationData={consolidationData}
        vwapAtrData={vwapAtrData}
        orderBlockData={orderBlockData}
        orderBookData={orderBookData}
        liquidationData={liquidationData}
        whaleData={whaleData}
        marketStructureData={marketStructureData}
        adxData={adxData}
        actionInfo={actionInfo}
      />
    </div>
  );
}
