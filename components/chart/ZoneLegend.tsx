'use client';

import { ZONE_COLORS } from '@/lib/colors';

interface ZoneLegendProps {
  showLabels: boolean;
  onToggleLabels: () => void;
}

/**
 * 지지/저항 영역 범례 컴포넌트
 * - 우측 상단 고정 위치
 * - 매수세, 매도세, 혼조 표시
 * - 라벨 토글 버튼
 */
export default function ZoneLegend({ showLabels, onToggleLabels }: ZoneLegendProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        right: '90px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 8px',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: '6px',
        backdropFilter: 'blur(4px)',
        zIndex: 20,
        fontSize: '10px',
        fontWeight: 500,
      }}
    >
      {/* 매수세 (초록) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div
          style={{
            width: '12px',
            height: '8px',
            backgroundColor: ZONE_COLORS.SUPPORT.fill,
            border: `1px solid ${ZONE_COLORS.SUPPORT.border}`,
            borderRadius: '2px',
          }}
        />
        <span style={{ color: ZONE_COLORS.SUPPORT.border }}>매수세</span>
      </div>

      {/* 매도세 (빨강) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div
          style={{
            width: '12px',
            height: '8px',
            backgroundColor: ZONE_COLORS.RESISTANCE.fill,
            border: `1px solid ${ZONE_COLORS.RESISTANCE.border}`,
            borderRadius: '2px',
          }}
        />
        <span style={{ color: ZONE_COLORS.RESISTANCE.border }}>매도세</span>
      </div>

      {/* 혼조 (노랑) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <div
          style={{
            width: '12px',
            height: '8px',
            backgroundColor: ZONE_COLORS.CONFLICT.fill,
            border: `1px solid ${ZONE_COLORS.CONFLICT.border}`,
            borderRadius: '2px',
          }}
        />
        <span style={{ color: ZONE_COLORS.CONFLICT.border }}>혼조</span>
      </div>

      {/* 라벨 토글 버튼 */}
      <button
        onClick={onToggleLabels}
        style={{
          marginLeft: '4px',
          padding: '2px 6px',
          backgroundColor: showLabels ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          color: showLabels ? '#fff' : 'rgba(255, 255, 255, 0.5)',
          cursor: 'pointer',
          fontSize: '9px',
          transition: 'all 0.2s',
        }}
        title={showLabels ? '라벨 숨기기' : '라벨 표시'}
      >
        라벨
      </button>
    </div>
  );
}
