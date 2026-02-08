'use client';

import { useEffect, useRef, memo, useMemo } from 'react';
import { createChart, IChartApi, LineData, Time, LineSeries, ISeriesApi } from 'lightweight-charts';

interface AvgSharpeChartProps {
  strategies: {
    strategyId: number;
    strategyName: string;
    strategyType: string;
    color: string;
    rollingSharpe: Array<{ timestamp: number; sharpe: number }>;
  }[];
  highlightedStrategyId: number | null;
  onStrategyClick?: (strategyId: number) => void;
}

const AvgSharpeChart = memo(function AvgSharpeChart({
  strategies,
  highlightedStrategyId,
  onStrategyClick,
}: AvgSharpeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  // 전략별 누적 평균 데이터 계산
  const strategyAvgData = useMemo(() => {
    return strategies
      .filter(s => s.rollingSharpe && s.rollingSharpe.length > 0)
      .map(s => {
        let cumSum = 0;
        const cumulativeAvg: LineData[] = s.rollingSharpe.map((d, i) => {
          cumSum += d.sharpe;
          return {
            time: Math.floor(d.timestamp / 1000) as Time,
            value: cumSum / (i + 1),
          };
        });

        const finalAvg = cumSum / s.rollingSharpe.length;
        const latestSharpe = s.rollingSharpe[s.rollingSharpe.length - 1].sharpe;

        return {
          strategyId: s.strategyId,
          name: s.strategyName,
          color: s.color,
          data: cumulativeAvg,
          finalAvg,
          latestSharpe,
        };
      });
  }, [strategies]);

  // 차트 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#18181b' },
        textColor: '#71717a',
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
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
      },
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !chartRef.current) return;
      const { width } = entries[0].contentRect;
      chartRef.current.applyOptions({ width, height: 400 });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // 데이터 업데이트
  useEffect(() => {
    if (!chartRef.current || strategyAvgData.length === 0) return;

    const chart = chartRef.current;
    seriesRef.current.forEach((series) => {
      try { chart.removeSeries(series); } catch {}
    });
    seriesRef.current = [];

    // 전략별 누적 평균 라인
    strategyAvgData.forEach((s) => {
      const series = chart.addSeries(LineSeries, {
        color: s.color,
        lineWidth: highlightedStrategyId === s.strategyId ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: s.name,
      });
      series.setData(s.data);
      seriesRef.current.push(series);
    });

    // 0 기준선
    if (strategyAvgData.length > 0 && strategyAvgData[0].data.length > 0) {
      const allData = strategyAvgData.flatMap(s => s.data);
      const firstTime = allData.reduce((min, d) => Math.min(min, d.time as number), Infinity);
      const lastTime = allData.reduce((max, d) => Math.max(max, d.time as number), -Infinity);

      const zeroLine = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      zeroLine.setData([
        { time: firstTime as Time, value: 0 },
        { time: lastTime as Time, value: 0 },
      ]);
      seriesRef.current.push(zeroLine);
    }

    chart.timeScale().fitContent();
  }, [strategyAvgData, highlightedStrategyId]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-zinc-400">전략별 누적 평균 Sharpe 추이</h3>
          <p className="text-xs text-zinc-600">시간이 지남에 따라 각 전략의 평균 Sharpe가 어디로 수렴하는지</p>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {strategyAvgData.map((s) => (
          <button
            key={s.strategyId}
            onClick={() => onStrategyClick?.(s.strategyId)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
              highlightedStrategyId === s.strategyId
                ? 'bg-zinc-800 ring-1 ring-zinc-700'
                : 'hover:bg-zinc-800/50'
            }`}
          >
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-300">{s.name}</span>
            <span className={`font-medium ${s.finalAvg >= 1 ? 'text-green-400' : s.finalAvg >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {s.finalAvg.toFixed(2)}
            </span>
          </button>
        ))}
      </div>

      {/* 차트 */}
      {strategyAvgData.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] text-zinc-500">
          데이터 없음
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-[400px]" />
      )}
    </div>
  );
});

export default AvgSharpeChart;
