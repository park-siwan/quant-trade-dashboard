'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
  LineSeries,
  LineData,
} from 'lightweight-charts';

interface PriceChartProps {
  data: CandlestickData[];
  rsiData?: LineData[];
}

export default function PriceChart({ data, rsiData }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 차트 생성 (RSI 패널 포함 시 높이 조정)
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: rsiData ? 600 : 500,
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

    // 캔들스틱 시리즈 추가 (메인 패널 - paneIndex: 0)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    }, 0);

    candlestickSeries.setData(data);

    // RSI 시리즈 추가 (별도 패널 - paneIndex: 1)
    if (rsiData && rsiData.length > 0) {
      const rsiSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        priceScaleId: 'rsi',
      }, 1);

      rsiSeries.setData(rsiData);

      // RSI 기준선 추가 (70, 30)
      rsiSeries.createPriceLine({
        price: 70,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: 'Overbought',
      });

      rsiSeries.createPriceLine({
        price: 30,
        color: '#22c55e',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: 'Oversold',
      });

      // RSI 패널 스케일 설정
      rsiSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        borderVisible: false,
      });
    }

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
  }, [data, rsiData]);

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
