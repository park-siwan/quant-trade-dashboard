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

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-[705px] backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400 mx-auto mb-4'></div>
          <p className='text-gray-300'>데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

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

  if (!data?.success || !data?.data?.candles) {
    return (
      <div className='flex items-center justify-center h-[705px] backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl'>
        <p className='text-gray-300'>데이터가 없습니다</p>
      </div>
    );
  }

  // API 응답을 CandlestickData 형식으로 변환
  const chartData: CandlestickData[] = data.data.candles.map((candle) => ({
    time: (candle[0] / 1000) as CandlestickData['time'], // 밀리초를 초로 변환
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
  }));

  // RSI 데이터 변환 (null 값 제외)
  const rsiData: LineData[] = data.data.indicators.rsi
    .map((rsi, index) => {
      if (rsi === null) return null;
      return {
        time: (data.data.candles[index][0] / 1000) as LineData['time'],
        value: rsi,
      };
    })
    .filter((item): item is LineData => item !== null);

  // EMA 데이터
  const emaData: EmaData | undefined = data.data.indicators.ema;

  // 추세 분석
  const trendAnalysis: TrendAnalysis | undefined = data.data.trendAnalysis;

  // 크로스오버 이벤트
  const crossoverEvents: CrossoverEvent[] = data.data.crossoverEvents || [];

  // 다이버전스 시그널
  const divergenceSignals: DivergenceSignal[] =
    data.data.signals.divergence || [];

  // 다이버전스 요약 정보
  const summary = data.data.summary;

  // 디버깅: 콘솔에 데이터 출력
  console.log('📊 다이버전스 시그널:', divergenceSignals);
  console.log('📊 요약:', summary);
  console.log('📊 EMA 데이터:', emaData);
  console.log('📊 추세 분석:', trendAnalysis);
  console.log('📊 크로스오버 이벤트:', crossoverEvents);

  return (
    <div className='backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-6 shadow-2xl'>
      <div className='flex items-center justify-between mb-4'>
        <div className='flex flex-1 items-center justify-start gap-4'>
          <div className='flex items-center gap-3'>
            <div className='relative flex items-center justify-center w-10 h-10 rounded-full bg-orange-500 shadow-lg shadow-orange-500/30'>
              <Bitcoin className='w-6 h-6 text-white' strokeWidth={2.5} />
            </div>
            <h2 className='text-xl font-bold bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 bg-clip-text text-transparent'>
              {symbol}
            </h2>
          </div>
          <p className='text-sm text-gray-300 whitespace-nowrap'>
            {chartData.length}개 캔들 · RSI 포함
            {summary.total.total > 0 && (
              <>
                {' · '}
                <span className='text-purple-400 font-medium'>
                  {summary.total.total}개 다이버전스
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
              </>
            )}
          </p>
        </div>

        {/* 타임프레임 선택 버튼 */}
        <div className='flex items-center gap-2 flex-1 justify-center'>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setSelectedTimeframe(tf.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
                selectedTimeframe === tf.value
                  ? 'bg-orange-500/30 backdrop-blur-md text-white border border-orange-400/50 shadow-lg shadow-orange-500/20'
                  : 'bg-white/5 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-white/10 border border-white/5'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className='flex items-center gap-2 flex-1 justify-end'>
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
        emaData={emaData}
        divergenceSignals={divergenceSignals}
        trendAnalysis={trendAnalysis}
        crossoverEvents={crossoverEvents}
      />
    </div>
  );
}
