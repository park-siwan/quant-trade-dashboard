'use client';

import { useCandles } from '@/hooks/useCandles';
import ChartRenderer from '@/components/chart/ChartRenderer';
import RefreshCountdown from '@/components/chart/RefreshCountdown';
import { CandlestickData, LineData } from 'lightweight-charts';
import { DivergenceSignal } from '@/lib/types/index';

interface ChartAdapterProps {
  symbol?: string;
  timeframe?: string;
  limit?: number;
}

export default function ChartAdapter({
  symbol = 'BTC/USDT',
  timeframe = '5m',
  limit = 500,
}: ChartAdapterProps) {
  const { data, isLoading, error, refetch } = useCandles({
    symbol,
    timeframe,
    limit,
    enableAutoRefresh: true,
  });

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-[500px] border border-(--border) rounded-lg bg-(--card)'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-(--primary) mx-auto mb-4'></div>
          <p className='text-gray-400'>데이터 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center h-[500px] border border-red-500/50 rounded-lg bg-(--card)'>
        <div className='text-center'>
          <p className='text-red-500 mb-4'>데이터 로딩 실패</p>
          <button
            onClick={() => refetch()}
            className='px-4 py-2 bg-(--primary) text-white rounded-lg hover:opacity-80 transition-opacity'
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!data?.success || !data?.data?.candles) {
    return (
      <div className='flex items-center justify-center h-[500px] border border-(--border) rounded-lg bg-(--card)'>
        <p className='text-gray-400'>데이터가 없습니다</p>
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

  // 다이버전스 시그널
  const divergenceSignals: DivergenceSignal[] = data.data.signals.divergence || [];

  // 다이버전스 요약 정보
  const summary = data.data.summary;

  // 디버깅: 콘솔에 다이버전스 데이터 출력
  console.log('📊 다이버전스 시그널:', divergenceSignals);
  console.log('📊 요약:', summary);

  return (
    <div className='border border-(--border) rounded-lg bg-(--card) p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='text-xl font-bold'>{symbol}</h2>
          <p className='text-sm text-gray-400'>
            {timeframe} · {chartData.length}개 캔들 · RSI 포함
            {summary.total.total > 0 && (
              <>
                {' · '}
                <span className='text-purple-400'>
                  {summary.total.total}개 다이버전스
                </span>
                {' ('}
                <span className='text-green-400'>유효 {summary.total.valid}</span>
                {summary.total.filtered > 0 && (
                  <>
                    {', '}
                    <span className='text-gray-500'>필터링 {summary.total.filtered}</span>
                  </>
                )}
                {')'}
              </>
            )}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <RefreshCountdown
            timeframe={timeframe}
            lastCandleTime={
              chartData.length > 0 ? (chartData[chartData.length - 1].time as number) : 0
            }
            onRefresh={refetch}
          />
          <button
            onClick={() => refetch()}
            className='px-4 py-2 bg-(--secondary) text-gray-300 rounded-lg hover:bg-(--primary) hover:text-white transition-colors text-sm'
          >
            분석
          </button>
        </div>
      </div>
      <ChartRenderer
        data={chartData}
        rsiData={rsiData}
        divergenceSignals={divergenceSignals}
      />
    </div>
  );
}
