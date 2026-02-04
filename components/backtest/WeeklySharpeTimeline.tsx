'use client';

import { useEffect, useRef, useMemo } from 'react';
import { createChart, IChartApi, LineData, Time, LineSeries } from 'lightweight-charts';
import { EquityPoint } from '@/lib/backtest-api';

interface StrategyWeeklySharpe {
  strategyId: number;
  strategyName: string;
  color: string;
  weeklySharpe: { week: number; sharpe: number; startDate: number }[];
}

interface WeeklySharpeTimelineProps {
  strategies: {
    strategyId: number;
    strategyName: string;
    strategyType: string;
    color: string;
    equityCurve: EquityPoint[];
  }[];
  highlightedStrategyId: number | null;
  leverage: number;
  onStrategyClick?: (strategyId: number) => void;
}

// 일별 Rolling Sharpe Ratio 계산 (레버리지 무관 - 전략 본질 평가)
function calculateRollingSharpe(equityCurve: EquityPoint[], weeks: number = 12, windowDays: number = 14): { timestamp: number; sharpe: number }[] {
  if (equityCurve.length === 0) return [];

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;

  // 백테스트 데이터의 마지막 시간을 기준으로 (현재 시간이 아님!)
  const lastPoint = equityCurve[equityCurve.length - 1];
  const endTime = typeof lastPoint.timestamp === 'number'
    ? lastPoint.timestamp
    : new Date(lastPoint.timestamp).getTime();
  const startTime = endTime - weeks * WEEK_MS;

  // 최근 12주 데이터만 필터링
  const filteredCurve = equityCurve.filter(point => {
    const timestamp = typeof point.timestamp === 'number'
      ? point.timestamp
      : new Date(point.timestamp).getTime();
    return timestamp >= startTime && timestamp <= endTime;
  });

  if (filteredCurve.length < windowDays + 1) return [];

  const rollingSharpeData: { timestamp: number; sharpe: number }[] = [];

  // 각 시점마다 최근 windowDays일의 Sharpe 계산
  for (let i = windowDays; i < filteredCurve.length; i++) {
    const currentTimestamp = filteredCurve[i].timestamp;
    const currentTime: number = typeof currentTimestamp === 'number'
      ? currentTimestamp
      : new Date(currentTimestamp).getTime();

    const windowStart: number = currentTime - windowDays * DAY_MS;

    // 윈도우 기간의 데이터 추출
    const windowData = filteredCurve.filter((point, idx) => {
      if (idx > i) return false;
      const timestamp = typeof point.timestamp === 'number'
        ? point.timestamp
        : new Date(point.timestamp).getTime();
      return timestamp >= windowStart && timestamp <= currentTime;
    });

    if (windowData.length < 2) {
      rollingSharpeData.push({ timestamp: currentTime, sharpe: 0 });
      continue;
    }

    // 일별 수익률 계산 (레버리지 미적용 - 원본 전략 성과)
    const dailyReturns: number[] = [];
    for (let j = 1; j < windowData.length; j++) {
      const returnPct = ((windowData[j].equity - windowData[j - 1].equity) / windowData[j - 1].equity) * 100;
      dailyReturns.push(returnPct);
    }

    if (dailyReturns.length === 0) {
      rollingSharpeData.push({ timestamp: currentTime, sharpe: 0 });
      continue;
    }

    // 평균 수익률
    const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;

    // 표준편차
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    // Sharpe Ratio (연율화: sqrt(365) ≈ 19.1)
    const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0;

    rollingSharpeData.push({
      timestamp: currentTime,
      sharpe: isFinite(sharpe) ? sharpe : 0,
    });
  }

  return rollingSharpeData;
}

export default function WeeklySharpeTimeline({
  strategies,
  highlightedStrategyId,
  leverage,
  onStrategyClick,
}: WeeklySharpeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef<Map<number, any>>(new Map());

  // 각 전략의 Rolling Sharpe 계산 결과 캐싱 (성능 최적화)
  const rollingSharpeCache = useMemo(() => {
    const cache = new Map<number, { timestamp: number; sharpe: number }[]>();
    strategies.forEach((strategy) => {
      if (strategy.equityCurve.length > 0) {
        const rollingSharpe = calculateRollingSharpe(strategy.equityCurve, 12, 14);
        cache.set(strategy.strategyId, rollingSharpe);
      }
    });
    return cache;
  }, [strategies]);

  useEffect(() => {
    if (!containerRef.current) return;

    // 차트 생성
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

    // Resize observer
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

  // 일별 Rolling Sharpe 업데이트
  useEffect(() => {
    if (!chartRef.current || strategies.length === 0) return;

    // 기존 시리즈 제거
    seriesMapRef.current.forEach((series) => {
      try {
        chartRef.current?.removeSeries(series);
      } catch (e) {
        // ignore
      }
    });
    seriesMapRef.current.clear();

    // 각 전략의 일별 Rolling Sharpe 계산 및 라인 시리즈 생성
    strategies.forEach((strategy) => {
      if (strategy.equityCurve.length === 0) return;

      // 캐시에서 가져오기 (성능 최적화)
      const rollingSharpe = rollingSharpeCache.get(strategy.strategyId);

      if (!rollingSharpe || rollingSharpe.length === 0) return;

      const lineSeries = chartRef.current!.addSeries(LineSeries, {
        color: strategy.color,
        lineWidth: highlightedStrategyId === strategy.strategyId ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: strategy.strategyName,
      });

      // Rolling Sharpe를 LineData로 변환
      const lineData: LineData[] = rollingSharpe.map((data) => ({
        time: Math.floor(data.timestamp / 1000) as Time,
        value: data.sharpe,
      }));

      lineSeries.setData(lineData);
      seriesMapRef.current.set(strategy.strategyId, lineSeries);
    });

    // 차트 시간축 맞춤
    chartRef.current.timeScale().fitContent();
  }, [rollingSharpeCache, strategies, highlightedStrategyId]);

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
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-zinc-400">일별 Rolling Sharpe (14일) 타임라인 (최근 12주)</h3>
          <p className="text-xs text-zinc-600">레버리지와 무관한 전략 본질 평가 · 매끄러운 트렌드 표시</p>
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
          if (strategy.equityCurve.length === 0) return null;

          // 캐시에서 가져오기 (성능 최적화)
          const rollingSharpe = rollingSharpeCache.get(strategy.strategyId) || [];
          const avgSharpe = rollingSharpe.length > 0
            ? rollingSharpe.reduce((sum, w) => sum + w.sharpe, 0) / rollingSharpe.length
            : 0;
          const latestSharpe = rollingSharpe.length > 0 ? rollingSharpe[rollingSharpe.length - 1].sharpe : 0;

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
      <div className="relative w-full h-[400px]">
        {/* 배경 색상 영역: 음수(빨강), 목표 2.0~3.0(초록) */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="h-full w-full"
            style={{
              background: 'linear-gradient(to top, rgba(239, 68, 68, 0.08) 0%, rgba(239, 68, 68, 0.08) 20%, transparent 20%, transparent 60%, rgba(34, 197, 94, 0.08) 60%, rgba(34, 197, 94, 0.08) 80%, transparent 80%)'
            }}
          />
        </div>
        {/* 차트 */}
        <div ref={containerRef} className="w-full h-full relative z-10" />
      </div>

      {/* 설명 */}
      <div className="mt-2 text-xs text-zinc-500">
        매일 최근 14일의 Sharpe Ratio를 계산하여 표시.
        <span className="ml-2 text-red-400">빨간 구간: 음수 (손실)</span>
        <span className="ml-2 text-green-400">초록 구간: 2.0~3.0 (목표)</span>
      </div>
    </div>
  );
}
