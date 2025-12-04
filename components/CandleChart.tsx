'use client';

import { useCandles } from '@/hooks/useCandles';
import PriceChart from '@/components/PriceChart';
import { CandlestickData, LineData } from 'lightweight-charts';

interface CandleChartProps {
  symbol?: string;
  timeframe?: string;
  limit?: number;
}

export default function CandleChart({
  symbol = 'BTC/USDT',
  timeframe = '5m',
  limit = 500,
}: CandleChartProps) {
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

  return (
    <div className='border border-(--border) rounded-lg bg-(--card) p-6'>
      <div className='flex items-center justify-between mb-4'>
        <div>
          <h2 className='text-xl font-bold'>{symbol}</h2>
          <p className='text-sm text-gray-400'>
            {timeframe} · {chartData.length}개 캔들 · RSI 포함
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className='px-4 py-2 bg-(--secondary) text-gray-300 rounded-lg hover:bg-(--primary) hover:text-white transition-colors text-sm'
        >
          🔄 새로고침
        </button>
      </div>
      <PriceChart data={chartData} rsiData={rsiData} />
    </div>
  );
}
