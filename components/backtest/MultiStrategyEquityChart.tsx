'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, LineData, Time, LineSeries } from 'lightweight-charts';
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

export default function MultiStrategyEquityChart({
  strategies,
  highlightedStrategyId,
  leverage,
  onStrategyClick,
}: MultiStrategyEquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<number, any>>(new Map());

  // 최근 12주 필터링된 데이터 캐싱 (성능 최적화)
  const filteredDataCache = useMemo(() => {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const WEEKS_TO_SHOW = 12;
    const cache = new Map<number, EquityPoint[]>();

    strategies.forEach((strategy) => {
      if (strategy.equityCurve.length === 0) return;

      const lastPoint = strategy.equityCurve[strategy.equityCurve.length - 1];
      const endTime = typeof lastPoint.timestamp === 'number'
        ? lastPoint.timestamp
        : new Date(lastPoint.timestamp).getTime();
      const startTime = endTime - WEEKS_TO_SHOW * WEEK_MS;

      const filteredCurve = strategy.equityCurve.filter((point) => {
        const timestamp = typeof point.timestamp === 'number'
          ? point.timestamp
          : new Date(point.timestamp).getTime();
        return timestamp >= startTime;
      });

      cache.set(strategy.strategyId, filteredCurve);
    });

    return cache;
  }, [strategies]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 차트 생성
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
        mode: 1, // Normal crosshair
      },
    });

    chartRef.current = chart;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !chartRef.current) return;
      const { width, height } = entries[0].contentRect;
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

  // 전략 equity curve 업데이트
  useEffect(() => {
    if (!chartRef.current || strategies.length === 0) return;

    const initialCapital = 1000;

    // 기존 시리즈 제거
    seriesMapRef.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch (e) {
        // ignore
      }
    });
    seriesMapRef.current.clear();

    // 최근 12주 범위 계산
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const WEEKS_TO_SHOW = 12;

    // 각 전략의 라인 시리즈 생성
    strategies.forEach((strategy) => {
      if (strategy.equityCurve.length === 0) return;

      // 캐시에서 필터링된 데이터 가져오기 (성능 최적화)
      const filteredEquityCurve = filteredDataCache.get(strategy.strategyId);

      if (!filteredEquityCurve || filteredEquityCurve.length === 0) return;

      const lineSeries = chartRef.current!.addSeries(LineSeries, {
        color: strategy.color,
        lineWidth: highlightedStrategyId === strategy.strategyId ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: strategy.strategyName,
      });

      // 12주 시작점을 기준으로 정규화 (1000 = 100%)
      const weekStartEquity = filteredEquityCurve[0].equity;

      // Equity curve를 레버리지 적용하여 LineData로 변환 (퍼센트 단위)
      const lineData: LineData[] = filteredEquityCurve.map((point) => {
        // 12주 시작점 대비 수익률 계산
        const returnPct = ((point.equity - weekStartEquity) / weekStartEquity);
        const leveragedReturn = returnPct * leverage;

        // 퍼센트로 표시 (0% 기준)
        const returnPercent = leveragedReturn * 100;

        // 파산 방지: -100% 이하로 떨어지지 않도록 (파산 시 -100%)
        const clampedReturn = Math.max(-100, returnPercent);

        // timestamp를 number로 변환 (string일 수도 있음)
        const timestamp = typeof point.timestamp === 'number'
          ? point.timestamp
          : new Date(point.timestamp).getTime();

        return {
          time: Math.floor(timestamp / 1000) as Time,
          value: clampedReturn,
        };
      });

      lineSeries.setData(lineData);
      seriesMapRef.current.set(strategy.strategyId, lineSeries);
    });

    // 차트 시간축 맞춤
    chartRef.current.timeScale().fitContent();
  }, [filteredDataCache, strategies, leverage, highlightedStrategyId]);

  // 하이라이트 변경 시 라인 두께 업데이트
  useEffect(() => {
    seriesMapRef.current.forEach((series, strategyId) => {
      series.applyOptions({
        lineWidth: highlightedStrategyId === strategyId ? 3 : 2,
      });
    });
  }, [highlightedStrategyId]);

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

          // 캐시에서 필터링된 데이터 가져오기 (성능 최적화)
          const filteredCurve = filteredDataCache.get(strategy.strategyId);

          if (!filteredCurve || filteredCurve.length === 0) return null;

          const initialEquity = filteredCurve[0].equity;
          const finalEquity = filteredCurve[filteredCurve.length - 1].equity;
          const returnPct = (finalEquity - initialEquity) / initialEquity;
          const leveragedReturn = returnPct * leverage;
          const baseCapital = 1000; // 초기 자본
          const leveragedEquity = baseCapital * (1 + leveragedReturn);
          const pnlPercent = leveragedReturn * 100;

          // 파산 여부 확인 (equity가 0 이하)
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
              <span className={isBankrupt ? 'text-red-500 font-bold' : pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                {isBankrupt ? '파산 💀' : `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 차트 컨테이너 */}
      <div ref={containerRef} className="w-full h-[500px]" />
    </div>
  );
}
