'use client';

import { memo, RefObject } from 'react';

export interface MeasureBoxData {
  left: number;
  top: number;
  width: number;
  height: number;
  priceDiff: number;
  pricePercent: number;
  bars: number;
  timeRange: string;
  isPreview?: boolean;
}

interface MeasurementBoxProps {
  measureBox: MeasureBoxData | null;
  containerRef?: RefObject<HTMLDivElement | null>;
}

/**
 * 차트 측정 도구 박스 컴포넌트
 * 가격 변화, 퍼센트, 바 개수, 시간 범위 표시
 */
const MeasurementBox = memo(({ measureBox, containerRef }: MeasurementBoxProps) => {
  if (!measureBox) return null;

  const { left, top, width, height, priceDiff, pricePercent, bars, timeRange, isPreview } = measureBox;
  const isPositive = pricePercent >= 0;
  // 상승=시안, 하락=빨강
  const boxColor = isPositive ? '34, 211, 238' : '239, 68, 68'; // cyan-400 : red-500

  // 툴팁이 차트 밖으로 나가는지 확인
  const TOOLTIP_HEIGHT = 40;
  const hasSpaceAbove = top > TOOLTIP_HEIGHT + 10;
  const hasSpaceBelow = containerRef?.current
    ? (containerRef.current.clientHeight - (top + height)) > TOOLTIP_HEIGHT + 10
    : true;

  // 툴팁 위치 결정
  let tooltipPosition: React.CSSProperties;
  if (isPositive) {
    // 플러스: 위에 공간있으면 위에, 없으면 박스 안쪽 상단
    tooltipPosition = hasSpaceAbove
      ? { bottom: '100%', marginBottom: '4px' }
      : { top: '4px' };
  } else {
    // 마이너스: 아래 공간있으면 아래, 없으면 박스 안쪽 하단
    tooltipPosition = hasSpaceBelow
      ? { top: '100%', marginTop: '4px' }
      : { bottom: '4px' };
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: isPreview ? `rgba(${boxColor}, 0.08)` : `rgba(${boxColor}, 0.15)`,
        border: isPreview ? `1px dashed rgba(${boxColor}, 0.5)` : `2px solid rgba(${boxColor}, 0.7)`,
        pointerEvents: 'none',
        zIndex: 15,
      }}
    >
      {/* 측정 정보 텍스트 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          ...tooltipPosition,
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: `rgb(${boxColor})`,
          padding: '6px 10px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          zIndex: 12,
          border: `1px solid rgba(${boxColor}, 0.5)`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div>
          {isPositive ? '+' : ''}{pricePercent.toFixed(2)}% (${Math.abs(priceDiff).toFixed(2)})
        </div>
        <div style={{ fontSize: '10px', opacity: 0.7, color: '#9ca3af' }}>
          {bars} 봉 · {timeRange}
        </div>
      </div>
    </div>
  );
});

MeasurementBox.displayName = 'MeasurementBox';

export default MeasurementBox;
