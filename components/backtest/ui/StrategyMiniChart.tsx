'use client';

import React, { useMemo } from 'react';
import { EquityPoint } from '@/lib/backtest-api';

interface StrategyMiniChartProps {
  equityCurve: EquityPoint[];
}

// 미니 차트 컴포넌트 - 메모이제이션으로 불필요한 재계산 방지
function StrategyMiniChartComponent({ equityCurve }: StrategyMiniChartProps) {
  // 차트 데이터 메모이제이션
  const chartData = useMemo(() => {
    if (!equityCurve || equityCurve.length === 0) {
      return null;
    }

    // 최근 12주 데이터 필터링
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const WEEKS_TO_SHOW = 12;
    const lastPoint = equityCurve[equityCurve.length - 1];
    const endTime = typeof lastPoint.timestamp === 'number'
      ? lastPoint.timestamp
      : new Date(lastPoint.timestamp).getTime();
    const startTime = endTime - WEEKS_TO_SHOW * WEEK_MS;

    const filteredCurve = equityCurve.filter((point) => {
      const timestamp = typeof point.timestamp === 'number'
        ? point.timestamp
        : new Date(point.timestamp).getTime();
      return timestamp >= startTime;
    });

    if (filteredCurve.length < 2) {
      return null;
    }

    // 12주 시작점 기준 수익률 계산
    const startEquity = filteredCurve[0].equity;
    const returns = filteredCurve.map(p => ((p.equity - startEquity) / startEquity) * 100);

    const finalReturn = returns[returns.length - 1];
    const color = finalReturn >= 0 ? '#22c55e' : '#ef4444';

    // 실제 데이터 범위 계산
    const actualMax = Math.max(...returns);
    const actualMin = Math.min(...returns);
    const max = Math.max(actualMax, 0.1);
    const min = Math.min(actualMin, -0.1);
    const range = max - min || 0.2;

    // 점들의 좌표 계산
    const points = returns.map((val, i) => {
      const x = 2 + (i / (returns.length - 1)) * 36;
      const y = 18 - ((val - min) / range) * 14;
      return { x, y, val };
    });

    // SVG 경로
    const pathD = points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    const zeroY = 18 - ((0 - min) / range) * 14;

    return { pathD, color, finalReturn, points, zeroY };
  }, [equityCurve]);

  if (!chartData) {
    return (
      <div className='w-full h-8 flex items-center justify-center text-[7px] text-zinc-600'>
        -
      </div>
    );
  }

  const { pathD, color, finalReturn, points, zeroY } = chartData;

  return (
    <div className='w-full'>
      <svg width="100%" height="20" viewBox="0 0 40 20" className="w-full">
        {/* 0선 */}
        <line
          x1="2"
          y1={zeroY}
          x2="38"
          y2={zeroY}
          stroke="#52525b"
          strokeWidth="0.3"
          strokeDasharray="1,1"
        />
        {/* 데이터 선 */}
        <path d={pathD} stroke={color} strokeWidth="1" fill="none" />
        {/* 끝점 표시 */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="1"
          fill={color}
        />
      </svg>
      {/* 수익률 표시 */}
      <div className='text-center text-[8px] -mt-0.5' style={{ color }}>
        {finalReturn >= 0 ? '+' : ''}{finalReturn.toFixed(1)}%
      </div>
    </div>
  );
}

// React.memo로 래핑 - equityCurve가 변경될 때만 리렌더
export const StrategyMiniChart = React.memo(StrategyMiniChartComponent, (prev, next) => {
  // equityCurve 길이와 마지막 값이 같으면 리렌더 스킵
  if (prev.equityCurve === next.equityCurve) return true;
  if (!prev.equityCurve || !next.equityCurve) return false;
  if (prev.equityCurve.length !== next.equityCurve.length) return false;

  const prevLast = prev.equityCurve[prev.equityCurve.length - 1];
  const nextLast = next.equityCurve[next.equityCurve.length - 1];
  return prevLast?.equity === nextLast?.equity;
});
