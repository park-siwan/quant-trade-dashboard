'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, AreaSeries, LineSeries } from 'lightweight-charts';
import { EquityPoint } from '@/lib/backtest-api';

interface EquityCurveProps {
  data: EquityPoint[];
  initialCapital: number;
}

export default function EquityCurve({ data, initialCapital }: EquityCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 200,
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
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

    // 자산 곡선
    const equitySeries = chart.addSeries(AreaSeries, {
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.3)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineWidth: 2,
    });

    const equityData = data.map(point => ({
      time: new Date(point.timestamp).getTime() / 1000 as any,
      value: point.equity,
    }));

    equitySeries.setData(equityData);

    // 초기 자본 기준선
    const baselineSeries = chart.addSeries(LineSeries, {
      color: '#71717a',
      lineWidth: 1,
      lineStyle: 2, // dashed
    });

    baselineSeries.setData([
      { time: equityData[0].time, value: initialCapital },
      { time: equityData[equityData.length - 1].time, value: initialCapital },
    ]);

    // 리사이즈
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
  }, [data, initialCapital]);

  const finalEquity = data[data.length - 1]?.equity || initialCapital;
  const pnl = finalEquity - initialCapital;
  const pnlPercent = (pnl / initialCapital) * 100;

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">자산 곡선</h2>
        <div className="text-sm">
          <span className="text-zinc-400">최종: </span>
          <span className={`font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            ${finalEquity.toFixed(0)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
