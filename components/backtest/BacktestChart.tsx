'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, CandlestickData, CandlestickSeries, SeriesMarker, Time, createSeriesMarkers } from 'lightweight-charts';
import { BacktestResult, TradeResult } from '@/lib/backtest-api';

interface BacktestChartProps {
  result: BacktestResult;
  candles: CandlestickData[];
  onTradeClick?: (trade: TradeResult) => void;
  selectedTrade?: TradeResult | null;
}

export default function BacktestChart({ result, candles, onTradeClick, selectedTrade }: BacktestChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // 차트 생성
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
      },
    });

    chartRef.current = chart;

    // 캔들 시리즈 (무채색 - 마커 강조용)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#52525b',      // 상승: 진한 회색
      downColor: '#3f3f46',    // 하락: 더 진한 회색
      borderUpColor: '#71717a',
      borderDownColor: '#52525b',
      wickUpColor: '#71717a',
      wickDownColor: '#52525b',
    });

    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // 거래 마커 추가
    // 롱: 초록 계열 / 숏: 빨강 계열
    // 익절(TP): O / 손절(SL): X
    const markers: SeriesMarker<Time>[] = result.trades.flatMap(trade => {
      const entryTime = (new Date(trade.entryTime).getTime() / 1000) as Time;
      const exitTime = (new Date(trade.exitTime).getTime() / 1000) as Time;
      const isTP = trade.exitReason === 'TP';  // TP/SL 기준으로 판단
      const isLong = trade.direction === 'long';

      // 진입 색상: 롱=초록, 숏=빨강
      const entryColor = isLong ? '#22c55e' : '#ef4444';

      // 청산 색상: 롱=초록, 숏=빨강 (방향 기준)
      // 청산 텍스트: 익절(TP)=O, 손절(SL)=X
      const exitColor = isLong ? '#4ade80' : '#f87171';
      const exitText = isTP ? 'O' : 'X';

      return [
        {
          time: entryTime,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: entryColor,
          shape: isLong ? 'arrowUp' : 'arrowDown',
          size: 0.7,
        } as SeriesMarker<Time>,
        {
          time: exitTime,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: exitColor,
          shape: 'circle',
          text: exitText,
          size: 0.5,
        } as SeriesMarker<Time>,
      ];
    });

    // 마커를 시간순으로 정렬 (v5 요구사항)
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    // v5에서 마커 설정 - createSeriesMarkers 사용
    const seriesMarkers = createSeriesMarkers(candleSeries, markers);

    // 리사이즈 핸들러
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    // 전체 범위 표시
    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [candles, result.trades]);

  // 선택된 거래로 이동
  useEffect(() => {
    if (selectedTrade && chartRef.current) {
      const entryTime = new Date(selectedTrade.entryTime).getTime() / 1000;
      chartRef.current.timeScale().setVisibleRange({
        from: (entryTime - 3600 * 24) as any,
        to: (entryTime + 3600 * 24) as any,
      });
    }
  }, [selectedTrade]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <h2 className="text-lg font-semibold text-white mb-4">거래 차트</h2>
      <div ref={containerRef} className="w-full" />
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span style={{ color: '#22c55e' }}>▲</span> 롱 진입
        </span>
        <span className="flex items-center gap-1">
          <span style={{ color: '#ef4444' }}>▼</span> 숏 진입
        </span>
        <span className="flex items-center gap-1">
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>O</span> 롱 TP
        </span>
        <span className="flex items-center gap-1">
          <span style={{ color: '#4ade80', fontWeight: 'bold' }}>X</span> 롱 SL
        </span>
        <span className="flex items-center gap-1">
          <span style={{ color: '#f87171', fontWeight: 'bold' }}>O</span> 숏 TP
        </span>
        <span className="flex items-center gap-1">
          <span style={{ color: '#f87171', fontWeight: 'bold' }}>X</span> 숏 SL
        </span>
      </div>
    </div>
  );
}
