'use client';

import { useState, useMemo } from 'react';
import { useCandles } from '@/hooks/useCandles';
import ChartRenderer from '@/components/chart/ChartRenderer';
import RefreshCountdown from '@/components/chart/RefreshCountdown';
import { CandlestickData, LineData } from 'lightweight-charts';
import {
  DivergenceSignal,
  EmaData,
  TrendAnalysis,
  CrossoverEvent,
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

// 타임프레임을 분 단위로 변환
function timeframeToMinutes(timeframe: string): number {
  const value = parseInt(timeframe.slice(0, -1));
  const unit = timeframe.slice(-1);

  switch (unit) {
    case 'm':
      return value;
    case 'h':
      return value * 60;
    case 'd':
      return value * 60 * 24;
    default:
      return 0;
  }
}

// 캔들 개수와 타임프레임으로 시간 범위 계산
function calculateTimeRange(candleCount: number, timeframe: string): string {
  const totalMinutes = candleCount * timeframeToMinutes(timeframe);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

  if (days > 0) {
    if (hours > 0) {
      return `${days}일 ${hours}시간`;
    }
    return `${days}일`;
  } else if (hours > 0) {
    const minutes = totalMinutes % 60;
    if (minutes > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${hours}시간`;
  } else {
    return `${totalMinutes}분`;
  }
}

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

  // 크로스오버 이벤트
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
    <div className='relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl'>
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
              <p className='text-xs text-gray-400'>
                {calculateTimeRange(chartData.length, selectedTimeframe)}
              </p>
            </div>
          </div>

          {/* 타임프레임 버튼 */}
          <div className='flex items-center gap-1.5 flex-wrap'>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setSelectedTimeframe(tf.value)}
                className={`px-2.5 py-1 rounded-lg text-xs transition-all duration-200 ${
                  selectedTimeframe === tf.value
                    ? 'bg-orange-500/30 backdrop-blur-md text-white border border-orange-400/50 shadow-lg shadow-orange-500/20'
                    : 'bg-white/5 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* 가격 정보 표시 */}
          <div id='price-info-container'></div>
        </div>
        <div className='flex items-center gap-4'>
          <>
            {/* 다이버전스 정보 */}
            {summary.total.total > 0 && (
              <p className='text-xs text-gray-300'>
                <span className='text-yellow-400 font-medium'>
                  다이버전스 {summary.total.total}개
                </span>
                {' ('}
                {bullishCount > 0 && (
                  <span className='text-lime-400 font-medium'>
                    상승 {bullishCount}
                  </span>
                )}
                {bullishCount > 0 && bearishCount > 0 && ', '}
                {bearishCount > 0 && (
                  <span className='text-orange-400 font-medium'>
                    하락 {bearishCount}
                  </span>
                )}
                {summary.total.filtered > 0 && (
                  <>
                    {', '}
                    <span className='text-gray-400'>
                      필터링 {summary.total.filtered}
                    </span>
                  </>
                )}
                {')'}
              </p>
            )}
          </>
          {/* 새로고침 카운트다운 */}
          <div className='flex items-center'>
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
      />
    </div>
  );
}
