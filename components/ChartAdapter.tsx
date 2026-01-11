'use client';

import { useState, useMemo } from 'react';
import { useCandles } from '@/hooks/useCandles';
import { useLongShortRatio } from '@/hooks/useLongShortRatio';
import { useLiquidations } from '@/hooks/useLiquidations';
import { useWhales } from '@/hooks/useWhales';
import { useFundingRate } from '@/hooks/useFundingRate';
import { useCoinglass } from '@/hooks/useCoinglass';
import ChartRenderer from '@/components/chart/ChartRenderer';
import RefreshCountdown from '@/components/chart/RefreshCountdown';
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
import { Bitcoin } from 'lucide-react';

interface ChartAdapterProps {
  symbol?: string;
  initialTimeframe?: string;
  limit?: number;
}

const TIMEFRAMES = [
  { value: '5m', label: '5분' },
  { value: '15m', label: '15분' },
  { value: '30m', label: '30분' },
  { value: '1h', label: '1시간' },
  { value: '4h', label: '4시간' },
  { value: '1d', label: '1일' },
];

export default function ChartAdapter({
  symbol = 'BTC/USDT',
  initialTimeframe = '5m',
  limit = 1000,
}: ChartAdapterProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState(initialTimeframe);

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

  // 펀딩레이트 가져오기 (Binance API)
  const { data: fundingRateData, timeUntilFunding } = useFundingRate({
    symbol,
    refreshInterval: 30000, // 30초마다 갱신
  });

  // Coinglass 트레이딩 신호 가져오기
  const { data: coinglassData } = useCoinglass({
    symbol: symbol.replace('/USDT', '').replace('/', ''),
    refreshInterval: 60000, // 1분마다 갱신
  });

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
    if (!data?.data?.candles || data.data.candles.length === 0) return null;

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
  }, [data]);

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

  // 다이버전스 시그널
  const divergenceSignals: DivergenceSignal[] =
    data?.data?.signals?.divergence || [];

  // 다이버전스 요약 정보
  const summary = data?.data?.summary || {
    total: { total: 0, valid: 0, filtered: 0 },
  };

  // CVD + OI 신호
  const marketSignals = data?.data?.cvdOi?.signals || [];

  // 횡보 구간 데이터
  const consolidationData: ConsolidationData | null = data?.data?.consolidation || null;

  // VWAP + ATR 데이터
  const vwapAtrData: VwapAtrData | null = data?.data?.vwapAtr || null;

  // 오더블록 데이터
  const orderBlockData: OrderBlockData | null = data?.data?.orderBlocks || null;

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
    <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl'>
      {/* 헤더 스켈레톤 */}
      <div className='flex items-center gap-3 mb-4'>
        <div className='w-10 h-10 rounded-full bg-white/10 animate-pulse' />
        <div className='space-y-2'>
          <div className='w-24 h-4 bg-white/10 rounded animate-pulse' />
          <div className='w-16 h-3 bg-white/10 rounded animate-pulse' />
        </div>
        <div className='ml-auto flex gap-2'>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className='w-10 h-6 bg-white/10 rounded animate-pulse'
            />
          ))}
        </div>
      </div>
      {/* 차트 스켈레톤 */}
      <div className='h-[700px] bg-white/5 rounded-xl overflow-hidden relative'>
        <div className='absolute inset-0 flex items-end justify-around px-4 pb-8'>
          {/* 고정된 높이 패턴 (hydration 에러 방지) */}
          {[45, 62, 38, 71, 55, 33, 68, 42, 58, 75, 48, 35, 65, 52, 40, 72, 56, 30, 63, 47].map((h, i) => (
            <div
              key={i}
              className='w-2 bg-white/10 rounded-sm animate-pulse'
              style={{
                height: `${h}%`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
        <div className='absolute inset-0 flex items-center justify-center'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto mb-3' />
            <p className='text-gray-400 text-sm'>차트 로딩 중...</p>
          </div>
        </div>
      </div>
    </div>
  );

  // 에러 상태 처리 (훅 호출 이후에 배치)
  if (error) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-2xl p-6 shadow-2xl'>
        <div className='h-[700px] flex items-center justify-center'>
          <div className='text-center'>
            <p className='text-red-400 mb-4'>데이터 로딩 실패</p>
            <button
              onClick={() => refetch()}
              className='px-4 py-2 bg-red-500/30 backdrop-blur-md text-white rounded-lg hover:bg-red-500/40 transition-all duration-200 border border-red-400/50'
            >
              다시 시도
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

  // 데이터 없음 상태 처리 (훅 호출 이후에 배치)
  if (!data?.success || !data?.data?.candles) {
    return (
      <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl'>
        <div className='h-[700px] flex items-center justify-center'>
          <p className='text-gray-300'>데이터가 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className='relative backdrop-blur-sm bg-white/[0.1] border border-white/10 rounded-2xl p-6 shadow-2xl'>
      <div className='flex flex-col md:flex-row md:items-center md:justify-between mb-4'>
        {/* 헤더: 한 줄로 표시, 반응형으로 줄바꿈 */}
        <div className='flex flex-wrap items-center gap-3'>
          {/* 코인 아이콘 + 심볼 */}
          <div className='flex items-center gap-3'>
            <div className='relative flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 shadow-lg shadow-orange-500/30'>
              <Bitcoin className='w-6 h-6 text-white' strokeWidth={2.5} />
            </div>
            <div>
              <h2 className='text-xl font-bold bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent'>
                {symbol}
              </h2>
            </div>
          </div>

          {/* 시장 구조 (추세) 표시 */}
          {marketStructureData && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
              marketStructureData.currentTrend === 'bullish'
                ? 'bg-green-500/20 text-green-400'
                : marketStructureData.currentTrend === 'bearish'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              <span className='font-semibold'>
                {marketStructureData.currentTrend === 'bullish' ? '상승' :
                 marketStructureData.currentTrend === 'bearish' ? '하락' : '횡보'}
              </span>
              {marketStructureData.lastCHoCH && (
                <span className='text-[10px] opacity-70'>CHoCH</span>
              )}
            </div>
          )}

          {/* 펀딩레이트 표시 */}
          {fundingRateData && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              fundingRateData.signal === 'LONG'
                ? 'bg-green-500/10 border-green-500/30'
                : fundingRateData.signal === 'SHORT'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-white/5 border-white/10'
            }`}>
              <div className='text-xs'>
                <span className='text-gray-400'>Funding</span>
                <span className={`ml-1.5 font-mono font-bold ${
                  fundingRateData.fundingRate > 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {fundingRateData.fundingRate > 0 ? '+' : ''}{fundingRateData.fundingRate.toFixed(4)}%
                </span>
              </div>
              <div className='w-px h-4 bg-white/20' />
              <div className='text-xs'>
                <span className='text-gray-400'>Next</span>
                <span className='ml-1.5 font-mono text-white'>{timeUntilFunding}</span>
              </div>
              {fundingRateData.signal !== 'NEUTRAL' && (
                <>
                  <div className='w-px h-4 bg-white/20' />
                  <span className={`text-xs font-semibold ${
                    fundingRateData.signal === 'LONG' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {fundingRateData.signal === 'LONG' ? '롱 기회' : '숏 기회'}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Coinglass 트레이딩 신호 */}
          {coinglassData && (
            <div className='flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white/5 border-white/10'>
              {/* 공포탐욕 지수 */}
              {coinglassData.fearGreed && (
                <div className='flex items-center gap-1.5'>
                  <span className='text-[10px] text-gray-400'>F&G</span>
                  <span className={`text-xs font-bold ${
                    coinglassData.fearGreed.value <= 25 ? 'text-red-400' :
                    coinglassData.fearGreed.value <= 45 ? 'text-orange-400' :
                    coinglassData.fearGreed.value <= 55 ? 'text-yellow-400' :
                    coinglassData.fearGreed.value <= 75 ? 'text-lime-400' :
                    'text-green-400'
                  }`}>
                    {coinglassData.fearGreed.value}
                  </span>
                </div>
              )}

              <div className='w-px h-4 bg-white/20' />

              {/* 청산 편향 */}
              <div className='flex items-center gap-1.5'>
                <span className='text-[10px] text-gray-400'>청산</span>
                <span className={`text-xs font-semibold ${
                  coinglassData.liquidationBias === 'long_heavy' ? 'text-red-400' :
                  coinglassData.liquidationBias === 'short_heavy' ? 'text-green-400' :
                  'text-gray-400'
                }`}>
                  {coinglassData.liquidationBias === 'long_heavy' ? '롱↓' :
                   coinglassData.liquidationBias === 'short_heavy' ? '숏↑' : '-'}
                </span>
              </div>

              <div className='w-px h-4 bg-white/20' />

              {/* ETF 트렌드 */}
              <div className='flex items-center gap-1.5'>
                <span className='text-[10px] text-gray-400'>ETF</span>
                <span className={`text-xs font-semibold ${
                  coinglassData.etfTrend === 'inflow' ? 'text-green-400' :
                  coinglassData.etfTrend === 'outflow' ? 'text-red-400' :
                  'text-gray-400'
                }`}>
                  {coinglassData.etfTrend === 'inflow' ? '유입' :
                   coinglassData.etfTrend === 'outflow' ? '유출' : '-'}
                </span>
              </div>

              {/* 불마켓 피크 리스크 (10% 이상일 때만 표시) */}
              {coinglassData.bullMarketRisk >= 10 && (
                <>
                  <div className='w-px h-4 bg-white/20' />
                  <div className='flex items-center gap-1.5'>
                    <span className='text-[10px] text-gray-400'>피크</span>
                    <span className='text-xs font-bold text-amber-400'>
                      {coinglassData.bullMarketRisk}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
        <div className='flex items-center gap-2 shrink-0'>
          {/* 타임프레임 버튼 */}
          <div className='flex items-center gap-1 flex-nowrap'>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setSelectedTimeframe(tf.value)}
                className={`w-14 py-1 rounded-lg text-xs text-center transition-all duration-200 shrink-0 ${
                  selectedTimeframe === tf.value
                    ? 'bg-orange-500/30 backdrop-blur-md text-white border border-orange-400/50 shadow-lg shadow-orange-500/20'
                    : 'bg-white/5 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {/* 새로고침 카운트다운 */}
          <RefreshCountdown
            timeframe={selectedTimeframe}
            lastCandleTime={
              chartData.length > 0
                ? (chartData[chartData.length - 1].time as number)
                : 0
            }
            onRefresh={refetch}
            onManualRefresh={refetch}
          />
        </div>
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
      />
    </div>
  );
}
