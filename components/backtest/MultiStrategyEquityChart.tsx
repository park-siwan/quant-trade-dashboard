'use client';

import { useEffect, useRef, memo } from 'react';
import { createChart, IChartApi, LineData, Time, LineSeries, ISeriesApi } from 'lightweight-charts';
import { EquityPoint } from '@/lib/backtest-api';

interface StrategyEquityCurve {
  strategyId: number;
  strategyName: string;
  strategyType: string;
  color: string;
  equityCurve: EquityPoint[];
}

interface MultiStrategyEquityChartProps {
  strategies: StrategyEquityCurve[];
  highlightedStrategyId: number | null;
  leverage: number;
  onStrategyClick?: (strategyId: number) => void;
}

const MultiStrategyEquityChart = memo(function MultiStrategyEquityChart({
  strategies,
  highlightedStrategyId,
  leverage,
  onStrategyClick,
}: MultiStrategyEquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([]);

  // 차트 초기화
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 500,
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
      chartRef.current.applyOptions({ width, height: 500 });
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

  // 전략 데이터 업데이트
  useEffect(() => {
    if (!chartRef.current) {
      console.log('[MultiStrategyEquityChart] No chart ref');
      return;
    }

    if (strategies.length === 0) {
      console.log('[MultiStrategyEquityChart] No strategies');
      return;
    }

    console.log('[MultiStrategyEquityChart] Drawing', strategies.length, 'strategies');

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

    // 최근 12주 필터링
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const WEEKS_TO_SHOW = 12;

    strategies.forEach((strategy) => {
      if (strategy.equityCurve.length === 0) return;

      // 최근 12주 데이터만 필터링
      const lastPoint = strategy.equityCurve[strategy.equityCurve.length - 1];
      const endTime = typeof lastPoint.timestamp === 'number'
        ? lastPoint.timestamp
        : new Date(lastPoint.timestamp).getTime();
      const startTime = endTime - WEEKS_TO_SHOW * WEEK_MS;

      const filteredCurve = strategy.equityCurve.filter((point) => {
        const timestamp = typeof point.timestamp === 'number'
          ? point.timestamp
          : new Date(point.timestamp).getTime();
        return timestamp >= startTime && timestamp <= endTime;
      });

      if (filteredCurve.length === 0) return;

      const weekStartEquity = filteredCurve[0].equity;

      // LineData 계산 (레버리지 적용)
      const lineData: LineData[] = filteredCurve.map((point) => {
        const returnPct = ((point.equity - weekStartEquity) / weekStartEquity);
        const leveragedReturn = returnPct * leverage;
        const returnPercent = leveragedReturn * 100;
        const clampedReturn = Math.max(-100, returnPercent);

        const timestamp = typeof point.timestamp === 'number'
          ? point.timestamp
          : new Date(point.timestamp).getTime();

        return {
          time: Math.floor(timestamp / 1000) as Time,
          value: clampedReturn,
        };
      });

      // 시리즈 추가
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

    // 차트 시간축 맞춤
    chart.timeScale().fitContent();
  }, [strategies, leverage, highlightedStrategyId]);

  return (
    <div className="bg-zinc-900 p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-zinc-400">전략 비교 차트</h3>
        {strategies.length > 0 && (
          <span className="text-xs text-zinc-500">
            {strategies.length}개 전략 비교 중
          </span>
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {strategies.map((strategy) => {
          if (strategy.equityCurve.length === 0) return null;

          const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
          const lastPoint = strategy.equityCurve[strategy.equityCurve.length - 1];
          const endTime = typeof lastPoint.timestamp === 'number'
            ? lastPoint.timestamp
            : new Date(lastPoint.timestamp).getTime();
          const startTime = endTime - 12 * WEEK_MS;

          const filteredCurve = strategy.equityCurve.filter((point) => {
            const timestamp = typeof point.timestamp === 'number'
              ? point.timestamp
              : new Date(point.timestamp).getTime();
            return timestamp >= startTime && timestamp <= endTime;
          });

          if (filteredCurve.length === 0) return null;

          const initialEquity = filteredCurve[0].equity;
          const finalEquity = filteredCurve[filteredCurve.length - 1].equity;
          const returnPct = (finalEquity - initialEquity) / initialEquity;
          const leveragedReturn = returnPct * leverage;
          const baseCapital = 1000;
          const leveragedEquity = baseCapital * (1 + leveragedReturn);
          const pnlPercent = leveragedReturn * 100;

          const isBankrupt = leveragedEquity <= 0;

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
              {isBankrupt ? (
                <span className="text-red-400 font-bold text-xs">💀 파산</span>
              ) : (
                <span className={pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 차트 컨테이너 */}
      {strategies.length === 0 ? (
        <div className="flex items-center justify-center h-[500px] text-zinc-500">
          <div className="text-center">
            <div className="text-2xl mb-2">📊</div>
            <div>전략 데이터를 불러오는 중...</div>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="w-full h-[500px]" />
      )}
    </div>
  );
});

export default MultiStrategyEquityChart;
