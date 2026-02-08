'use client';

import React, { useMemo } from 'react';
import { EquityPoint } from '@/lib/backtest-api';

interface StrategyMiniChartProps {
  equityCurve: EquityPoint[];
  leverage?: number;
}

// 미니 차트 컴포넌트 - 메모이제이션으로 불필요한 재계산 방지
function StrategyMiniChartComponent({ equityCurve, leverage = 1 }: StrategyMiniChartProps) {
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

    // 레버리지 복리 적용: 각 거래의 PnL에 레버리지를 곱해서 누적
    const startEquity = filteredCurve[0].equity;
    let returns: number[];

    if (leverage <= 1) {
      // 1x: 단순 누적 수익률
      returns = filteredCurve.map(p => ((p.equity - startEquity) / startEquity) * 100);
    } else {
      // Nx: 거래별 수익률에 레버리지 곱한 뒤 복리 누적
      let leveragedEquity = startEquity;
      returns = filteredCurve.map((p, i) => {
        if (i === 0) return 0;
        const prevEquity = filteredCurve[i - 1].equity;
        const tradeReturn = (p.equity - prevEquity) / prevEquity;
        leveragedEquity *= (1 + tradeReturn * leverage);
        // 최소 0.01 (청산 방지)
        leveragedEquity = Math.max(leveragedEquity, startEquity * 0.01);
        return ((leveragedEquity - startEquity) / startEquity) * 100;
      });
    }

    const finalReturn = returns[returns.length - 1];
    const color = finalReturn >= 0 ? '#22c55e' : '#ef4444';

    // 실제 데이터 범위 계산
    const actualMax = Math.max(...returns);
    const actualMin = Math.min(...returns);
    const max = Math.max(actualMax, 0.1);
    const min = Math.min(actualMin, -0.1);
    const range = max - min || 0.2;

    // 점들의 좌표 계산 (viewBox: 0 0 120 44)
    const points = returns.map((val, i) => {
      const x = 2 + (i / (returns.length - 1)) * 116;
      const y = 40 - ((val - min) / range) * 36;
      return { x, y, val };
    });

    // SVG 경로
    const pathD = points.map((p, i) =>
      `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
    ).join(' ');

    const zeroY = 40 - ((0 - min) / range) * 36;

    // 영역 채우기용 경로
    const areaD = pathD + ` L ${points[points.length - 1].x} 44 L ${points[0].x} 44 Z`;

    return { pathD, areaD, color, finalReturn, points, zeroY };
  }, [equityCurve, leverage]);

  if (!chartData) {
    return (
      <div className='w-full h-10 flex items-center justify-center text-[8px] text-zinc-600'>
        -
      </div>
    );
  }

  const { pathD, areaD, color, finalReturn, points, zeroY } = chartData;

  return (
    <div className='w-full'>
      <svg width="100%" height="48" viewBox="0 0 120 44" className="w-full" preserveAspectRatio="none">
        {/* 영역 채우기 */}
        <path d={areaD} fill={color} fillOpacity="0.08" />
        {/* 0선 */}
        <line
          x1="2"
          y1={zeroY}
          x2="118"
          y2={zeroY}
          stroke="#52525b"
          strokeWidth="0.4"
          strokeDasharray="2,2"
        />
        {/* 데이터 선 */}
        <path d={pathD} stroke={color} strokeWidth="1.2" fill="none" />
        {/* 끝점 표시 */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="1.5"
          fill={color}
        />
      </svg>
      {/* 수익률 표시 */}
      <div className='text-right text-[9px] -mt-1 pr-1' style={{ color }}>
        {finalReturn >= 0 ? '+' : ''}{finalReturn.toFixed(1)}%
      </div>
    </div>
  );
}

// React.memo로 래핑 - equityCurve가 변경될 때만 리렌더
export const StrategyMiniChart = React.memo(StrategyMiniChartComponent, (prev, next) => {
  if (prev.leverage !== next.leverage) return false;
  // equityCurve 길이와 마지막 값이 같으면 리렌더 스킵
  if (prev.equityCurve === next.equityCurve) return true;
  if (!prev.equityCurve || !next.equityCurve) return false;
  if (prev.equityCurve.length !== next.equityCurve.length) return false;

  const prevLast = prev.equityCurve[prev.equityCurve.length - 1];
  const nextLast = next.equityCurve[next.equityCurve.length - 1];
  return prevLast?.equity === nextLast?.equity;
});
