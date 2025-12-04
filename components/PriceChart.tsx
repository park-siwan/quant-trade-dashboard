'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
} from 'lightweight-charts';

interface PriceChartProps {
  data: CandlestickData[];
}

export default function PriceChart({ data }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 차트 생성
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // 캔들스틱 시리즈 추가
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // 데이터 설정
    series.setData(data);

    // 차트 자동 맞춤
    chart.timeScale().fitContent();

    // 반응형 처리
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // 클린업
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return (
    <div className='w-full'>
      {/* <div className='mb-4'>
        <h2 className='text-xl font-bold text-white'>BTC/USDT 가격 차트</h2>
        <p className='text-sm text-gray-400'>5분봉 캔들스틱</p>
      </div> */}
      <div ref={chartContainerRef} className='rounded-lg overflow-hidden' />
    </div>
  );
}
