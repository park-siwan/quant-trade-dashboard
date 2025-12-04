'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  CandlestickData,
  LineData,
} from 'lightweight-charts';
import { addRsiIndicator, addDivergenceLines } from '@/lib/chart/indicators';
import { DivergenceSignal } from '@/lib/types/index';

interface ChartRendererProps {
  data: CandlestickData[];
  rsiData?: LineData[];
  divergenceSignals?: DivergenceSignal[];
}

export default function ChartRenderer({
  data,
  rsiData,
  divergenceSignals,
}: ChartRendererProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [currentRsi, setCurrentRsi] = useState<number | null>(null);

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
    const candlestickSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      },
      0,
    );

    candlestickSeries.setData(data);

    // RSI 지표 추가
    let rsiSeries = null;
    if (rsiData && rsiData.length > 0) {
      rsiSeries = addRsiIndicator(chart, rsiData);
    }

    // 다이버전스 선 추가
    if (divergenceSignals && divergenceSignals.length > 0) {
      // 캔들 데이터에서 시간, 고가, 저가 추출
      const candleData = data.map((candle) => ({
        time: candle.time as number,
        high: candle.high,
        low: candle.low,
      }));

      addDivergenceLines(
        chart,
        candlestickSeries,
        rsiSeries,
        divergenceSignals,
        candleData,
        rsiData || [],
      );
    }

    // 차트 자동 맞춤
    chart.timeScale().fitContent();

    // RSI 값 업데이트
    if (rsiSeries) {
      chart.subscribeCrosshairMove((param) => {
        if (param.time && param.seriesData.has(rsiSeries)) {
          const rsiValue = param.seriesData.get(rsiSeries);
          if (rsiValue && 'value' in rsiValue) {
            setCurrentRsi(rsiValue.value);
          }
        } else {
          setCurrentRsi(null);
        }
      });
    }

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
  }, [data, rsiData, divergenceSignals]);

  return (
    <div className='w-full relative'>
      {/* <div className='mb-4'>
        <h2 className='text-xl font-bold text-white'>BTC/USDT 가격 차트</h2>
        <p className='text-sm text-gray-400'>5분봉 캔들스틱</p>
      </div> */}
      <div ref={chartContainerRef} className='rounded-lg overflow-hidden' />

      {/* RSI 값 표시 (RSI 패널 우측 상단) */}
      {rsiData && currentRsi !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: '70%',
            right: '16px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#a855eb',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            border: '1px solid #a855eb',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          RSI: {currentRsi.toFixed(2)}
        </div>
      )}
    </div>
  );
}
