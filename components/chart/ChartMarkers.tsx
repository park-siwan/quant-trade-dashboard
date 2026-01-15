'use client';

import { memo } from 'react';
import { COLORS, CHART_COLORS, rgba } from '@/lib/colors';

// 크로스오버 마커 데이터
export interface CrossoverMarkerData {
  x: number;
  y: number;
  type: 'golden_cross' | 'dead_cross';
  isFiltered?: boolean;
}

// 시그널 마커 데이터
export interface SignalMarkerData {
  x: number;
  y: number;
  type: string;
  label: string;
  color: string;
  position: 'above' | 'below';
}

// BOS/CHoCH 마커 데이터
export interface StructureMarkerData {
  x: number;
  y: number;
  type: 'bos' | 'choch';
  direction: 'bullish' | 'bearish';
  strength?: 'strong' | 'weak';
}

interface CrossoverMarkersProps {
  markers: CrossoverMarkerData[];
}

interface SignalMarkersProps {
  markers: SignalMarkerData[];
}

interface StructureMarkersProps {
  markers: StructureMarkerData[];
}

// 마커 색상 상수
const MARKER_COLORS = {
  GOLDEN_CROSS: COLORS.BULLISH,  // lime-400
  DEAD_CROSS: COLORS.BEARISH,   // red-400
  FILTERED: COLORS.FILTERED,    // gray-400
} as const;

/**
 * 크로스오버 마커 (골든크로스/데드크로스)
 */
export const CrossoverMarkers = memo(({ markers }: CrossoverMarkersProps) => {
  if (markers.length === 0) return null;

  return (
    <>
      {markers.map((marker, index) => (
        <div
          key={`crossover-${index}`}
          style={{
            position: 'absolute',
            left: `${marker.x}px`,
            top: `${marker.y}px`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 20,
            fontSize: '16px',
            fontWeight: 'bold',
            color: marker.isFiltered
              ? MARKER_COLORS.FILTERED
              : marker.type === 'golden_cross'
              ? MARKER_COLORS.GOLDEN_CROSS
              : MARKER_COLORS.DEAD_CROSS,
            textShadow: `0 0 4px ${CHART_COLORS.SHADOW_DARK}, 0 0 8px ${CHART_COLORS.SHADOW_MEDIUM}`,
            opacity: marker.isFiltered ? 0.6 : 1,
          }}
        >
          ✕
        </div>
      ))}
    </>
  );
});
CrossoverMarkers.displayName = 'CrossoverMarkers';

/**
 * CVD+OI 시그널 마커
 */
export const SignalMarkers = memo(({ markers }: SignalMarkersProps) => {
  if (markers.length === 0) return null;

  return (
    <>
      {markers.map((marker, idx) => (
        <div
          key={`signal-${idx}`}
          className="absolute pointer-events-none"
          style={{
            left: `${marker.x}px`,
            top: `${marker.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded backdrop-blur-sm"
            style={{
              color: marker.color,
              backgroundColor: `${marker.color.replace('0.9', '0.15')}`,
              border: `1px solid ${marker.color}`,
              textShadow: `0 0 4px ${marker.color}`,
            }}
          >
            {marker.label}
          </span>
        </div>
      ))}
    </>
  );
});
SignalMarkers.displayName = 'SignalMarkers';

/**
 * BOS/CHoCH 구조 마커
 */
export const StructureMarkers = memo(({ markers }: StructureMarkersProps) => {
  if (markers.length === 0) return null;

  return (
    <>
      {markers.map((marker, idx) => {
        const isBullish = marker.direction === 'bullish';
        const isChoch = marker.type === 'choch';
        const isStrong = marker.strength === 'strong';

        const baseColor = isBullish ? COLORS.BULLISH : COLORS.SHORT;
        const bgOpacity = isChoch ? 0.3 : 0.2;
        const textColor = isBullish ? 'text-lime-400' : 'text-red-400';

        return (
          <div
            key={`struct-${idx}`}
            className="absolute pointer-events-none"
            style={{
              left: `${marker.x}px`,
              top: `${marker.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span
              className={`text-xs font-bold px-1.5 py-0.5 rounded ${textColor} ${
                isStrong ? 'border-2' : 'border'
              }`}
              style={{
                backgroundColor: rgba(baseColor, bgOpacity),
                borderColor: rgba(baseColor, 0.6),
              }}
            >
              {isChoch ? 'CHoCH' : 'BOS'}
            </span>
          </div>
        );
      })}
    </>
  );
});
StructureMarkers.displayName = 'StructureMarkers';

// 시그널 타입별 설정
export const SIGNAL_CONFIG: Record<
  string,
  { label: string; color: string; position: 'above' | 'below' }
> = {
  REAL_BULL: { label: '↑매수세', color: CHART_COLORS.SIGNAL_BULLISH, position: 'below' },
  SHORT_TRAP: { label: '⚠숏탈출', color: CHART_COLORS.SIGNAL_BULLISH, position: 'above' },
  PUMP_DUMP: { label: '⚠고점', color: CHART_COLORS.SIGNAL_ORANGE, position: 'above' },
  MORE_DROP: { label: '↓매도세', color: CHART_COLORS.SIGNAL_BEARISH, position: 'above' },
  LONG_ENTRY: { label: '★롱타점', color: CHART_COLORS.SIGNAL_CYAN, position: 'below' },
};
