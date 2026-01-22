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
      upColor: '#52525b',
      downColor: '#3f3f46',
      borderUpColor: '#71717a',
      borderDownColor: '#52525b',
      wickUpColor: '#71717a',
      wickDownColor: '#52525b',
    });

    candleSeries.setData(candles);
    candleSeriesRef.current = candleSeries;

    // 마커 생성: 실제 가격 위치에 표시
    const markers: SeriesMarker<Time>[] = [];

    result.trades.forEach(trade => {
      // 거래 시간이 UTC가 아닌 경우 'Z'를 붙여서 UTC로 변환
      const entryTimeStr = trade.entryTime.endsWith('Z') ? trade.entryTime : trade.entryTime + 'Z';
      const exitTimeStr = trade.exitTime.endsWith('Z') ? trade.exitTime : trade.exitTime + 'Z';
      const entryTime = (new Date(entryTimeStr).getTime() / 1000) as Time;
      const exitTime = (new Date(exitTimeStr).getTime() / 1000) as Time;
      const isLong = trade.direction === 'long';
      const isProfit = trade.pnl > 0;

      // 청산가가 진입가보다 높은지 (차트상 위치 결정용)
      const exitHigherThanEntry = trade.exitPrice > trade.entryPrice;

      // 진입 마커: 롱=아래, 숏=위
      markers.push({
        time: entryTime,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: isLong ? '#22c55e' : '#ef4444',
        shape: 'circle',
        text: isLong ? 'L' : 'S',
        size: 1,
      } as SeriesMarker<Time>);

      // 청산 마커: 청산가가 진입가보다 높으면 위, 낮으면 아래
      // 색상: 실제 PnL 기준 (초록=익절, 빨강=손절)
      markers.push({
        time: exitTime,
        position: exitHigherThanEntry ? 'aboveBar' : 'belowBar',
        color: isProfit ? '#22c55e' : '#ef4444',
        shape: 'square',
        text: isProfit ? '✓' : '✕',
        size: 1,
      } as SeriesMarker<Time>);
    });

    // 마커를 시간순으로 정렬
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(candleSeries, markers);

    // 리사이즈 핸들러
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
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
        from: (entryTime - 3600 * 12) as any,
        to: (entryTime + 3600 * 12) as any,
      });
    }
  }, [selectedTrade]);

  // 통계 계산
  const longTrades = result.trades.filter(t => t.direction === 'long');
  const shortTrades = result.trades.filter(t => t.direction === 'short');
  const profitTrades = result.trades.filter(t => t.pnl > 0);
  const lossTrades = result.trades.filter(t => t.pnl <= 0);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">거래 차트</h2>
        <div className="flex gap-4 text-xs">
          <span className="text-zinc-400">
            롱 <span className="text-green-400">{longTrades.length}</span> |
            숏 <span className="text-red-400">{shortTrades.length}</span>
          </span>
          <span className="text-zinc-400">
            익절 <span className="text-green-400">{profitTrades.length}</span> |
            손절 <span className="text-red-400">{lossTrades.length}</span>
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
      <div className="mt-3 flex flex-wrap gap-6 text-xs text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 flex items-center justify-center text-[8px] text-white font-bold">L</span> 롱 진입
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 flex items-center justify-center text-[8px] text-white font-bold">S</span> 숏 진입
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-green-400 font-bold">✓</span> 익절
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-red-400 font-bold">✕</span> 손절
        </span>
        <span className="text-zinc-500 italic">
          (위=가격상승, 아래=가격하락)
        </span>
      </div>
    </div>
  );
}
