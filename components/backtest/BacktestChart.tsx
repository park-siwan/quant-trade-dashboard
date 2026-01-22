'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, CandlestickData, CandlestickSeries } from 'lightweight-charts';
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

    // 캔들 시리즈
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // 거래 마커 추가
    const markers = result.trades.flatMap(trade => {
      const entryTime = new Date(trade.entryTime).getTime() / 1000;
      const exitTime = new Date(trade.exitTime).getTime() / 1000;
      const isWin = trade.pnl > 0;

      return [
        {
          time: entryTime as any,
          position: trade.direction === 'long' ? 'belowBar' : 'aboveBar',
          color: trade.direction === 'long' ? '#22c55e' : '#ef4444',
          shape: trade.direction === 'long' ? 'arrowUp' : 'arrowDown',
          text: trade.direction === 'long' ? 'L' : 'S',
        },
        {
          time: exitTime as any,
          position: trade.direction === 'long' ? 'aboveBar' : 'belowBar',
          color: isWin ? '#22c55e' : '#ef4444',
          shape: 'circle',
          text: isWin ? 'TP' : 'SL',
        },
      ];
    });

    // v5에서는 setMarkers 대신 attachPrimitive 또는 createSeries와 markers 옵션 사용
    // 임시로 타입 캐스팅으로 해결
    (candleSeries as any).setMarkers?.(markers) || chart.timeScale().fitContent();

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
      <div className="mt-2 flex gap-4 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          <span className="text-green-400">▲</span> 롱 진입
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400">▼</span> 숏 진입
        </span>
        <span className="flex items-center gap-1">
          <span className="text-green-400">●</span> TP 청산
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400">●</span> SL 청산
        </span>
      </div>
    </div>
  );
}
