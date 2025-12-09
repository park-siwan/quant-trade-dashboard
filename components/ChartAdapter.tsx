'use client';

import { useState } from 'react';
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
  limit = 500,
}: ChartAdapterProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState(initialTimeframe);

  const { data, isLoading, error, refetch } = useCandles({
    symbol,
    timeframe: selectedTimeframe,
    limit,
    enableAutoRefresh: true,
  });

  // 에러 상태 처리
  if (error) {
    return (
      <div className='flex items-center justify-center h-[705px] backdrop-blur-xl bg-white/5 border border-red-500/30 rounded-2xl shadow-2xl'>
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
    );
  }

  // 데이터 없음 상태 처리
  if (!isLoading && (!data?.success || !data?.data?.candles)) {
    return (
      <div className='flex items-center justify-center h-[705px] backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl'>
        <p className='text-gray-300'>데이터가 없습니다</p>
      </div>
    );
  }

  // API 응답을 CandlestickData 형식으로 변환 (데이터가 없으면 빈 배열)
  const chartData: CandlestickData[] = data?.data?.candles?.map((candle) => ({
    time: (candle[0] / 1000) as CandlestickData['time'], // 밀리초를 초로 변환
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
  })) || [];

  // RSI 데이터 변환 (null 값 제외)
  const rsiData: LineData[] = data?.data?.indicators?.rsi
    ?.map((rsi, index) => {
      if (rsi === null) return null;
      return {
        time: (data.data.candles[index][0] / 1000) as LineData['time'],
        value: rsi,
      };
    })
    .filter((item): item is LineData => item !== null) || [];

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
  const summary = data?.data?.summary || { total: { total: 0, valid: 0, filtered: 0 } };

  // 디버깅: 콘솔에 데이터 출력
  console.log('📊 다이버전스 시그널:', divergenceSignals);
  console.log('📊 요약:', summary);
  console.log('📊 EMA 데이터:', emaData);
  console.log('📊 추세 분석:', trendAnalysis);
  console.log('📊 크로스오버 이벤트:', crossoverEvents);

  return (
    <div className='relative backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl'>
      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className='absolute inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/50 rounded-2xl'>
          <div className='text-center'>
            <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto mb-4'></div>
            <p className='text-gray-300'>데이터 로딩 중...</p>
          </div>
        </div>
      )}

      <div className='flex flex-col gap-3 mb-4'>
        {/* 상단: 심볼 정보 */}
        <div className='flex items-center justify-between gap-4'>
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

          <div className='flex items-center gap-2'>
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

        {/* 하단: 타임프레임 버튼 + 다이버전스 정보 */}
        <div className='flex flex-wrap items-center gap-2 justify-between'>
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

          {summary.total.total > 0 && (
            <p className='text-xs text-gray-300'>
              <span className='text-yellow-400 font-medium'>
                다이버전스 {summary.total.total}개
              </span>
              {' ('}
              <span className='text-lime-400 font-medium'>
                유효 {summary.total.valid}
              </span>
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
        </div>
      </div>
      <ChartRenderer
        data={chartData}
        rsiData={rsiData}
        emaData={emaData}
        divergenceSignals={divergenceSignals}
        trendAnalysis={trendAnalysis}
        crossoverEvents={crossoverEvents}
      />

      {/* 초보자를 위한 용어 설명 */}
      <div className='mt-4 backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4'>
        <h3 className='text-sm font-bold text-orange-400 mb-3'>📚 차트 용어 설명</h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-3 text-xs'>
          <div>
            <span className='text-lime-400 font-semibold'>GC (골든크로스)</span>
            <span className='text-gray-300'> - 단기 이평선이 장기 이평선을 상향 돌파. 상승 추세 신호</span>
          </div>
          <div>
            <span className='text-orange-400 font-semibold'>DC (데드크로스)</span>
            <span className='text-gray-300'> - 단기 이평선이 장기 이평선을 하향 돌파. 하락 추세 신호</span>
          </div>
          <div>
            <span className='text-yellow-400 font-semibold'>EMA (지수이동평균)</span>
            <span className='text-gray-300'> - 최근 가격에 더 높은 가중치를 둔 이동평균선. 추세 파악용</span>
          </div>
          <div>
            <span className='text-amber-400 font-semibold'>RSI (상대강도지수)</span>
            <span className='text-gray-300'> - 0~100 범위. 70 이상 과매수, 30 이하 과매도</span>
          </div>
          <div>
            <span className='text-purple-400 font-semibold'>다이버전스</span>
            <span className='text-gray-300'> - 가격과 지표의 방향이 반대. 추세 전환 가능성 신호</span>
          </div>
          <div>
            <span className='text-lime-400 font-semibold'>강세 다이버전스</span>
            <span className='text-gray-300'> - 가격 하락, RSI 상승. 상승 반전 가능성</span>
          </div>
          <div>
            <span className='text-orange-400 font-semibold'>약세 다이버전스</span>
            <span className='text-gray-300'> - 가격 상승, RSI 하락. 하락 반전 가능성</span>
          </div>
          <div>
            <span className='text-gray-400 font-semibold'>필터링된 신호</span>
            <span className='text-gray-300'> - 신뢰도가 낮아 회색 점선으로 표시</span>
          </div>
        </div>
      </div>
    </div>
  );
}
