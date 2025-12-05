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
import ChartTooltip from './ChartTooltip';

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
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    rsi: number | null;
    filterReason: string | null;
  } | null>(null);
  const userInteractedRef = useRef(false); // 사용자가 차트를 조작했는지 추적

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
      localization: {
        timeFormatter: (time: number) => {
          // UTC timestamp를 서울 시간(UTC+9)으로 변환
          const date = new Date(time * 1000);
          const seoulDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);

          const year = seoulDate.getUTCFullYear();
          const month = String(seoulDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(seoulDate.getUTCDate()).padStart(2, '0');
          const hours = String(seoulDate.getUTCHours()).padStart(2, '0');
          const minutes = String(seoulDate.getUTCMinutes()).padStart(2, '0');

          return `${year}-${month}-${day} ${hours}:${minutes}`;
        },
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

    // 사용자가 차트를 조작하지 않은 경우에만 자동 맞춤
    if (!userInteractedRef.current) {
      chart.timeScale().fitContent();
    }

    // 사용자 차트 조작 감지 (스크롤, 줌 등)
    const timeScale = chart.timeScale();
    const handleVisibleTimeRangeChange = () => {
      userInteractedRef.current = true;
    };
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    // 통합 툴팁 (RSI 값 + 필터링 사유)
    if (rsiSeries) {
      chart.subscribeCrosshairMove((param) => {
        if (
          !param.time ||
          !param.point ||
          param.point.x < 0 ||
          param.point.y < 0
        ) {
          setTooltip(null);
          return;
        }

        const currentTime = param.time as number;
        let rsiValue: number | null = null;
        let filterReason: string | null = null;

        // RSI 값 가져오기
        if (param.seriesData.has(rsiSeries)) {
          const rsi = param.seriesData.get(rsiSeries);
          if (rsi && 'value' in rsi) {
            rsiValue = rsi.value;
          }
        }

        // 필터링된 다이버전스 신호 확인
        if (divergenceSignals && divergenceSignals.length > 0) {
          for (let i = 0; i < divergenceSignals.length; i++) {
            const signal = divergenceSignals[i];
            if (signal.phase === 'start') {
              const endSignal = divergenceSignals.find(
                (s, idx) =>
                  idx > i &&
                  s.phase === 'end' &&
                  s.type === signal.type &&
                  s.direction === signal.direction,
              );

              if (endSignal) {
                const startTime = signal.timestamp / 1000;
                const endTime = endSignal.timestamp / 1000;

                if (
                  currentTime >= startTime &&
                  currentTime <= endTime &&
                  (signal.isFiltered || endSignal.isFiltered)
                ) {
                  filterReason = signal.reason || endSignal.reason || null;
                  break;
                }
              }
            }
          }
        }

        // RSI 값이나 필터링 사유가 있으면 툴팁 표시
        if (rsiValue !== null || filterReason !== null) {
          setTooltip({
            x: param.point.x,
            y: param.point.y,
            rsi: rsiValue,
            filterReason,
          });
        } else {
          setTooltip(null);
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

      {/* 통합 툴팁 (RSI + 필터링 정보) */}
      {tooltip && (
        <ChartTooltip
          x={tooltip.x}
          y={tooltip.y}
          rsi={tooltip.rsi}
          filterReason={tooltip.filterReason}
        />
      )}
    </div>
  );
}
