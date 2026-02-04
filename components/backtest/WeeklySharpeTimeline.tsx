'use client';

import { useEffect, useRef, memo } from 'react';
import { createChart, IChartApi, LineData, Time, LineSeries, ISeriesApi } from 'lightweight-charts';

interface WeeklySharpeTimelineProps {
  strategies: {
    strategyId: number;
    strategyName: string;
    strategyType: string;
    color: string;
    rollingSharpe: Array<{ timestamp: number; sharpe: number }>;
  }[];
  highlightedStrategyId: number | null;
  leverage: number;
  onStrategyClick?: (strategyId: number) => void;
}

const WeeklySharpeTimeline = memo(function WeeklySharpeTimeline({
  strategies,
  highlightedStrategyId,
  leverage,
  onStrategyClick,
}: WeeklySharpeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);

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

  // Rolling Sharpe 업데이트
  useEffect(() => {
    if (!chartRef.current) {
      console.log('[WeeklySharpeTimeline] No chart ref');
      return;
    }

    if (strategies.length === 0) {
      console.log('[WeeklySharpeTimeline] No strategies');
      return;
    }

    console.log('[WeeklySharpeTimeline] Drawing', strategies.length, 'strategies');

    // 기존 시리즈 모두 제거
    const chart = chartRef.current;
    seriesRef.current.forEach((series) => {
      try {
        chart.removeSeries(series);
      } catch (e) {
        // Series already removed
      }
    });
    seriesRef.current = [];

    let minTime: number | null = null;
    let maxTime: number | null = null;

    strategies.forEach((strategy) => {
      if (!strategy.rollingSharpe || strategy.rollingSharpe.length === 0) return;

      const lineData: LineData[] = strategy.rollingSharpe.map((data) => ({
        time: Math.floor(data.timestamp / 1000) as Time,
        value: data.sharpe,
      }));

      // 전체 시간 범위 계산
      if (lineData.length > 0) {
        const firstTime = lineData[0].time as number;
        const lastTime = lineData[lineData.length - 1].time as number;
        if (minTime === null || firstTime < minTime) minTime = firstTime;
        if (maxTime === null || lastTime > maxTime) maxTime = lastTime;
      }

      const series = chart.addSeries(LineSeries, {
        color: strategy.color,
        lineWidth: highlightedStrategyId === strategy.strategyId ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: strategy.strategyName,
      });

      series.setData(lineData);
      seriesRef.current.push(series);
    });

    // 전체 데이터가 보이도록 시간 범위 설정
    if (minTime !== null && maxTime !== null) {
      chart.timeScale().setVisibleRange({
        from: minTime as Time,
        to: maxTime as Time,
      });
    }
    chart.timeScale().fitContent();
  }, [strategies, highlightedStrategyId]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-zinc-400">일별 Rolling Sharpe (14일) 타임라인 (최근 12주)</h3>
          <p className="text-xs text-zinc-600">레버리지와 무관한 전략 본질 평가</p>
        </div>
        {strategies.length > 0 && (
          <span className="text-xs text-zinc-500">
            {strategies.length}개 전략 비교 중
          </span>
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {strategies.map((strategy) => {
          if (!strategy.rollingSharpe || strategy.rollingSharpe.length === 0) return null;

          const avgSharpe = strategy.rollingSharpe.reduce((sum, w) => sum + w.sharpe, 0) / strategy.rollingSharpe.length;
          const latestSharpe = strategy.rollingSharpe[strategy.rollingSharpe.length - 1].sharpe;

          return (
            <button
              key={strategy.strategyId}
              onClick={() => onStrategyClick?.(strategy.strategyId)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                highlightedStrategyId === strategy.strategyId
                  ? 'bg-zinc-800 ring-1 ring-zinc-700'
                  : 'hover:bg-zinc-800/50'
              }`}
            >
              <span
                className="w-3 h-0.5 rounded"
                style={{ backgroundColor: strategy.color }}
              />
              <span className="text-zinc-300">{strategy.strategyName}</span>
              <span className={`text-xs ${latestSharpe >= 1 ? 'text-green-400' : latestSharpe >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                최근: {latestSharpe.toFixed(2)}
              </span>
              <span className="text-zinc-500 text-xs">
                평균: {avgSharpe.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 차트 컨테이너 */}
      {strategies.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] text-zinc-500">
          <div className="text-center">
            <div className="text-2xl mb-2">📈</div>
            <div>일별 Rolling Sharpe 데이터를 불러오는 중...</div>
          </div>
        </div>
      ) : (
        <div className="relative w-full h-[400px]">
          {/* 배경 색상 영역 */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="h-full w-full"
              style={{
                background: 'linear-gradient(to top, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.08) 20%, transparent 20%, transparent 60%, rgba(34, 197, 94, 0.08) 60%, rgba(34, 197, 94, 0.08) 80%, transparent 80%)'
              }}
            />
          </div>
          <div ref={containerRef} className="w-full h-full relative z-10" />
        </div>
      )}

      {/* 설명 */}
      <div className="mt-2 text-xs text-zinc-500">
        매일 최근 14일의 Sharpe Ratio를 계산하여 표시.
        <span className="ml-2 text-red-400">빨간 구간: 음수 (손실)</span>
        <span className="ml-2 text-green-400">초록 구간: 2.0~3.0 (목표)</span>
      </div>
    </div>
  );
});

export default WeeklySharpeTimeline;
